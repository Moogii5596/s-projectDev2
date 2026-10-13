---
title: "03_Data_Models_and_Security: PostgreSQL Multi-Tenant RLS & Data Isolation Spec"
type: "Database"
status: "Archived"
last_updated: 2026-10-13
tags: [rls, tenant]
---

> 🗄 **Архив (2026-10-13):** 2026-09-ийн анхны хувилбар — одоогийн бодит байдалтай зөрнө (Kubernetes/gRPC/PgBouncer/`SET LOCAL`/Express г.м.). **Одоогийн баримт: [[01_PostgreSQL_MultiTenant_RLS_Spec]].** Хөгжүүлэлтэд ашиглахгүй — зөвхөн түүх, санаа сэргээхэд.


# 03_Data_Models_and_Security: PostgreSQL Multi-Tenant RLS & Data Isolation Spec

**Хувилбар:** v1.3.0  
**Огноо:** 2026-09-20  
**Өмнөх хувилбар:** v1.2.0 → `$executeRawUnsafe` SQL Injection эрсдэл засварлав. v1.3.0 → `workflow_instance_id`, `PROVISIONALLY_APPROVED` статус, `DLQ` статус, `next_retry_at` нэмэв.

---

## 1. RLS Бодлого ба Өгөгдлийн Сангийн Хамгаалалтын DDL (Tier 1: Shared Cloud)

Tier 1 түвшинд бүх хүснэгт дундын өгөгдлийн сан, дундын схемд (Shared DB, Shared Schema) байрших тул аппликейшний холболт заавал RLS-д захирагдана. Хүснэгт үүсгэгч эзэмшигч болон хөгжүүлэгчийн query RLS-ийг алгасахаас (bypass) сэргийлж `ENABLE ROW LEVEL SECURITY`-ээс гадна `FORCE ROW LEVEL SECURITY`-ийг заавал идэвхжүүлнэ.

### 1.1. Хэрэглэгчийн эрхийн тохиргоо (App User vs Migration User)

```sql
-- 1. DB Migration хийх эрхтэй хэрэглэгч (Schema Owner)
CREATE ROLE s_project_migration_admin WITH LOGIN PASSWORD 'secure_admin_pass';

-- 2. Аппликейшн холбогдох энгийн хэрэглэгч
-- ЧУХАЛ: Хэзээ ч BYPASSRLS эрх олгож болохгүй
CREATE ROLE s_project_app_user WITH LOGIN PASSWORD 'secure_app_pass' NOBYPASSRLS NOSUPERUSER;

-- Аппликейшний эрхүүдийг зөвхөн DML түвшинд хязгаарлах
GRANT CONNECT ON DATABASE s_project_db TO s_project_app_user;
GRANT USAGE ON SCHEMA public TO s_project_app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO s_project_app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO s_project_app_user;
```

### 1.2. UUIDv7 үүсгэгч функц (PostgreSQL 14–16+)

UUIDv7 нь хугацааны дарааллаар эрэмбэлэгддэг (Time-ordered) тул B-Tree индексийн хуваагдал (Index Fragmentation)-аас бүрэн сэргийлнэ.

```sql
CREATE OR REPLACE FUNCTION uuid_generate_v7()
RETURNS uuid AS $$
DECLARE
  unix_time_ms bytea;
  uuid_bytes bytea;
BEGIN
  -- 48-bit миллисекунд хугацаа авах
  unix_time_ms := substring(
    int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint)
    from 3 for 6
  );
  -- 10 байт санамсаргүй криптограф өгөгдөл
  uuid_bytes := unix_time_ms || gen_random_bytes(10);
  -- UUID v7 хувилбарын 4 битийг тохируулах (0111)
  uuid_bytes := set_byte(uuid_bytes, 6, (get_byte(uuid_bytes, 6) & 15) | 112);
  -- Variant 1 битийг тохируулах (10xx)
  uuid_bytes := set_byte(uuid_bytes, 8, (get_byte(uuid_bytes, 8) & 63) | 128);
  RETURN encode(uuid_bytes, 'hex')::uuid;
END;
$$ LANGUAGE plpgsql VOLATILE;
```

