# Sprint 2 — Workflow Engine Module (v1.0.2)

> **Зорилго:** Multi-level approval, pessimistic lock, idempotency
> **Working dir:** `apps/core-kernel/`
> ⚠️ `mr_headers.workflow_instance_id` баганa Sprint 0-д нэмэгдсэн — давтан нэмэх ХОРИГЛОНО

---

## Алхам 2.1 — Migration үүсгэх

- [ ] `supabase/migrations/YYYYMMDD_workflow_engine.sql`:

```sql
-- RULE-11: uuid_generate_v7() | RULE-12: FORCE + RESTRICTIVE + s_project_app_user

CREATE TABLE workflow_definitions (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  steps_config JSONB       NOT NULL,  -- [{order:1, role:'APPROVER', quorum:1}]
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE workflow_instances (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  definition_id UUID        NOT NULL REFERENCES workflow_definitions(id),
  entity_type   TEXT        NOT NULL DEFAULT 'MATERIAL_REQUISITION',
  entity_id     UUID        NOT NULL,
  current_step  INTEGER     NOT NULL DEFAULT 0,
  status        TEXT        NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  locked_by     UUID,       -- core_users.id (RULE-13: authId биш!)
  locked_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE workflow_step_logs (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  instance_id UUID        NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  step_order  INTEGER     NOT NULL,
  actor_id    UUID        NOT NULL,  -- core_users.id (RULE-13: resolveUserId() дамжуулна)
  action      TEXT        NOT NULL CHECK (action IN ('APPROVED','REJECTED','DELEGATED')),
  comment     TEXT,
  acted_at    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE idempotency_keys (
  key           TEXT        NOT NULL,
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  response_code INTEGER     NOT NULL,
  response_body JSONB       NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (clock_timestamp() + interval '24 hours'),
  PRIMARY KEY (key, tenant_id)
);

-- RULE-12: FORCE + RESTRICTIVE (бүх хүснэгтэд)
ALTER TABLE workflow_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_definitions FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_workflow_definitions ON workflow_definitions
  AS RESTRICTIVE FOR ALL TO s_project_app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE workflow_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_instances FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_workflow_instances ON workflow_instances
  AS RESTRICTIVE FOR ALL TO s_project_app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE workflow_step_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_step_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_workflow_step_logs ON workflow_step_logs
  AS RESTRICTIVE FOR ALL TO s_project_app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_idempotency_keys ON idempotency_keys
  AS RESTRICTIVE FOR ALL TO s_project_app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- mr_headers.workflow_instance_id FK (баганa Sprint 0-д нэмэгдсэн)
ALTER TABLE mr_headers
  ADD CONSTRAINT IF NOT EXISTS fk_mr_headers_workflow
  FOREIGN KEY (workflow_instance_id) REFERENCES workflow_instances(id) ON DELETE SET NULL;

CREATE INDEX idx_workflow_instances_entity ON workflow_instances(tenant_id, entity_type, entity_id);
CREATE INDEX idx_workflow_step_logs_instance ON workflow_step_logs(tenant_id, instance_id);
CREATE INDEX idx_idempotency_expiry ON idempotency_keys(expires_at);
```

---

## Алхам 2.2 — Prisma schema (RULE-05: бүгд `@db.Uuid`)

- [ ] `prisma/schema.prisma`-д нэмэх:

```prisma
model WorkflowDefinition {
  id          String    @id @default(uuid()) @db.Uuid
  tenantId    String    @db.Uuid
  name        String
  stepsConfig Json
  isActive    Boolean   @default(true)
  createdAt   DateTime  @default(now()) @db.Timestamptz
  updatedAt   DateTime  @updatedAt @db.Timestamptz
  tenant      Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  instances   WorkflowInstance[]
  @@map("workflow_definitions")
}

model WorkflowInstance {
  id           String    @id @default(uuid()) @db.Uuid
  tenantId     String    @db.Uuid
  definitionId String    @db.Uuid
  entityType   String    @default("MATERIAL_REQUISITION")
  entityId     String    @db.Uuid
  currentStep  Int       @default(0)
  status       String    @default("PENDING")
  lockedBy     String?   @db.Uuid   // core_users.id — RULE-13
  lockedAt     DateTime? @db.Timestamptz
  createdAt    DateTime  @default(now()) @db.Timestamptz
  updatedAt    DateTime  @updatedAt @db.Timestamptz
  tenant       Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  definition   WorkflowDefinition @relation(fields: [definitionId], references: [id])
  stepLogs     WorkflowStepLog[]
  mrHeaders    MrHeader[]
  @@map("workflow_instances")
}

model WorkflowStepLog {
  id         String   @id @default(uuid()) @db.Uuid
  tenantId   String   @db.Uuid
  instanceId String   @db.Uuid
  stepOrder  Int
  actorId    String   @db.Uuid   // core_users.id — RULE-13
  action     String
  comment    String?
  actedAt    DateTime @default(now()) @db.Timestamptz
  tenant     Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  instance   WorkflowInstance @relation(fields: [instanceId], references: [id], onDelete: Cascade)
  @@map("workflow_step_logs")
}

model IdempotencyKey {
  key          String
  tenantId     String   @db.Uuid
  responseCode Int
  responseBody Json
  expiresAt    DateTime @db.Timestamptz
  tenant       Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@id([key, tenantId])
  @@map("idempotency_keys")
}
```

