import { randomUUID } from 'node:crypto';
import { SchedulerRegistry } from '@nestjs/schedule';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaTenantClientService } from '../src/db/prisma-tenant-client.service';
import { SystemPrismaService } from '../src/db/system-prisma.service';
import { inTenantTx } from '../src/db/tenant-tx';
import { SequenceService } from '../src/modules/core/sequences/sequence.service';
import { ScheduledJobRegistry } from '../src/modules/core/scheduler/scheduled-job.registry';
import { CampIt, createCampIt } from './helpers/camp-it-app';

describe('C4 core automation (integration)', () => {
  let firstTenant: CampIt;
  let secondTenant: CampIt;

  beforeAll(async () => {
    [firstTenant, secondTenant] = await Promise.all([
      createCampIt('core-automation-a'),
      createCampIt('core-automation-b'),
    ]);
  }, 120_000);

  afterAll(async () => {
    await Promise.all([firstTenant?.close(), secondTenant?.close()]);
  }, 30_000);

  it('allocates concurrent numbers atomically and isolates sequence rows by tenant', async () => {
    const scopeKey = `it-${randomUUID()}`;
    const year = new Date().getFullYear();
    const next = (app: CampIt) => inTenantTx(
      app.app.get(PrismaTenantClientService),
      app.tenantId,
      (tx) => app.app.get(SequenceService).next(tx, {
        tenantId: app.tenantId,
        module: 'mr',
        key: 'material_requisition.number',
        scopeKey,
        year,
      }),
    );

    const values = await Promise.all(Array.from({ length: 8 }, () => next(firstTenant)));
    expect(new Set(values).size).toBe(8);
    expect(values.sort()).toEqual(Array.from({ length: 8 }, (_, index) =>
      `MR-${year}-${String(index + 1).padStart(4, '0')}`,
    ));
    await expect(next(secondTenant)).resolves.toBe(`MR-${year}-0001`);

    const visible = await inTenantTx(
      firstTenant.app.get(PrismaTenantClientService),
      firstTenant.tenantId,
      (tx) => tx.$queryRaw<{ tenant_id: string }[]>`
        SELECT tenant_id FROM core_sequences
        WHERE sequence_type = 'material_requisition.number' AND scope_key = ${scopeKey}
      `,
    );
    expect(visible).toEqual([{ tenant_id: firstTenant.tenantId }]);
  });

  it('uses the database lease to suppress overlapping scheduler executions', async () => {
    const system = firstTenant.app.get(SystemPrismaService);
    const scheduler = firstTenant.app.get(SchedulerRegistry);
    const registries = [new ScheduledJobRegistry(system, scheduler), new ScheduledJobRegistry(system, scheduler)];
    for (const registry of registries) {
      registry.register({ id: 'notification-mail', module: 'core', cron: '0 * * * * *' });
    }

    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    let release!: () => void;
    const task = new Promise<string>((resolve) => { release = () => resolve('sent'); });
    const first = registries[0].run('notification-mail', async () => {
      markStarted();
      return task;
    });
    await started;
    const second = await registries[1].run('notification-mail', async () => 'duplicate');

    expect(second).toEqual({ executed: false });
    release();
    await expect(first).resolves.toEqual({ executed: true, result: 'sent' });

    const rows = await system.$queryRaw<{ last_status: string; lease_until: Date | null }[]>`
      SELECT last_status, lease_until FROM core_scheduled_jobs
      WHERE job_key = 'notification-mail'
    `;
    expect(rows[0]).toMatchObject({ last_status: 'SUCCEEDED', lease_until: null });
  });
});
