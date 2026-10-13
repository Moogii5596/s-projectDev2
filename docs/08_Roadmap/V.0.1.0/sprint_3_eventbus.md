---
title: "Sprint 3 — Event Bus: CloudEvents + Redis + DLQ (v1.0.3)"
type: "Roadmap"
status: "Archived"
last_updated: 2026-10-08
tags: [roadmap, v0.1.0]
---

# Sprint 3 — Event Bus: CloudEvents + Redis + DLQ (v1.0.3)

> **Зорилго:** CloudEvents v1.0, Redis Pub/Sub, DLQ retry
> **Working dir:** `apps/core-kernel/`
> ⚠️ `outbox_events`-д `retry_count`, `next_retry_at`, `DLQ` статус **аль хэдийн байна** (MVP). Давтан нэмэх ХОРИГЛОНО.

---

## Алхам 3.1 — Migration үүсгэх

- [ ] `supabase/migrations/YYYYMMDD_event_bus_cloudevents.sql`:

```sql
-- Зөвхөн ШИНЭ баганууд (байгааг давтах ХОРИГЛОНО)
ALTER TABLE outbox_events
  ADD COLUMN IF NOT EXISTS cloud_event_id     TEXT,
  ADD COLUMN IF NOT EXISTS cloud_event_source TEXT,   -- '/s-project/core-kernel'
  ADD COLUMN IF NOT EXISTS cloud_event_type   TEXT,   -- 'mn.s-project.requisition.submitted'
  ADD COLUMN IF NOT EXISTS last_error         TEXT;

-- DLQ архив (RULE-11, RULE-12)
CREATE TABLE dlq_events (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  original_event JSONB       NOT NULL,
  error_message  TEXT        NOT NULL,
  retry_count    INTEGER     NOT NULL DEFAULT 0,
  max_retries    INTEGER     NOT NULL DEFAULT 3,
  next_retry_at  TIMESTAMPTZ,
  status         TEXT        NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','EXHAUSTED')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE dlq_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE dlq_events FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_dlq_events ON dlq_events
  AS RESTRICTIVE FOR ALL TO s_project_app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE INDEX idx_dlq_events_pending ON dlq_events(next_retry_at) WHERE status = 'PENDING';
CREATE INDEX idx_dlq_events_tenant ON dlq_events(tenant_id, status);
```

---

## Алхам 3.2 — Prisma schema шинэчлэх

- [ ] `OutboxEvent` model-д нэмэх: `cloudEventId`, `cloudEventSource`, `cloudEventType`, `lastError`
- [ ] `DlqEvent` model үүсгэх:

```prisma
model DlqEvent {
  id            String    @id @default(uuid()) @db.Uuid
  tenantId      String    @db.Uuid
  originalEvent Json
  errorMessage  String
  retryCount    Int       @default(0)
  maxRetries    Int       @default(3)
  nextRetryAt   DateTime? @db.Timestamptz
  status        String    @default("PENDING")
  createdAt     DateTime  @default(now()) @db.Timestamptz
  tenant        Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@map("dlq_events")
}
```

---

## Алхам 3.3 — Event Bus файлууд

- [ ] `src/modules/event-bus/interfaces/cloud-event.interface.ts`:

```typescript
// CloudEvents v1.0 — https://cloudevents.io
// Redis channel: tenant.{tenantId}.{eventType}
export interface CloudEvent<T = unknown> {
  specversion:      '1.0';
  id:               string;       // uuid
  source:           string;       // '/s-project/core-kernel'
  type:             string;       // 'mn.s-project.requisition.submitted'
  datacontenttype:  'application/json';
  time:             string;       // ISO 8601
  tenantid:         string;       // custom extension
  data:             T;
}

export const EventTypes = {
  MR_SUBMITTED: 'mn.s-project.requisition.submitted',
  MR_APPROVED:  'mn.s-project.requisition.approved',
  MR_REJECTED:  'mn.s-project.requisition.rejected',
} as const;
```

- [ ] `src/modules/event-bus/cloud-events.adapter.ts`:

```typescript
import { randomUUID } from 'crypto';
import type { CloudEvent } from './interfaces/cloud-event.interface';

export class CloudEventsAdapter {
  static wrap<T>(params: {
    tenantId: string; type: string; source: string; data: T;
  }): CloudEvent<T> {
    return {
      specversion:     '1.0',
      id:              randomUUID(),
      source:          params.source,
      type:            params.type,
      datacontenttype: 'application/json',
      time:            new Date().toISOString(),
      tenantid:        params.tenantId,
      data:            params.data,
    };
  }
}
```

- [ ] `src/modules/event-bus/redis-publisher.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import type { CloudEvent } from './interfaces/cloud-event.interface';

@Injectable()
export class RedisPublisherService {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  async publish<T>(event: CloudEvent<T>): Promise<void> {
    // Channel: tenant.{tenantId}.{eventType}
    const channel = `tenant.${event.tenantid}.${event.type}`;
    await this.redis.publish(channel, JSON.stringify(event));
  }
}
```

