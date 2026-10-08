-- Sprint 8: indexes for tenant-scoped list and queue queries.
CREATE INDEX IF NOT EXISTS idx_mr_headers_tenant_status_created
  ON mr_headers(tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mr_headers_tenant_submitter_created
  ON mr_headers(tenant_id, requester_id, created_at DESC)
  WHERE status <> 'DRAFT';

CREATE INDEX IF NOT EXISTS idx_workflow_instances_tenant_status
  ON workflow_instances(tenant_id, status, created_at DESC)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_outbox_events_status_retry
  ON outbox_events(status, next_retry_at)
  WHERE status IN ('PENDING', 'FAILED');

CREATE INDEX IF NOT EXISTS idx_sla_tenant_due_pending
  ON workflow_sla_logs(tenant_id, due_at, status)
  WHERE status = 'PENDING';