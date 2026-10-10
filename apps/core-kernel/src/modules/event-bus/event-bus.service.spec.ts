import { describe, expect, it, vi } from 'vitest';
import { EventBusService, EVENT_SOURCE } from './event-bus.service';
import { EventTypes } from './interfaces/cloud-event.interface';

describe('EventBusService.emit (Phase 5.1 [EVT-003])', () => {
  const T = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  it('MR: event_type хуучин нэр, CloudEvent type/id/source outbox-д хадгалагдана', async () => {
    const tx = { outboxEvent: { create: vi.fn().mockResolvedValue({}) } };
    await new EventBusService().emit({
      tx: tx as never, tenantId: T, eventType: 'MR_SUBMITTED', cloudEventType: EventTypes.MR_SUBMITTED,
      aggregateType: 'MR', aggregateId: 'mr-1', data: { mrId: 'mr-1' },
    });
    const data = tx.outboxEvent.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      tenantId: T, eventType: 'MR_SUBMITTED', aggregateType: 'MR', aggregateId: 'mr-1',
      cloudEventType: EventTypes.MR_SUBMITTED, cloudEventSource: EVENT_SOURCE, status: 'PENDING', payload: { mrId: 'mr-1' },
    });
    expect(data.cloudEventId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('анхдагч: aggregateType MATERIAL_REQUISITION, CloudEvent type = eventType; дуудалт бүрт шинэ id', async () => {
    const tx = { outboxEvent: { create: vi.fn().mockResolvedValue({}) } };
    const bus = new EventBusService();
    await bus.emit({ tx: tx as never, tenantId: T, eventType: EventTypes.MR_APPROVED, aggregateId: 'i', data: {} });
    await bus.emit({ tx: tx as never, tenantId: T, eventType: EventTypes.MR_APPROVED, aggregateId: 'i', data: {} });
    const [a, b] = tx.outboxEvent.create.mock.calls.map((c) => c[0].data);
    expect(a).toMatchObject({ aggregateType: 'MATERIAL_REQUISITION', cloudEventType: EventTypes.MR_APPROVED });
    expect(a.cloudEventId).not.toBe(b.cloudEventId);
  });
});
