import { Injectable } from '@nestjs/common';
import { CloudEventsAdapter } from './cloud-events.adapter';

const SOURCE = '/s-project/core-kernel';

export interface EmitParams {
  tx:          Record<string, unknown>;  // Prisma transaction client
  tenantId:    string;
  eventType:   string;                   // EventTypes.MR_SUBMITTED
  aggregateId: string;
  data:        object;
}

@Injectable()
export class EventBusService {
  /**
   * Transactional Outbox pattern
   * RULE-04: caller-ийн $transaction(tx) дотор дуудна
   */
  async emit(params: EmitParams): Promise<void> {
    const cloudEvent = CloudEventsAdapter.wrap({
      tenantId: params.tenantId,
      type:     params.eventType,
      source:   SOURCE,
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
        aggregateType:    'MATERIAL_REQUISITION',
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