### 1.3. mr_headers болон mr_items DDL Скрипт

```sql
-- -------------------------------------------------------------
-- Хүснэгт: mr_headers (Материал шаардах хуудасны толгой мэдээлэл)
-- -------------------------------------------------------------
CREATE TABLE mr_headers (
    id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v7(),
    tenant_id           UUID         NOT NULL,
    req_number          VARCHAR(64)  NOT NULL,
    requester_id        UUID         NOT NULL,
    department_id       UUID,
    -- workflow_instance_id: FIX-03 processApproval сервис ашигладаг тул заавал байна
    workflow_instance_id UUID,
    status              VARCHAR(32)  NOT NULL DEFAULT 'DRAFT',
    total_amount        NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    currency            VARCHAR(3)   NOT NULL DEFAULT 'MNT',
    budget_line_id      UUID,
    version             INT          NOT NULL DEFAULT 1,  -- Optimistic Concurrency Control
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT clock_timestamp(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_mr_headers_tenant_req_number UNIQUE (tenant_id, req_number),
    -- Зөвшөөрөгдсөн бүх статусууд (PRD-03 болон FIX-03-тай нийцүүлэв)
    CONSTRAINT chk_mr_headers_status CHECK (status IN (
        'DRAFT',
        'PENDING_APPROVAL',
        'APPROVED',
        'REJECTED',
        'FULFILLED',
        'CANCELLED',
        'PROVISIONALLY_APPROVED'  -- Tier 3 Air-Gapped офлайн зөвшөөрөл
    ))
);

-- -------------------------------------------------------------
-- Хүснэгт: mr_items (Материал шаардах хуудасны мөрүүд)
-- -------------------------------------------------------------
CREATE TABLE mr_items (
    id               UUID           PRIMARY KEY DEFAULT uuid_generate_v7(),
    tenant_id        UUID           NOT NULL,
    header_id        UUID           NOT NULL,
    line_number      INT            NOT NULL,
    item_id          UUID           NOT NULL,
    item_description TEXT,
    quantity         NUMERIC(14, 4) NOT NULL CHECK (quantity > 0),
    unit_price       NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK (unit_price >= 0),
    version          INT            NOT NULL DEFAULT 1,
    created_at       TIMESTAMPTZ    NOT NULL DEFAULT clock_timestamp(),
    updated_at       TIMESTAMPTZ    NOT NULL DEFAULT clock_timestamp(),
    -- Шаталсан устгал (Cascade deletion)
    CONSTRAINT fk_mr_items_header FOREIGN KEY (header_id)
        REFERENCES mr_headers(id) ON DELETE CASCADE,
    CONSTRAINT uq_mr_items_tenant_line UNIQUE (tenant_id, header_id, line_number)
);

-- Индексүүд (Multi-tenant query болон FK Cascade-ийн оновчлол)
CREATE INDEX idx_mr_headers_tenant_status  ON mr_headers (tenant_id, status);
CREATE INDEX idx_mr_headers_tenant_created ON mr_headers (tenant_id, created_at DESC);
CREATE INDEX idx_mr_headers_workflow       ON mr_headers (tenant_id, workflow_instance_id)
    WHERE workflow_instance_id IS NOT NULL;
CREATE INDEX idx_mr_items_tenant_header    ON mr_items (tenant_id, header_id);
CREATE INDEX idx_mr_items_tenant_item      ON mr_items (tenant_id, item_id);
```

### 1.4. RLS Идэвхжүүлэлт ба Бодлого (Row Level Security Policies)

