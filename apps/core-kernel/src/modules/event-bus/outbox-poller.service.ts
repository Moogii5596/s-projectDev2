import { Prisma } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { Cron }       from '@nestjs/schedule';
import { PrismaService }         from '../../db/prisma.service';
import { RedisPublisherService }  from './redis-publisher.service';
import { CloudEventsAdapter }    from './cloud-events.adapter';
import { DlqService }            from './dlq.service';

const MAX_RETRIES = 3;
const SOURCE      = '/s-project/core-kernel';

@Injectable()
export class OutboxPollerService {
  constructor(
    private readonly prisma:     PrismaService,
    private readonly publisher:  RedisPublisherService,
    private readonly dlqService: DlqService,
  ) {}

  @Cron('*/5 * * * * *')  // 5 секунд бүр
  async pollAndPublish(): Promise<void> {
    // RULE-04: $queryRaw + update → нэгдсэн $transaction
    const pending = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT * FROM outbox_events
      WHERE status = 'PENDING'
        AND next_retry_at <= now()
      LIMIT 50
      FOR UPDATE SKIP LOCKED
    `;

    for (const event of pending) {
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        try {
          const cloudEvent = CloudEventsAdapter.wrap({
            tenantId: event['tenant_id'] as string,
            type:     (event['cloud_event_type'] ?? event['event_type']) as string,
            source:   (event['cloud_event_source'] ?? SOURCE) as string,
            data:     event['payload'],
          });

          await this.publisher.publish(cloudEvent);

          await tx.$executeRaw`
            UPDATE outbox_events
            SET status = 'PUBLISHED', published_at = now()
            WHERE id = ${event['id']}::uuid
          `;
        } catch (err: unknown) {
          const errMsg  = err instanceof Error ? err.message : String(err);
          const newCount = ((event['retry_count'] as number) ?? 0) + 1;

          if (newCount >= MAX_RETRIES) {
            await tx.$executeRaw`
              UPDATE outbox_events
              SET status = 'DLQ',
                  retry_count = ${newCount},
                  last_error  = ${errMsg}
              WHERE id = ${event['id']}::uuid
            `;
            await this.dlqService.createDlqRecord(event, errMsg);
          } else {
            // Exponential backoff: 30s → 120s → 480s
            const backoffSeconds = 30 * Math.pow(4, newCount - 1);
            await tx.$executeRaw`
              UPDATE outbox_events
              SET retry_count   = ${newCount},
                  next_retry_at = now() + (${backoffSeconds} || ' seconds')::interval,
                  last_error    = ${errMsg}
              WHERE id = ${event['id']}::uuid
            `;
          }
        }
      });
    }
  }
}
