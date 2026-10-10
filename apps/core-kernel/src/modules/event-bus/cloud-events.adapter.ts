import { randomUUID } from 'crypto';
import type { CloudEvent } from './interfaces/cloud-event.interface';

/** outbox_events мөр (poller-ийн `SELECT *`) — snake_case */
export interface OutboxRow {
  id: string;
  tenant_id: string;
  event_type: string;
  payload: unknown;
  cloud_event_id?: string | null;
  cloud_event_source?: string | null;
  cloud_event_type?: string | null;
  created_at?: Date | string | null;
  retry_count?: number | null;
}

export class CloudEventsAdapter {
  static wrap<T>(params: {
    tenantId: string;
    type:     string;
    source:   string;
    data:     T;
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

  /**
   * Phase 5.1 [EVT-002]: outbox-д ХАДГАЛСАН id/type/source/time-аар CloudEvent үүсгэнэ —
   * дахин оролдлого (retry) бүрт id ижил тул consumer давхардлыг `id`-аар таньж чадна.
   * Хуучин мөрд cloud_event_id байхгүй бол outbox мөрийн id (мөн тогтвортой).
   */
  static fromOutbox(row: OutboxRow, defaultSource: string): CloudEvent<unknown> {
    const created = row.created_at ? new Date(row.created_at) : null;
    return {
      specversion:     '1.0',
      id:              row.cloud_event_id || row.id,
      source:          row.cloud_event_source || defaultSource,
      type:            row.cloud_event_type || row.event_type,
      datacontenttype: 'application/json',
      time:            created && !Number.isNaN(created.getTime()) ? created.toISOString() : new Date().toISOString(),
      tenantid:        row.tenant_id,
      data:            row.payload,
    };
  }
}
