# Sprint 10 — Event Bus Integration Testing (v0.1.5.5)

> **Зорилго:** Cross-module event chain баталгаажуулах — MR → Workflow → Inventory → Budget дараалал
> **Working dir:** `apps/core-kernel/src/`
> **Хамаарал:** Sprint 9 (4 модуль) бүрэн дууссан байх

---

## Яагаад Энэ Sprint Хэрэгтэй вэ?

v0.1.5-д 4 шинэ модуль нэмэгдэж, тэдгээр нь Event-ээр харилцана:

```
MR Submit ──► BudgetModule.checkBudget()
                 │ OK
                 ▼
          WorkflowEngine.startInstance()
                 │ APPROVED
                 ▼
          InventoryModule.reserveItems()
                 │
                 ▼
          BudgetModule.commitAmount()
                 │
                 ▼
          ReportModule (audit log)
```

Нэг модулийн алдаа нь зэрэгцэн олон event-т нөлөөлж болно.
Unit тест нь тус бүрийн логикийг баталгаажуулдаг — гэхдээ **chain** зөв ажиллахыг баталгаажуулахад **integration тест** шаардлагатай.

---

## Алхам 10.1 — Event Publisher Mock Setup

- [ ] `apps/core-kernel/src/test-utils/event-mock.factory.ts`:

```typescript
import { EventEmitter2 } from '@nestjs/event-emitter';

export function createEventEmitterMock() {
  const emittedEvents: Array<{ event: string; payload: any }> = [];

  const mock = {
    emit: jest.fn().mockImplementation((event: string, payload: any) => {
      emittedEvents.push({ event, payload });
      return true;
    }),
    emitAsync: jest.fn().mockImplementation(async (event: string, payload: any) => {
      emittedEvents.push({ event, payload });
      return [];
    }),
    getEmitted: () => emittedEvents,
    getEmittedByEvent: (event: string) =>
      emittedEvents.filter((e) => e.event === event),
    clearEmitted: () => { emittedEvents.length = 0; },
  } as unknown as EventEmitter2 & {
    getEmitted: () => Array<{ event: string; payload: any }>;
    getEmittedByEvent: (event: string) => Array<{ event: string; payload: any }>;
    clearEmitted: () => void;
  };

  return mock;
}
```

- [ ] Redis transport mock (EventBus phase-д ашиглах):

```typescript
export function createRedisPublisherMock() {
  const publishedMessages: Array<{ channel: string; message: any }> = [];
  return {
    publish: jest.fn().mockImplementation((channel: string, message: string) => {
      publishedMessages.push({ channel, message: JSON.parse(message) });
      return Promise.resolve(1);
    }),
    getPublished: () => publishedMessages,
  };
}
```

---

## Алхам 10.2 — `workflow.instance.start` Integration тест

- [ ] `apps/core-kernel/src/test-integration/workflow-start.integration.test.ts`:

```typescript
describe('workflow.instance.start Integration', () => {

  it('MR submit → WorkflowEngine workflow эхлүүлнэ', async () => {
    // Setup
    const mrId = await createTestMr(tenantId, items);
    const eventMock = createEventEmitterMock();

    // Submit хийх
    await mrService.submit(tenantId, mrId, userId);

    // WorkflowEngine workflow.instance.start event хүлээж авсан эсэх
    const startEvents = eventMock.getEmittedByEvent('workflow.instance.start');
    expect(startEvents).toHaveLength(1);
    expect(startEvents[0].payload).toMatchObject({
      tenantId,
      entityId: mrId,
      entityType: 'MATERIAL_REQUISITION',
    });
  });

  it('Amount 5M → 2-step workflow instance үүснэ', async () => {
    const mrId = await createTestMr(tenantId, [{ qty: 5, unitPrice: 1_000_000 }]);
    await mrService.submit(tenantId, mrId, userId);

    const instance = await prisma.workflowInstance.findFirst({
      where: { entityId: mrId },
    });
    // steps_config дотор 2 step байна уу
    expect(instance).toBeDefined();
    expect(instance!.status).toBe('PENDING');
    // definition-с steps тоо шалгах
  });

  it('Budget limit exceeded → submit 400 буцаана, workflow үүсдэггүй', async () => {
    // Budget allocation тохируулах (100,000 ₮ хязгаар)
    await createBudgetAllocation(tenantId, { totalAmount: 100_000 });

    // 200,000 ₮ MR
    const mrId = await createTestMr(tenantId, [{ qty: 2, unitPrice: 100_000 }]);

    await expect(mrService.submit(tenantId, mrId, userId))
      .rejects.toThrow('Төсвийн хязгаар хүрсэн байна');

    // Workflow instance үүссэнгүй
    const instance = await prisma.workflowInstance.findFirst({
      where: { entityId: mrId },
    });
    expect(instance).toBeNull();
  });
});
```

