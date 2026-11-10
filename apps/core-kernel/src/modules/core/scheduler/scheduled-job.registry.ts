import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SchedulerRegistry } from '@nestjs/schedule';
import { SystemPrismaService } from '../../../db/system-prisma.service';
import { getModuleManifest } from '../modules/module-registry';

const LEASE_SECONDS = 90;
const HEARTBEAT_MS = 30_000;

export interface ScheduledJobDefinition {
  id: string;
  module: string;
  cron: string;
}

export interface ScheduledJobStatus extends ScheduledJobDefinition {
  lastStartedAt: Date | null;
  lastFinishedAt: Date | null;
  lastStatus: 'SUCCEEDED' | 'FAILED' | null;
  lastResult: unknown;
  lastError: string | null;
  nextRun: string | null;
}

interface JobRow {
  job_key: string;
  module_id: string;
  cron_expression: string;
  last_started_at: Date | null;
  last_finished_at: Date | null;
  last_status: 'SUCCEEDED' | 'FAILED' | null;
  last_result: unknown;
  last_error: string | null;
}

@Injectable()
export class ScheduledJobRegistry {
  private readonly logger = new Logger(ScheduledJobRegistry.name);
  private readonly definitions = new Map<string, ScheduledJobDefinition>();

  constructor(
    private readonly system: SystemPrismaService,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  register(definition: ScheduledJobDefinition): void {
    const manifest = getModuleManifest(definition.module);
    if (!manifest) throw new Error(`Scheduler module manifest-д байхгүй: ${definition.module}`);
    if (!manifest.cronJobs?.includes(definition.id)) {
      throw new Error(`Scheduler job manifest-д бүртгэгдээгүй: ${definition.id}`);
    }
    if (this.definitions.has(definition.id)) throw new Error(`Scheduler job давхар бүртгэгдсэн: ${definition.id}`);
    this.definitions.set(definition.id, definition);
  }

  async run<T>(id: string, task: () => Promise<T>): Promise<{ executed: boolean; result?: T }> {
    const definition = this.definitions.get(id);
    if (!definition) throw new Error(`Scheduler job бүртгэгдээгүй: ${id}`);
    const lockToken = randomUUID();
    const claimed = await this.system.$queryRaw<{ job_key: string }[]>`
      INSERT INTO core_scheduled_jobs (
        job_key, module_id, cron_expression, lock_token, lease_until, last_started_at, updated_at
      )
      VALUES (
        ${definition.id}, ${definition.module}, ${definition.cron}, ${lockToken}::uuid,
        now() + (${LEASE_SECONDS}::int * interval '1 second'), now(), now()
      )
      ON CONFLICT (job_key) DO UPDATE
      SET module_id = EXCLUDED.module_id,
          cron_expression = EXCLUDED.cron_expression,
          lock_token = EXCLUDED.lock_token,
          lease_until = EXCLUDED.lease_until,
          last_started_at = EXCLUDED.last_started_at,
          updated_at = now()
      WHERE core_scheduled_jobs.lease_until IS NULL OR core_scheduled_jobs.lease_until <= now()
      RETURNING job_key
    `;
    if (claimed.length === 0) return { executed: false };

    const heartbeat = setInterval(() => {
      void this.system.$executeRaw`
        UPDATE core_scheduled_jobs
        SET lease_until = now() + (${LEASE_SECONDS}::int * interval '1 second'), updated_at = now()
        WHERE job_key = ${id} AND lock_token = ${lockToken}::uuid
      `.catch((error: Error) => this.logger.error(`Scheduler lease сунгах алдаа (${id}): ${error.message}`));
    }, HEARTBEAT_MS);
    heartbeat.unref();

    try {
      const result = await task();
      await this.finish(id, lockToken, 'SUCCEEDED', result, null);
      return { executed: true, result };
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000);
      await this.finish(id, lockToken, 'FAILED', null, message);
      throw error;
    } finally {
      clearInterval(heartbeat);
    }
  }

  async statuses(): Promise<ScheduledJobStatus[]> {
    const rows = await this.system.$queryRaw<JobRow[]>`
      SELECT job_key, module_id, cron_expression, last_started_at, last_finished_at,
             last_status, last_result, last_error
      FROM core_scheduled_jobs
      WHERE job_key = ANY(${[...this.definitions.keys()]})
    `;
    const byId = new Map(rows.map((row) => [row.job_key, row]));
    return [...this.definitions.values()].map((definition) => {
      const row = byId.get(definition.id);
      let nextRun: string | null = null;
      try {
        nextRun = this.scheduler.getCronJob(definition.id).nextDate().toISO();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Scheduler дараагийн ажиллах цаг олдсонгүй (${definition.id}): ${message}`);
        nextRun = null;
      }
      return {
        ...definition,
        lastStartedAt: row?.last_started_at ?? null,
        lastFinishedAt: row?.last_finished_at ?? null,
        lastStatus: row?.last_status ?? null,
        lastResult: row?.last_result ?? null,
        lastError: row?.last_error ?? null,
        nextRun,
      };
    });
  }

  private async finish(
    id: string,
    lockToken: string,
    status: 'SUCCEEDED' | 'FAILED',
    result: unknown,
    error: string | null,
  ): Promise<void> {
    const serialized = JSON.stringify(result ?? null);
    await this.system.$executeRaw`
      UPDATE core_scheduled_jobs
      SET lease_until = NULL,
          lock_token = NULL,
          last_finished_at = now(),
          last_status = ${status},
          last_result = ${serialized}::jsonb,
          last_error = ${error},
          updated_at = now()
      WHERE job_key = ${id} AND lock_token = ${lockToken}::uuid
    `;
  }
}
