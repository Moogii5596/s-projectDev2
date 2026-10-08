import { randomUUID } from 'crypto';
import type { CloudEvent } from './interfaces/cloud-event.interface';

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
}
