// CloudEvents v1.0 — https://cloudevents.io
// Redis channel: tenant.{tenantId}.{eventType}

export interface CloudEvent<T = unknown> {
  specversion:     '1.0';
  id:              string;       // uuid
  source:          string;       // '/s-project/core-kernel'
  type:            string;       // 'mn.s-project.requisition.submitted'
  datacontenttype: 'application/json';
  time:            string;       // ISO 8601
  tenantid:        string;       // custom extension
  data:            T;
}

export const EventTypes = {
  MR_SUBMITTED: 'mn.s-project.requisition.submitted',
  MR_APPROVED:  'mn.s-project.requisition.approved',
  MR_REJECTED:  'mn.s-project.requisition.rejected',
} as const;