- [ ] `MrHeader`-д relation нэмэх:
```prisma
workflowInstance WorkflowInstance? @relation(fields: [workflowInstanceId], references: [id])
```

---

## Алхам 2.3 — resolveUserId helper (RULE-13)

- [ ] `src/common/helpers/resolve-user-id.helper.ts`:

```typescript
import { NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * RULE-13: authId (Supabase UUID) → core_users.id (PostgreSQL UUID)
 * business table FK-д заавал core_users.id ашиглана
 */
export async function resolveUserId(
  prisma: PrismaClient,
  authId: string,
  tenantId: string,
): Promise<string> {
  const user = await prisma.coreUser.findFirst({
    where: { authId, tenantId },
    select: { id: true },
  });
  if (!user) {
    throw new NotFoundException(`User not found: authId=${authId}, tenantId=${tenantId}`);
  }
  return user.id;
}
```

---

## Алхам 2.4 — PessimisticLockService

- [ ] `src/modules/workflow/pessimistic-lock.service.ts`:

```typescript
import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../db/prisma.service';

@Injectable()
export class PessimisticLockService {
  constructor(private readonly prisma: PrismaService) {}

  // RULE-03: set_config | RULE-04: $transaction | RULE-13: userId = core_users.id
  async acquireLock(instanceId: string, userId: string, tenantId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

      // FOR UPDATE NOWAIT — өөр transaction барьсан бол алдаа
      const rows = await tx.$queryRaw<any[]>`
        SELECT * FROM workflow_instances
        WHERE id = ${instanceId}::uuid
        FOR UPDATE NOWAIT
      `;

      if (!rows[0]) throw new NotFoundException('Workflow instance not found');
      if (rows[0].locked_by && rows[0].locked_by !== userId) {
        throw new ConflictException('Instance is locked by another user');
      }

      await tx.$executeRaw`
        UPDATE workflow_instances
        SET locked_by = ${userId}::uuid, locked_at = now(), updated_at = now()
        WHERE id = ${instanceId}::uuid
      `;
      return rows[0];
    });
  }

  async releaseLock(instanceId: string, tenantId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      await tx.$executeRaw`
        UPDATE workflow_instances
        SET locked_by = NULL, locked_at = NULL, updated_at = now()
        WHERE id = ${instanceId}::uuid
      `;
    });
  }
}
```

---

## Алхам 2.5 — IdempotencyService

- [ ] `src/modules/workflow/idempotency.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../db/prisma.service';

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async checkAndStore(
    key: string,
    tenantId: string,
    execute: () => Promise<{ code: number; body: object }>,
  ): Promise<{ code: number; body: object; cached: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

      const existing = await tx.idempotencyKey.findUnique({
        where: { key_tenantId: { key, tenantId } },
      });
      if (existing) {
        return { code: existing.responseCode, body: existing.responseBody as object, cached: true };
      }

      const result = await execute();
      await tx.idempotencyKey.create({
        data: {
          key, tenantId, responseCode: result.code, responseBody: result.body,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      return { ...result, cached: false };
    });
  }
}
```

---

## Алхам 2.6 — WorkflowService

