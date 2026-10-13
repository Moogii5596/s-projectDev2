---
title: "Sprint 7 — Advanced Approval Workflow (v0.1.5.2)"
type: "Roadmap"
status: "Archived"
last_updated: 2026-10-08
tags: [roadmap, v0.1.5]
---

# Sprint 7 — Advanced Approval Workflow (v0.1.5.2)

> **Зорилго:** Мөнгөний хэмжээнд суурилсан routing, delegation, deadline+escalation, SLA tracking
> **Working dir:** `apps/core-kernel/src/workflow/` + `apps/web-shell/src/pages/`
> **Хамаарал:** Sprint 6 дууссан байх (schema routing зөв ажиллана)

---

## Яагаад Advanced Workflow Хэрэгтэй вэ?

v0.1.0-д workflow_definitions-ийн `steps_config` нь static байсан:
```json
[{"order": 1, "role": "APPROVER", "quorum": 1}]
```

v0.1.5-д:
```json
{
  "amount_rules": [
    {"min": 0,       "max": 1000000,  "steps": [{"order":1,"role":"DEPT_MANAGER","quorum":1}]},
    {"min": 1000000, "max": 10000000, "steps": [{"order":1,"role":"DEPT_MANAGER","quorum":1},
                                                  {"order":2,"role":"FINANCE_MANAGER","quorum":1}]},
    {"min": 10000000,"max": null,     "steps": [{"order":1,"role":"DEPT_MANAGER","quorum":1},
                                                  {"order":2,"role":"FINANCE_MANAGER","quorum":1},
                                                  {"order":3,"role":"CEO","quorum":1}]}
  ],
  "default_sla_hours": 48,
  "escalation_enabled": true,
  "delegation_enabled": true
}
```

---

## Алхам 7.1 — Migration: workflow_definitions Шинэчлэх

- [x] `supabase/migrations/20260922001_advanced_workflow.sql`:

```sql
-- workflow_definitions-ийн steps_config-г amount-aware болгох
-- Одоогийн: steps_config JSONB (static steps array)
-- Шинэ: steps_config JSONB (amount_rules + delegation + escalation config)

-- workflow_definitions-д шинэ талбарууд нэмэх
ALTER TABLE workflow_definitions
  ADD COLUMN IF NOT EXISTS sla_hours      INTEGER NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS escalation_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delegation_enabled BOOLEAN NOT NULL DEFAULT false;

-- Delegation хүснэгт
CREATE TABLE workflow_delegations (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  delegator_id  UUID        NOT NULL,   -- core_users.id (RULE-13)
  delegate_id   UUID        NOT NULL,   -- core_users.id (RULE-13)
  valid_from    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  valid_until   TIMESTAMPTZ NOT NULL,
  reason        TEXT,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT chk_delegation_period CHECK (valid_until > valid_from),
  CONSTRAINT chk_no_self_delegation CHECK (delegator_id != delegate_id)
);

ALTER TABLE workflow_delegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_delegations FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_workflow_delegations ON workflow_delegations
  AS RESTRICTIVE FOR ALL TO s_project_app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- SLA tracking хүснэгт
CREATE TABLE workflow_sla_logs (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  instance_id     UUID        NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  step_order      INTEGER     NOT NULL,
  assigned_to_id  UUID        NOT NULL,   -- core_users.id
  due_at          TIMESTAMPTZ NOT NULL,
  escalated_at    TIMESTAMPTZ,
  escalated_to_id UUID,
  completed_at    TIMESTAMPTZ,
  status          TEXT        NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','COMPLETED','ESCALATED','OVERDUE')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE workflow_sla_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_sla_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_workflow_sla_logs ON workflow_sla_logs
  AS RESTRICTIVE FOR ALL TO s_project_app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- workflow_instances-д escalation тоо нэмэх
ALTER TABLE workflow_instances
  ADD COLUMN IF NOT EXISTS escalation_count INTEGER NOT NULL DEFAULT 0;

-- Индексүүд
CREATE INDEX idx_workflow_delegations_active
  ON workflow_delegations(tenant_id, delegator_id, is_active, valid_until);
CREATE INDEX idx_workflow_sla_due
  ON workflow_sla_logs(tenant_id, due_at, status)
  WHERE status = 'PENDING';
```

---

## Алхам 7.2 — Amount-Based Routing Service

