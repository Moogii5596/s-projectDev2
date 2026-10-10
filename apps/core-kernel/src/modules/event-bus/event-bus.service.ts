import { Injectable } from '@nestjs/common';
import { CloudEventsAdapter } from './cloud-events.adapter';

export const EVENT_SOURCE = '/s-project/core-kernel';

export interface EmitParams {
  tx:             Record<string, unknown>;  // Prisma transaction client (tenant transaction)
  tenantId:       string;
  /** outbox_events.event_type (жнь 'MR_SUBMITTED' эсвэл EventTypes.*) */
  eventType:      string;
  aggregateId:    string;
  data:           object;
  /** Phase 5.1: анхдагч 'MATERIAL_REQUISITION' */
  aggregateType?: string;
  /** Phase 5.1: CloudEvent `type` (анхдагч = eventType), жнь EventTypes.MR_SUBMITTED */
  cloudEventType?: string;
}

@Injectable()
export class EventBusService {
  /**
   * Transactional Outbox pattern
   * RULE-04: caller-ийн $transaction(tx) дотор дуудна (бизнес өөрчлөлттэй хамт commit/rollback)
   * Phase 5.1 [EVT-003]: CloudEvent id/type/source энд НЭГ УДАА үүсч outbox-д хадгалагдана →
   *   poller үүнийг л илгээнэ (retry бүрт id өөрчлөгдөхгүй).
   */
  async emit(params: EmitParams): Promise<void> {
    const cloudEvent = CloudEventsAdapter.wrap({
      tenantId: params.tenantId,
      type:     params.cloudEventType ?? params.eventType,
      source:   EVENT_SOURCE,
      data:     params.data,
    });

    const outboxEvent = params.tx as {
      outboxEvent: {
        create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
      };
    };

    await outboxEvent.outboxEvent.create({
      data: {
        tenantId:         params.tenantId,
        aggregateType:    params.aggregateType ?? 'MATERIAL_REQUISITION',
        aggregateId:      params.aggregateId,
        eventType:        params.eventType,
        payload:          params.data as Record<string, unknown>,
        cloudEventId:     cloudEvent.id,
        cloudEventSource: cloudEvent.source,
        cloudEventType:   cloudEvent.type,
        status:           'PENDING',
      },
    });
  }
}