- [ ] `src/modules/workflow/workflow.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService }         from '../../db/prisma.service';
import { PessimisticLockService } from './pessimistic-lock.service';
import { resolveUserId }         from '../../common/helpers/resolve-user-id.helper';

@Injectable()
export class WorkflowService {
  constructor(
    private readonly prisma:  PrismaService,
    private readonly lockSvc: PessimisticLockService,
  ) {}

  async createInstance(params: {
    tenantId: string; definitionId: string; entityId: string; entityType?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${params.tenantId}, true)`;
      return tx.workflowInstance.create({
        data: {
          tenantId: params.tenantId, definitionId: params.definitionId,
          entityId: params.entityId, entityType: params.entityType ?? 'MATERIAL_REQUISITION',
          status: 'PENDING', currentStep: 0,
        },
      });
    });
  }

  async approveStep(params: {
    authId: string;      // Supabase auth_id — RULE-13 input
    tenantId: string; instanceId: string; comment?: string;
  }) {
    // RULE-13: authId → core_users.id
    const actorId = await resolveUserId(this.prisma, params.authId, params.tenantId);
    await this.lockSvc.acquireLock(params.instanceId, actorId, params.tenantId);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${params.tenantId}, true)`;
      const instance = await tx.workflowInstance.findUniqueOrThrow({
        where: { id: params.instanceId }, include: { definition: true },
      });
      const steps: any[] = instance.definition.stepsConfig as any[];
      const nextStep = instance.currentStep + 1;

      await tx.workflowStepLog.create({
        data: {
          tenantId: params.tenantId, instanceId: params.instanceId,
          stepOrder: instance.currentStep, actorId, action: 'APPROVED', comment: params.comment,
        },
      });

      if (nextStep >= steps.length) {
        await tx.workflowInstance.update({
          where: { id: params.instanceId },
          data: { status: 'APPROVED', currentStep: nextStep, lockedBy: null, lockedAt: null },
        });
        await tx.$executeRaw`
          UPDATE mr_headers SET status = 'APPROVED', updated_at = now()
          WHERE workflow_instance_id = ${params.instanceId}::uuid
        `;
      } else {
        await tx.workflowInstance.update({
          where: { id: params.instanceId },
          data: { currentStep: nextStep, lockedBy: null, lockedAt: null },
        });
      }
    });
  }

  async rejectStep(params: {
    authId: string; tenantId: string; instanceId: string; comment?: string;
  }) {
    const actorId = await resolveUserId(this.prisma, params.authId, params.tenantId);
    await this.lockSvc.acquireLock(params.instanceId, actorId, params.tenantId);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${params.tenantId}, true)`;
      await tx.workflowStepLog.create({
        data: {
          tenantId: params.tenantId, instanceId: params.instanceId,
          stepOrder: 0, actorId, action: 'REJECTED', comment: params.comment,
        },
      });
      await tx.workflowInstance.update({
        where: { id: params.instanceId },
        data: { status: 'REJECTED', lockedBy: null, lockedAt: null },
      });
      await tx.$executeRaw`
        UPDATE mr_headers SET status = 'REJECTED', updated_at = now()
        WHERE workflow_instance_id = ${params.instanceId}::uuid
      `;
    });
  }
}
```

---

## Алхам 2.7 — WorkflowModule + AppModule

- [ ] `src/modules/workflow/workflow.module.ts`:

```typescript
import { Module }                from '@nestjs/common';
import { WorkflowService }        from './workflow.service';
import { PessimisticLockService }  from './pessimistic-lock.service';
import { IdempotencyService }     from './idempotency.service';

@Module({
  providers: [WorkflowService, PessimisticLockService, IdempotencyService],
  exports:   [WorkflowService, IdempotencyService],
})
export class WorkflowModule {}
```

- [ ] `AppModule`-д `WorkflowModule` import нэмэх

---

## Алхам 2.8 — Тестийн хамрах хүрээ

```
workflow.service.spec.ts:
  ✓ createInstance() → status: 'PENDING'
  ✓ approveStep() → WorkflowStepLog нэмэгдэнэ, currentStep ахина
  ✓ Бүх step → status='APPROVED', mr_headers.status='APPROVED'
  ✓ rejectStep() → status='REJECTED'
  ✓ RULE-13: actorId нь core_users.id (authId биш)

pessimistic-lock.service.spec.ts:
  ✓ Concurrent 2 хүсэлт → нэг нь ConflictException

idempotency.service.spec.ts:
  ✓ Ижил key → cached response
  ✓ Өөр tenant ижил key → тусдаа хариу (isolation)
```

---

## Алхам 2.9 — 👤 ХЭРЭГЛЭГЧ ажиллуулах

```bash
supabase db push
pnpm --filter core-kernel exec prisma generate
pnpm --filter core-kernel test
pnpm --filter core-kernel test:e2e
```

**✅ Sprint 2 дуусах шалгуур:** Pessimistic lock concurrent тест ногоон + actor_id=core_users.id тест ногоон

---

## Checklist

- [ ] 2.1 Migration workflow_definitions/instances/step_logs/idempotency_keys
- [ ] 2.2 Prisma schema (4 шинэ model)
- [ ] 2.3 resolveUserId helper
- [ ] 2.4 PessimisticLockService
- [ ] 2.5 IdempotencyService
- [ ] 2.6 WorkflowService (createInstance, approveStep, rejectStep)
- [ ] 2.7 WorkflowModule + AppModule шинэчлэх
- [ ] 2.8 Unit тестүүд
- [ ] 2.9 👤 supabase db push + test
