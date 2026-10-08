# Sprint 0 — Pre-flight Fix (v0.9 → v1.0 baseline)

> **Энэ файлыг уншихаас өмнө `00_rules_and_context.md`-г уншина.**
> **Зорилго:** Бодит codebase-г spec-тэй нийцүүлэх — аюулгүй байдлын цоорхой хаах, нэрийн зөрчил засах
> **👤 ХЭРЭГЛЭГЧ хийх:** `supabase db push`, `pnpm test`, браузер шалгах
> **🤖 CLAUDE хийх:** Доорх бүх код бичих

---

## Алхам 0.1 — `app.module.ts` засах (АЮУЛГҮЙ БАЙДЛЫН ЦООРХОЙ)

> ⚠️ RULE-07: APP_GUARD бүртгэгдээгүй → бүх route-д guard ажиллахгүй байна!

- [ ] `apps/core-kernel/src/app/app.module.ts` файлыг **БҮРЭН** доорхоор солих:

```typescript
// apps/core-kernel/src/app/app.module.ts
import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { TenantContextInterceptor } from '../auth/tenant-context.interceptor';

@Module({
  imports: [AuthModule],
  providers: [
    // RULE-07: useExisting (биш useClass) — AuthModule аль хэдийн instantiate хийсэн
    { provide: APP_GUARD, useExisting: TenantAuthGuard },
    { provide: APP_INTERCEPTOR, useExisting: TenantContextInterceptor },
  ],
})
export class AppModule {}
```

> **Яагаад `useExisting`?** `AuthModule` аль хэдийн `TenantAuthGuard`-г `providers`-д бүртгэж DI container-д нэмсэн.
> `useClass` хийвэл хоёр дахь instance үүсгэж Redis inject хийхгүй болох аюултай.

---

## Алхам 0.2 — Migration 0006: RLS засвар + InstalledModule + OutboxStatus

- [ ] `supabase/migrations/0006_sprint0_preflight.sql` файл үүсгэж доорх DDL бичих:

```sql
-- =====================================================================
-- 0006_sprint0_preflight.sql
-- Зорилго: 0005-н алдааг засах, InstalledModule нэмэх, enum rename
-- RULE-11: uuid_generate_v7() | RULE-12: FORCE + RESTRICTIVE
-- =====================================================================

-- 1. approval_logs RLS policy засах (0005 буруу нэр ашигласан)
DO $$
BEGIN
  DROP POLICY IF EXISTS rls_approval_logs_tenant_isolation ON approval_logs;
  DROP POLICY IF EXISTS rls_approval_logs ON approval_logs;
  DROP POLICY IF EXISTS approval_logs_tenant_policy ON approval_logs;
END$$;

ALTER TABLE approval_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_logs FORCE ROW LEVEL SECURITY;

-- RULE-12: зөв нэртэй, зөв config key-тэй policy
CREATE POLICY rls_approval_logs_tenant ON approval_logs
  AS RESTRICTIVE FOR ALL TO s_project_app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- 2. approval_logs.id default засах (0005 uuid_generate_v4 ашигласан)
-- RULE-11: uuid_generate_v7() ЗААВАЛ
ALTER TABLE approval_logs
  ALTER COLUMN id SET DEFAULT uuid_generate_v7();

-- 3. installed_modules хүснэгт үүсгэх
CREATE TABLE IF NOT EXISTS installed_modules (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_id         VARCHAR(64) NOT NULL,
  version           VARCHAR(32) NOT NULL,
  status            VARCHAR(32) NOT NULL DEFAULT 'INSTALLED',
  drain_started_at  TIMESTAMPTZ,
  manifest_snapshot JSONB       NOT NULL DEFAULT '{}',
  installed_at      TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_tenant_module UNIQUE (tenant_id, module_id),
  CONSTRAINT chk_module_status CHECK (
    status IN ('INSTALLED', 'ACTIVE', 'DRAINING', 'SUSPENDED')
  )
);

ALTER TABLE installed_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE installed_modules FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_installed_modules_tenant ON installed_modules
  AS RESTRICTIVE FOR ALL TO s_project_app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE INDEX IF NOT EXISTS idx_installed_modules_tenant
  ON installed_modules(tenant_id, status);

-- 4. mr_headers: workflow_instance_id баганыг нэмэх
ALTER TABLE mr_headers
  ADD COLUMN IF NOT EXISTS workflow_instance_id UUID;

CREATE INDEX IF NOT EXISTS idx_mr_headers_workflow
  ON mr_headers(tenant_id, workflow_instance_id)
  WHERE workflow_instance_id IS NOT NULL;

-- 5. OutboxStatus enum: DEAD_LETTERED → DLQ
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'OutboxStatus' AND e.enumlabel = 'DEAD_LETTERED'
  ) THEN
    ALTER TYPE "OutboxStatus" RENAME VALUE 'DEAD_LETTERED' TO 'DLQ';
  END IF;
END$$;
```

---

## Алхам 0.3 — Prisma schema засах

- [ ] `apps/core-kernel/prisma/schema.prisma`-д доорх өөрчлөлтүүд:

**A. OutboxStatus enum засах:**
```prisma
enum OutboxStatus {
  PENDING
  PUBLISHED
  FAILED
  DLQ          // ← DEAD_LETTERED-г DLQ болгосон (0006 migration-тай нийцнэ)
}
```

**B. MrHeader-д `workflowInstanceId` нэмэх:**
```prisma
model MrHeader {
  // ... байгаа талбарууд ...
  workflowInstanceId String?   @db.Uuid @map("workflow_instance_id")  // RULE-05
}
```

**C. InstalledModule model нэмэх:**
```prisma
model InstalledModule {
  id               String    @id @default(uuid()) @db.Uuid  // RULE-05
  tenantId         String    @db.Uuid
  moduleId         String
  version          String
  status           String    @default("INSTALLED")
  drainStartedAt   DateTime? @db.Timestamptz
  manifestSnapshot Json      @default("{}")
  installedAt      DateTime  @default(now()) @db.Timestamptz
  updatedAt        DateTime  @updatedAt @db.Timestamptz
  tenant           Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, moduleId])
  @@map("installed_modules")
}
```

**D. Tenant model-д relation нэмэх:**
```prisma
model Tenant {
  // ...
  installedModules InstalledModule[]
}
```

---

## Алхам 0.4 — 👤 ХЭРЭГЛЭГЧ ажиллуулах

```bash
# 1. Migration DB-д тусгах
supabase db push

# 2. Prisma client шинэчлэх
pnpm --filter core-kernel exec prisma generate

# 3. Baseline тест ногоон эсэхийг шалгах
pnpm --filter core-kernel test

# 4. APP_GUARD ажиллаж байгааг шалгах
curl -X GET http://localhost:3000/api/v1/requisitions
# → 401 Unauthorized байх ёстой
```

**✅ Sprint 0 дуусах шалгуур:** Тест ногоон + curl → 401

---

## Checklist

- [ ] 0.1 app.module.ts засах (useExisting)
- [ ] 0.2 Migration 0006 үүсгэх
- [ ] 0.3 Prisma schema засах (OutboxStatus DLQ, InstalledModule, workflowInstanceId)
- [ ] 0.4 👤 supabase db push + prisma generate + test