- [x] `apps/core-kernel/src/modules/workflow/amount-router.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';

export interface AmountRule {
  min: number;
  max: number | null;
  steps: WorkflowStep[];
}

export interface WorkflowStep {
  order:  number;
  role:   string;
  quorum: number;  // хэдэн хүн батлах ёстой вэ
}

@Injectable()
export class AmountRouterService {

  /**
   * MR-н нийт дүнгээс зөв workflow steps-г тодорхойлох
   */
  resolveSteps(
    totalAmount: number,
    amountRules: AmountRule[],
  ): WorkflowStep[] {
    // amount_rules-г min-аас max руу эрэмбэлэх
    const sorted = [...amountRules].sort((a, b) => a.min - b.min);

    for (const rule of sorted) {
      const withinMin = totalAmount >= rule.min;
      const withinMax = rule.max === null || totalAmount < rule.max;

      if (withinMin && withinMax) {
        return rule.steps;
      }
    }

    // Таарах дүрэм олдоогүй → default: хамгийн өндөр rule
    return sorted[sorted.length - 1]?.steps ?? [];
  }

  /**
   * MR-н нийт дүнг mr_items-оос тооцоолох
   */
  calculateTotalAmount(items: Array<{ quantity: number; unitPrice: number }>): number {
    return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  }
}
```

---

## Алхам 7.3 — Delegation Service

- [x] `apps/core-kernel/src/modules/workflow/delegation.service.ts`:

```typescript
import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DelegationService {

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Delegation үүсгэх
   * RULE-13: core_users.id ашиглана, authId биш
   */
  async createDelegation(tenantId: string, dto: CreateDelegationDto) {
    // Давхар delegation шалгах (нэг хүнд нэг идэвхтэй delegation)
    const existing = await this.prisma.workflowDelegation.findFirst({
      where: {
        tenantId,
        delegatorId: dto.delegatorId,
        isActive: true,
        validUntil: { gt: new Date() },
      },
    });

    if (existing) {
      throw new ConflictException('Идэвхтэй delegation аль хэдийн байна');
    }

    return this.prisma.workflowDelegation.create({
      data: { tenantId, ...dto },
    });
  }

  /**
   * Хэн батлах ёстой хүний delegate байгаа эсэх шалгах
   * RULE-04: нэгдсэн transaction дотор
   */
  async resolveApprover(
    tenantId: string,
    userId: string,   // core_users.id
  ): Promise<string> {
    const delegation = await this.prisma.workflowDelegation.findFirst({
      where: {
        tenantId,
        delegatorId: userId,
        isActive: true,
        validFrom: { lte: new Date() },
        validUntil: { gt: new Date() },
      },
    });

    // Delegate байвал delegate руу, байхгүй бол өөрт нь
    return delegation?.delegateId ?? userId;
  }

  /**
   * Delegation цуцлах
   */
  async revokeDelegation(tenantId: string, delegationId: string) {
    return this.prisma.workflowDelegation.update({
      where: { id: delegationId, tenantId },
      data: { isActive: false },
    });
  }
}
```

---

## Алхам 7.4 — Escalation Engine (Scheduler)

