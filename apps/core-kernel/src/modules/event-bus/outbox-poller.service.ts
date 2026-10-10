import { Prisma } from '@prisma/client';
import { Injectable, Logger } from '@nestjs/common';
import { Cron }       from '@nestjs/schedule';
import { SystemPrismaService } from '../../db/system-prisma.service'; // Phase 4.8.4
import { RedisPublisherService }  from './redis-publisher.service';
import { CloudEventsAdapter, OutboxRow } from './cloud-events.adapter';
import { DlqService }            from './dlq.service';
import { EVENT_SOURCE }          from './event-bus.service';

export const OUTBOX_MAX_RETRIES = 3;
export const OUTBOX_BATCH = 50;
/** retry n (1-ээс) → 30с, 120с, 480с */
export const outboxBackoffSeconds = (attempt: number): number => 30 * Math.pow(4, attempt - 1);

/**
 * Transactional outbox poller — Phase 5.0 [EVT-001] (2026-10-10)
 *
 * Өмнө: `SELECT … FOR UPDATE SKIP LOCKED`-ийг transaction-ГҮЙ ажиллуулдаг → түгжээ тэр дороо суларч,
 * cluster-ийн worker бүрийн cron (5с) нэг event-ийг давхар publish хийж болдог байв.
 * Одоо: event БҮРИЙГ нэг transaction дотор түгжинэ (SKIP LOCKED) → publish → төлөв → commit.
 * Өөр worker/poller түгжээтэй мөрийг алгасна. Баталгаа: at-least-once (publish-ийн дараа commit-оос өмнө
 * процесс унавал дахин илгээгдэнэ) — CloudEvent `id` тогтвортой тул consumer `id`-аар давхардлыг таньна [EVT-002].
 */
@Injectable()
export class OutboxPollerService {
  private readonly logger = new Logger(OutboxPollerService.name);

  constructor(
    private readonly prisma:     SystemPrismaService,
    private readonly publisher:  RedisPublisherService,
    private readonly dlqService: DlqService,
  ) {}

  /**
   * 5 секунд бүр. `OUTBOX_POLLER_CRON=off` → cron алгасна (integration тест: зэрэгцээ ажиллах тест файлуудын
   * app-ууд бие биеийн outbox-ийг боловсруулахаас сэргийлнэ; тест `pollAndPublish()`-ийг шууд дуудна).
   */
  @Cron('*/5 * * * * *')
  async onTick(): Promise<void> {
    if (process.env.OUTBOX_POLLER_CRON?.trim().toLowerCase() === 'off') return;
    await this.pollAndPublish();
  }

  async pollAndPublish(): Promise<number> {
    let processed = 0;
    for (let i = 0; i < OUTBOX_BATCH; i += 1) {
      let handled: boolean;
      try {
        handled = await this.processNext();
      } catch (err) {
        // DB алдаа (холболт г.м.) — энэ tick-ийг зогсооно, дараагийн tick дахин оролдоно
        this.logger.error(`Outbox poll алдаа: ${(err as Error).message}`);
        break;
      }
      if (!handled) break;
      processed += 1;
    }
    return processed;
  }

  /** Нэг event-ийг transaction дотор боловсруулна. false = бэлэн event алга */
  async processNext(): Promise<boolean> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const rows = await tx.$queryRaw<Array<OutboxRow & Record<string, unknown>>>`
        SELECT * FROM outbox_events
        WHERE status = 'PENDING'
          AND next_retry_at <= now()
        ORDER BY next_retry_at, created_at
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `;
      const event = rows[0];
      if (!event) return false;

      try {
        await this.publisher.publish(CloudEventsAdapter.fromOutbox(event, EVENT_SOURCE));
        await tx.$executeRaw`
          UPDATE outbox_events
          SET status = 'PUBLISHED', published_at = now(), last_error = NULL
          WHERE id = ${event.id}::uuid
        `;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const attempt = (Number(event.retry_count) || 0) + 1;

        if (attempt >= OUTBOX_MAX_RETRIES) {
          await tx.$executeRaw`
            UPDATE outbox_events
            SET status = 'DLQ', retry_count = ${attempt}, last_error = ${errMsg}
            WHERE id = ${event.id}::uuid
          `;
          await this.dlqService.createDlqRecord(event, errMsg, tx);
          this.logger.warn(`Outbox ${event.id} → DLQ (${attempt} оролдлого): ${errMsg}`);
        } else {
          const backoff = outboxBackoffSeconds(attempt);
          await tx.$executeRaw`
            UPDATE outbox_events
            SET retry_count   = ${attempt},
                next_retry_at = now() + make_interval(secs => ${backoff}),
                last_error    = ${errMsg}
            WHERE id = ${event.id}::uuid
          `;
        }
      }
      return true;
    }, { timeout: 15_000 });
  }
}