```sql
ALTER TABLE mr_headers ENABLE ROW LEVEL SECURITY;
ALTER TABLE mr_headers FORCE ROW LEVEL SECURITY;

ALTER TABLE mr_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE mr_items FORCE ROW LEVEL SECURITY;

-- Бодлого: mr_headers — tenant_id шүүлтүүр
CREATE POLICY rls_mr_headers_tenant_isolation ON mr_headers
    AS RESTRICTIVE
    FOR ALL
    TO s_project_app_user
    USING (
        tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    )
    WITH CHECK (
        tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    );

-- Бодлого: mr_items — tenant_id шүүлтүүр
CREATE POLICY rls_mr_items_tenant_isolation ON mr_items
    AS RESTRICTIVE
    FOR ALL
    TO s_project_app_user
    USING (
        tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    )
    WITH CHECK (
        tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    );
```

### 1.5. outbox_events DDL (Transactional Outbox Pattern)

```sql
CREATE TABLE outbox_events (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
    tenant_id      UUID        NOT NULL,
    aggregate_type VARCHAR(64) NOT NULL,
    aggregate_id   UUID        NOT NULL,
    event_type     VARCHAR(128) NOT NULL,
    payload        JSONB       NOT NULL,
    status         VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    retry_count    INT         NOT NULL DEFAULT 0,
    -- next_retry_at: экспоненциал буцаах тооцооны хувьд зайлшгүй шаардлагатай
    next_retry_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    published_at   TIMESTAMPTZ,
    CONSTRAINT chk_outbox_status CHECK (
        status IN ('PENDING', 'PUBLISHED', 'FAILED', 'DLQ')
        -- DLQ = Dead Letter Queue: 3 удаагийн retry-н дараа чухал сэрэмжлүүлэг явуулна
    )
);

CREATE INDEX idx_outbox_pending ON outbox_events (next_retry_at)
    WHERE status = 'PENDING';
CREATE INDEX idx_outbox_tenant   ON outbox_events (tenant_id, status);
```

---

## 2. Connection Pooler (PgBouncer) & ORM Хамгаалалт

### 2.1. PgBouncer Transaction Pooling ба SET LOCAL-ийн шаардлага

PgBouncer нь `pool_mode = transaction` горимд ажиллах үед нэг HTTP хүсэлтийн дараа физик DB холболт өөр хэрэглэгчид шилжиж болно.

- `SET app.tenant_id = '...'` хийвэл **сесс түвшинд** хувьсагч үлдэж өөр тенантын дата руу нэвтрэх өндөр эрсдэлтэй.
- Иймд `set_config(key, value, true)` ашиглах ба энэ нь `is_local = true` тохируулснаар зөвхөн **тухайн транзакцийн хүрээнд** хүчинтэй байж, дуусмагц автоматаар арилна.
- `server_reset_query` нь transaction pooling горимд ажилладаггүй тул `pgbouncer.ini`-д хоосон орхих ёстой.

```ini
; pgbouncer.ini — Transaction Pooling тохиргоо
[pgbouncer]
pool_mode = transaction

; ЧУХАЛ: transaction pooling горимд server_reset_query ажилладаггүй тул хоосон байна
server_reset_query =

max_client_conn = 1000
default_pool_size = 25
```

### 2.2. Prisma Extension — AsyncLocalStorage + Parameterized set_config()

> ⚠️ **Аюулгүй байдлын анхааруулга:**  
> `$executeRawUnsafe()` функцийг string interpolation-тай (`SET LOCAL ... = '${tenantId}'`) хамт ашиглах нь **SQL Injection** эрсдэл үүсгэнэ. Доорх жишээн дэх `$executeRaw` tagged template + `set_config()` хэрэглэхийг **заавал** шаардлагатай.