- [x] `apps/core-kernel/src/modules/workflow/escalation.scheduler.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class EscalationScheduler {
  private readonly logger = new Logger(EscalationScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * 15 минут бүрт deadline хэтэрсэн SLA-г шалгах
   * Хугацаа дуусвал → дараагийн шатанд escalate
   */
  @Cron(CronExpression.EVERY_15_MINUTES)
  async checkOverdueSla() {
    const overdue = await this.prisma.workflowSlaLog.findMany({
      where: {
        status: 'PENDING',
        dueAt: { lt: new Date() },
      },
      include: {
        instance: {
          include: { definition: true },
        },
      },
    });

    for (const sla of overdue) {
      try {
        await this.escalateStep(sla);
      } catch (err) {
        this.logger.error(`Escalation failed for SLA ${sla.id}: ${err.message}`);
      }
    }

    if (overdue.length > 0) {
      this.logger.log(`Escalated ${overdue.length} overdue SLA items`);
    }
  }

  private async escalateStep(sla: any) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config('app.tenant_id', ${sla.tenantId}, true)
      `;

      // SLA log-г ESCALATED болгох
      await tx.workflowSlaLog.update({
        where: { id: sla.id },
        data: {
          status: 'ESCALATED',
          escalatedAt: new Date(),
        },
      });

      // workflow_instances escalation_count нэмэх
      await tx.workflowInstance.update({
        where: { id: sla.instanceId },
        data: { escalationCount: { increment: 1 } },
      });
    });

    // Event явуулах
    this.events.emit('workflow.step.escalated', {
      tenantId: sla.tenantId,
      instanceId: sla.instanceId,
      stepOrder: sla.stepOrder,
      originalAssigneeId: sla.assignedToId,
    });
  }
}
```

---

## Алхам 7.5 — SLA Tracking API

- [x] `GET /api/v1/reports/approval-sla` endpoint:

```typescript
// Response:
{
  "summary": {
    "total": 120,
    "completed_on_time": 85,
    "escalated": 20,
    "overdue": 15,
    "avg_completion_hours": 18.5
  },
  "by_step": [
    {
      "step_order": 1,
      "role": "DEPT_MANAGER",
      "avg_hours": 12.3,
      "escalation_rate": 0.08
    }
  ],
  "period": { "from": "2026-09-01", "to": "2026-09-21" }
}
```

---

## Алхам 7.6 — Workflow Definition UI (Admin)

- [x] `apps/web-shell/src/pages/WorkflowDefinitionPage.tsx`:
  - Amount rule бүрийн min/max range оруулах
  - Step бүрийн role, quorum тохируулах
  - SLA цаг тохируулах
  - Delegation toggle
  - Escalation toggle

- [x] `apps/web-shell/src/pages/DelegationPage.tsx`:
  - Delegation үүсгэх form (хэнд, хэзээ хүртэл)
  - Идэвхтэй delegation жагсаалт
  - Delegation цуцлах товч

---

## Алхам 7.7 — Тест

- [x] `apps/core-kernel/src/modules/workflow/amount-router.service.test.ts`:

```typescript
describe('AmountRouterService', () => {
  it('should return 1-step workflow for amount < 1,000,000')
  it('should return 2-step workflow for amount between 1M and 10M')
  it('should return 3-step workflow for amount >= 10,000,000')
  it('should handle null max (unbounded upper range)')
  it('should fallback to highest rule if no range matches')
  it('calculateTotalAmount: quantity * unitPrice-ийн нийлбэр зөв')
});
```

- [x] `apps/core-kernel/src/modules/workflow/delegation.service.test.ts`:

```typescript
describe('DelegationService', () => {
  it('should create delegation successfully')
  it('should throw ConflictException on duplicate active delegation')
  it('should return delegate ID when active delegation exists')
  it('should return original user ID when no active delegation')
  it('should respect validFrom/validUntil period')
  it('should revoke delegation by setting isActive=false')
});
```

- [x] `apps/core-kernel/src/modules/workflow/escalation.scheduler.test.ts`:

```typescript
describe('EscalationScheduler', () => {
  it('should escalate overdue SLA items')
  it('should NOT escalate SLA items within deadline')
  it('should increment escalation_count on workflow_instances')
  it('should emit workflow.step.escalated event')
  it('should continue processing even if one escalation fails')
});
```

---

## Шалгуур (Definition of Done)

- [x] `pnpm test` бүх workflow тест давна (unit + integration)
- [x] 1M дүнтэй MR → 1 step, 5M → 2 step, 15M → 3 step workflow үүснэ
- [x] Delegation: батлагч ээлжийн амралтад → delegate-д мэдэгдэл очно
- [x] SLA: 48 цаг хэтэрвэл → дараагийн шатанд escalate
- [x] Workflow definition UI-д amount rule тохируулж хадгалж болно
- [x] `/api/v1/reports/approval-sla` зөв статистик буцаана

---

## Алдааны Урьдчилсан Сэрэмжлүүлэг

> ⚠️ **АНХААР:** `resolveApprover()` нь core_users.id буцаана — authId биш (RULE-13). Delegation-д FK хаана заах вэ гэдгийг шалга.

> ⚠️ **АНХААР:** Escalation scheduler нь `@Cron` ашигладаг — `ScheduleModule.forRoot()` AppModule-д import хийгдсэн эсэх шалга (v0.1.0-д нэмэгдсэн байх ёстой).

> ⚠️ **АНХААР:** Amount-based routing нь MR-н items дүнг нэгтгэнэ — items байхгүй MR (0 дүн) нь default хамгийн бага rule-г авна. Энэ бизнесийн зөв эсэхийг баталгаажуулах.