- [ ] `src/modules/event-bus/outbox-poller.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { Cron }        from '@nestjs/schedule';
import { PrismaService }        from '../../db/prisma.service';
import { RedisPublisherService } from './redis-publisher.service';
import { CloudEventsAdapter }   from './cloud-events.adapter';
import { DlqService }           from './dlq.service';
import { OutboxStatus }         from '@prisma/client';  // RULE-02

const MAX_RETRIES = 3;

@Injectable()
export class OutboxPollerService {
  constructor(
    private readonly prisma:     PrismaService,
    private readonly publisher:  RedisPublisherService,
    private readonly dlqService: DlqService,
  ) {}

  @Cron('*/5 * * * * *')  // 5 секунд бүр
  async pollAndPublish(): Promise<void> {
    const pending = await this.prisma.$queryRaw<any[]>`
      SELECT * FROM outbox_events
      WHERE status = 'PENDING' AND next_retry_at <= now()
      LIMIT 50 FOR UPDATE SKIP LOCKED
    `;

    for (const event of pending) {
      try {
        const cloudEvent = CloudEventsAdapter.wrap({
          tenantId: event.tenant_id,
          type:     event.cloud_event_type ?? event.event_type,
          source:   event.cloud_event_source ?? '/s-project/core-kernel',
          data:     event.payload,
        });
        await this.publisher.publish(cloudEvent);
        await this.prisma.$executeRaw`
          UPDATE outbox_events SET status = 'PUBLISHED', published_at = now()
          WHERE id = ${event.id}::uuid
        `;
      } catch (err: any) {
        const newCount = (event.retry_count ?? 0) + 1;
        if (newCount >= MAX_RETRIES) {
          // RULE-02: OutboxStatus from @prisma/client
          await this.prisma.$executeRaw`
            UPDATE outbox_events
            SET status = 'DLQ', retry_count = ${newCount}, last_error = ${err.message}
            WHERE id = ${event.id}::uuid
          `;
          await this.dlqService.createDlqRecord(event, err.message);
        } else {
          // Exponential backoff: 30s, 120s, 480s
          const backoffSeconds = 30 * Math.pow(4, newCount - 1);
          await this.prisma.$executeRaw`
            UPDATE outbox_events
            SET retry_count = ${newCount},
                next_retry_at = now() + (${backoffSeconds} || ' seconds')::interval,
                last_error = ${err.message}
            WHERE id = ${event.id}::uuid
          `;
        }
      }
    }
  }
}
```

- [ ] `src/modules/event-bus/dlq.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../db/prisma.service';

@Injectable()
export class DlqService {
  constructor(private readonly prisma: PrismaService) {}

  async createDlqRecord(originalEvent: any, errorMessage: string): Promise<void> {
    await this.prisma.dlqEvent.create({
      data: {
        tenantId:      originalEvent.tenant_id,
        originalEvent: originalEvent,
        errorMessage,
        status:        'PENDING',
      },
    });
  }
}
```

- [ ] `src/modules/event-bus/event-bus.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService }      from '../../db/prisma.service';
import { CloudEventsAdapter } from './cloud-events.adapter';

@Injectable()
export class EventBusService {
  constructor(private readonly prisma: PrismaService) {}

  // Transactional outbox pattern: caller-ийн $transaction дотор дуудаж болно
  async emit(params: {
    tx:          any;     // Prisma transaction client
    tenantId:    string;
    eventType:   string;  // EventTypes.MR_SUBMITTED
    aggregateId: string;
    data:        object;
  }): Promise<void> {
    const cloudEvent = CloudEventsAdapter.wrap({
      tenantId: params.tenantId,
      type:     params.eventType,
      source:   '/s-project/core-kernel',
      data:     params.data,
    });

    await params.tx.outboxEvent.create({
      data: {
        tenantId:         params.tenantId,
        aggregateType:    'MATERIAL_REQUISITION',
        aggregateId:      params.aggregateId,
        eventType:        params.eventType,
        payload:          params.data as any,
        cloudEventId:     cloudEvent.id,
        cloudEventSource: cloudEvent.source,
        cloudEventType:   cloudEvent.type,
        status:           'PENDING',
      },
    });
  }
}
```

- [ ] `src/modules/event-bus/event-bus.module.ts` үүсгэх
- [ ] `AppModule`-д `EventBusModule` + `ScheduleModule.forRoot()` нэмэх

---

## Алхам 3.4 — WorkflowService-д event emit нэмэх

- [ ] `workflow.service.ts`-д `approveStep`/`rejectStep` transaction дотор `EventBusService.emit()` нэмэх

---

## Алхам 3.5 — Тестийн хамрах хүрээ

```
outbox-poller.service.spec.ts:
  ✓ pollAndPublish() → Redis publish хийгдэнэ
  ✓ Алдаатай → retry_count++, exponential backoff
  ✓ retry_count=3 → status='DLQ' + dlq_events бүртгэгдэнэ

cloud-events.adapter.spec.ts:
  ✓ specversion: '1.0'
  ✓ tenantid extension attribute байна
  ✓ source format зөв

dlq.service.spec.ts:
  ✓ createDlqRecord() → dlq_events-д бичигдэнэ
```

---

## Алхам 3.6 — 👤 ХЭРЭГЛЭГЧ ажиллуулах

```bash
supabase db push
pnpm --filter core-kernel exec prisma generate
pnpm --filter core-kernel test
```

**✅ Sprint 3 дуусах шалгуур:** CloudEvents format + DLQ retry тест ногоон

---

## Checklist

- [ ] 3.1 Migration (outbox_events баганууд + dlq_events)
- [ ] 3.2 Prisma (OutboxEvent шинэчлэх, DlqEvent нэмэх)
- [ ] 3.3 Event Bus файлууд (interface, adapter, publisher, poller, dlq, bus)
- [ ] 3.4 WorkflowService-д event emit
- [ ] 3.5 Unit тестүүд
- [ ] 3.6 👤 supabase db push + test