---

## Алхам 10.3 — `workflow.instance.approved` Integration тест

- [ ] `apps/core-kernel/src/test-integration/workflow-approved.integration.test.ts`:

```typescript
describe('workflow.instance.approved Integration', () => {

  it('Workflow approved → MR status APPROVED болно', async () => {
    const { mrId, instanceId } = await createMrInPendingApproval(tenantId);

    await workflowService.processApproval(tenantId, instanceId, userId, 'APPROVED');

    const mr = await prisma.mrHeader.findUnique({ where: { id: mrId } });
    expect(mr!.status).toBe('APPROVED');
  });

  it('Workflow approved → InventoryModule reservation үүснэ', async () => {
    const itemId = await createInventoryItem(tenantId, { quantity: 100 });
    const { mrId, instanceId } = await createMrInPendingApproval(tenantId, [{
      inventoryItemId: itemId,
      quantity: 5,
    }]);

    await workflowService.processApproval(tenantId, instanceId, userId, 'APPROVED');

    // Inventory reservation шалгах
    const reservation = await prisma.inventoryReservation.findFirst({
      where: { mrHeaderId: mrId },
    });
    expect(reservation).toBeDefined();
    expect(reservation!.reservedQty).toBe(5);

    // inventory_items.reserved_qty нэмэгдсэн эсэх
    const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
    expect(item!.reservedQty).toBe(5);
  });

  it('Workflow approved → BudgetModule commitment SPENT болно', async () => {
    const { mrId, instanceId, totalAmount } = await createMrWithBudgetCommitment(tenantId);

    await workflowService.processApproval(tenantId, instanceId, userId, 'APPROVED');

    const commitment = await prisma.budgetCommitment.findFirst({
      where: { mrHeaderId: mrId },
    });
    expect(commitment!.status).toBe('SPENT');
  });

  it('Workflow rejected → inventory reservation байхгүй, budget released', async () => {
    const { mrId, instanceId } = await createMrWithBudgetCommitment(tenantId);

    await workflowService.processApproval(tenantId, instanceId, userId, 'REJECTED', 'Буцаасан шалтгаан');

    const mr = await prisma.mrHeader.findUnique({ where: { id: mrId } });
    expect(mr!.status).toBe('REJECTED');

    // Budget commitment RELEASED болсон эсэх
    const commitment = await prisma.budgetCommitment.findFirst({
      where: { mrHeaderId: mrId },
    });
    expect(commitment!.status).toBe('RELEASED');
  });
});
```

---

## Алхам 10.4 — Cross-Module Event Chain тест

- [ ] `apps/core-kernel/src/test-integration/cross-module-chain.integration.test.ts`:

```typescript
describe('Cross-Module Event Chain Integration', () => {

  it('Complete chain: MR create → submit → approve → inventory+budget update', async () => {
    // 1. Setup
    const itemId = await createInventoryItem(tenantId, { quantity: 50 });
    await createBudgetAllocation(tenantId, { totalAmount: 10_000_000 });

    // 2. MR үүсгэх
    const mrId = await mrService.create(tenantId, userId, {
      title: 'Chain тест MR',
      items: [{ description: 'Бараа', quantity: 10, unitPrice: 500_000 }],
    });

    // 3. Submit
    await mrService.submit(tenantId, mrId, userId);
    const mr1 = await prisma.mrHeader.findUnique({ where: { id: mrId } });
    expect(mr1!.status).toBe('PENDING_APPROVAL');

    // 4. Approve
    const instance = await prisma.workflowInstance.findFirst({ where: { entityId: mrId } });
    await workflowService.processApproval(tenantId, instance!.id, approverId, 'APPROVED');

    // 5. Нийт гарц шалгах
    const mr2 = await prisma.mrHeader.findUnique({ where: { id: mrId } });
    expect(mr2!.status).toBe('APPROVED');                          // MR status

    const reservation = await prisma.inventoryReservation.findFirst({ where: { mrHeaderId: mrId } });
    expect(reservation!.reservedQty).toBe(10);                    // Inventory reservation

    const commitment = await prisma.budgetCommitment.findFirst({ where: { mrHeaderId: mrId } });
    expect(commitment!.status).toBe('SPENT');                     // Budget spent

    const outboxEvents = await prisma.outboxEvent.findMany({ where: { aggregateId: mrId } });
    expect(outboxEvents.length).toBeGreaterThanOrEqual(2);        // Outbox events
  });

  it('Chain: Inventory дутагдалтай → approve боломжгүй', async () => {
    const itemId = await createInventoryItem(tenantId, { quantity: 2 });  // зөвхөн 2 бараа
    const mrId = await createMrWithItem(tenantId, { inventoryItemId: itemId, quantity: 10 });
    await mrService.submit(tenantId, mrId, userId);

    const instance = await prisma.workflowInstance.findFirst({ where: { entityId: mrId } });

    await expect(
      workflowService.processApproval(tenantId, instance!.id, approverId, 'APPROVED')
    ).rejects.toThrow('Агуулахын үлдэгдэл хүрэлцэхгүй байна');
  });
});
```