```typescript
import { PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';

/** Тенантын контекст интерфэйс */
export interface TenantContext {
  tenantId:      string;
  userId:        string;
  correlationId: string;
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>();
const basePrisma = new PrismaClient();

export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        const ctx = tenantStorage.getStore();

        if (!ctx?.tenantId) {
          throw new Error(
            'SECURITY_ALERT: RLS Bypass blocked. ' +
            'Missing tenant context — all DB operations require a tenant context.'
          );
        }

        return basePrisma.$transaction(async (tx) => {
          // ✅ ЗӨВ: Parameterized set_config() — SQL Injection-аас хамгаалагдсан
          // is_local = true → зөвхөн энэ транзакцийн хүрээнд хүчинтэй
          await tx.$executeRaw`
            SELECT
              set_config('app.tenant_id', ${ctx.tenantId},      true),
              set_config('app.current_user_id',   ${ctx.userId},        true),
              set_config('app.correlation_id',    ${ctx.correlationId}, true)
          `;
          return query(args);
        });
      },
    },
  },
});
```

### 2.3. Express Middleware — Tenant Context Тохиргоо

```typescript
import { Request, Response, NextFunction } from 'express';
import { tenantStorage, TenantContext } from './prisma-extension';
import { randomUUID } from 'crypto';

/**
 * tenantContextMiddleware
 * JWT баталгаажуулалтын дараа tenant_id болон user_id-г AsyncLocalStorage-д бичнэ.
 * Энэ middleware байхгүй бол бүх DB хүсэлт SECURITY_ALERT алдаагаар таслагдана.
 */
export function tenantContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // X-Tenant-ID толгой хэсгийг API Gateway-с дамжуулж ирнэ (JWT-аас шалгагдсан)
  const tenantId = req.headers['x-tenant-id'] as string;
  const userId   = (req as any).user?.id as string;

  if (!tenantId || !userId) {
    res.status(401).json({ error: 'Missing tenant or user context' });
    return;
  }

  const ctx: TenantContext = {
    tenantId,
    userId,
    correlationId: (req.headers['x-correlation-id'] as string) ?? randomUUID(),
  };

  tenantStorage.run(ctx, () => next());
}
```

---

## 3. Интеграцийн Тест (Vitest)

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, tenantStorage } from '../src/prisma-extension';

describe('RLS Tenant Isolation Integration Tests', () => {
  const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('Tenant A нь зөвхөн өөрийнхөө мэдээллийг харна', async () => {
    const result = await tenantStorage.run(
      { tenantId: TENANT_A, userId: 'user-1', correlationId: 'corr-1' },
      () => prisma.mr_headers.findMany()
    );
    expect(result.every((r) => r.tenant_id === TENANT_A)).toBe(true);
  });

  it('Tenant контекстгүй бол SECURITY_ALERT алдаа гарна', async () => {
    await expect(prisma.mr_headers.findMany()).rejects.toThrow('SECURITY_ALERT');
  });

  it('Background Worker нь заавал tenantStorage.run()-д ороод ажиллана', async () => {
    // Worker tenant контекстгүйгээр шууд query ажиллуулах ёсгүй
    const runWorker = () =>
      tenantStorage.run(
        { tenantId: TENANT_B, userId: 'system', correlationId: 'bg-1' },
        () => prisma.mr_headers.count()
      );

    await expect(runWorker()).resolves.toBeGreaterThanOrEqual(0);
  });
});
```

---

## 4. Аюулгүй байдлын Нэгтгэл

| Давхарга | Механизм | Зорилго |
|---|---|---|
| DB Role | `NOBYPASSRLS NOSUPERUSER` | App user RLS-г алгасах боломжгүй |
| RLS Policy | `FORCE ROW LEVEL SECURITY` | Schema owner ч алгасаж болохгүй |
| PgBouncer | `pool_mode = transaction` | Холболт дахин ашиглахад context цэвэрлэгдэнэ |
| Prisma | `set_config(..., true)` | Зөвхөн transaction-д хүчинтэй, SQL Injection-аас хамгаалагдсан |
| AsyncLocalStorage | `tenantStorage.run()` | Async context тасрахгүй дамжина |
| Express MW | `tenantContextMiddleware` | Бүх хүсэлтэд tenant context заавал байна |