---

## Алхам 10.5 — Event Idempotency тест

- [ ] `apps/core-kernel/src/test-integration/event-idempotency.integration.test.ts`:

```typescript
describe('Event Idempotency Tests', () => {

  it('Workflow approved event давхар publish → нэг л reservation үүснэ', async () => {
    const { mrId, instanceId } = await createMrInPendingApproval(tenantId);

    // Хоёр удаа дуудах
    await workflowService.processApproval(tenantId, instanceId, userId, 'APPROVED');
    await workflowService.processApproval(tenantId, instanceId, userId, 'APPROVED'); // idempotent

    const reservations = await prisma.inventoryReservation.findMany({
      where: { mrHeaderId: mrId },
    });
    expect(reservations).toHaveLength(1);  // нэг л reservation
  });

  it('Submit endpoint давхар дуудагдах → нэг л workflow instance', async () => {
    const mrId = await createTestMr(tenantId);

    // Зэрэгцэн 2 submit request
    await Promise.all([
      mrService.submit(tenantId, mrId, userId),
      mrService.submit(tenantId, mrId, userId),
    ]);

    const instances = await prisma.workflowInstance.findMany({
      where: { entityId: mrId },
    });
    expect(instances).toHaveLength(1);  // нэг л instance
  });
});
```

---

## Алхам 10.6 — DLQ тест

- [ ] `apps/core-kernel/src/test-integration/dlq.integration.test.ts`:

```typescript
describe('Dead Letter Queue Tests', () => {

  it('3 retry дараа outbox event DEAD статус болно', async () => {
    // Хүлээн авагч (handler) 3 удаа алдаа гаргадаг mock
    jest.spyOn(inventoryService, 'reserveForMr').mockRejectedValue(new Error('Timeout'));

    const { mrId } = await createApprovedMr(tenantId);

    // Outbox poller 3 удаа retry хийсний дараа
    await outboxPoller.processWithRetry(3);

    const event = await prisma.outboxEvent.findFirst({
      where: { aggregateId: mrId, eventType: 'MR_APPROVED' },
    });
    expect(event!.status).toBe('DEAD');
    expect(event!.retryCount).toBe(3);
  });

  it('DEAD event → alert/notification emit хийгдэнэ', async () => {
    const eventMock = createEventEmitterMock();
    // ... DLQ alert event шалгах
    const dlqAlerts = eventMock.getEmittedByEvent('event.dead_letter');
    expect(dlqAlerts).toHaveLength(1);
  });
});
```

---

## Алхам 10.7 — `pnpm test:integration` Script

- [ ] `package.json` root-д:

```json
{
  "scripts": {
    "test:integration": "pnpm --filter core-kernel vitest run --config vitest.integration.config.ts",
    "test:all": "pnpm test && pnpm test:integration && pnpm test:load"
  }
}
```

- [ ] `apps/core-kernel/vitest.integration.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/test-integration/**/*.integration.test.ts'],
    testTimeout: 30000,   // integration тест удаан байж болно
    hookTimeout: 10000,
    globalSetup: ['src/test-integration/global-setup.ts'],
  },
});
```

- [ ] `apps/core-kernel/src/test-integration/global-setup.ts`:
  - Test DB seed (2 tenant, тус бүрд 1 user)
  - Budget allocation seed
  - Inventory items seed

---

## Шалгуур (Definition of Done)

- [ ] `pnpm test:integration` бүх 20+ integration тест давна
- [ ] Cross-module chain: MR → Workflow → Inventory → Budget нэг transaction дотор амжилттай
- [ ] Idempotency: давхар event → нэг л гарц
- [ ] DLQ: 3 retry дараа DEAD, alert emit
- [ ] CloudEvents envelope зөв бүтэцтэй (`specversion`, `type`, `source`, `id`)
- [ ] RLS leakage: integration тест дотор cross-tenant chain = 0

---

## Алдааны Урьдчилсан Сэрэмжлүүлэг

> ⚠️ **АНХААР:** Integration тест нь бодит DB шаарддаг — `supabase start` ажиллаж байх ёстой. CI-д Supabase local Docker-д ажиллана (`supabase start --workdir .`).

> ⚠️ **АНХААР:** Cross-module chain-д **нэгдсэн transaction** ашиглах (RULE-04). Event handler-ууд тусдаа transaction-д ажиллавал partial commit боломжтой → rollback strategy бодох.

> ⚠️ **АНХААР:** Idempotency тест-д `Promise.all([submit, submit])` race condition үүсгэж болно — `optimistic locking` (version field) зөв ажиллаж байгааг шалга.
