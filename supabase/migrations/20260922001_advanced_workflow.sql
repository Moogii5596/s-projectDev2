-- Sprint 7: amount-aware workflow, delegation, and SLA tracking

ALTER TABLE workflow_definitions
  ADD COLUMN IF NOT EXISTS sla_hours INTEGER NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS escalation_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delegation_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS workflow_delegations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  delegator_id UUID NOT NULL,
  delegate_id UUID NOT NULL,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  valid_until TIMESTAMPTZ NOT NULL,
  reason TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT chk_delegation_period CHECK (valid_until > valid_from),
  CONSTRAINT chk_no_self_delegation CHECK (delegator_id <> delegate_id)
);

CREATE TABLE IF NOT EXISTS workflow_sla_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  instance_id UUID NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  assigned_to_id UUID NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  escalated_at TIMESTAMPTZ,
  escalated_to_id UUID,
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'COMPLETED', 'ESCALATED', 'OVERDUE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE workflow_instances
  ADD COLUMN IF NOT EXISTS escalation_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE workflow_delegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_delegations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_workflow_delegations ON workflow_delegations;
CREATE POLICY rls_workflow_delegations ON workflow_delegations
  AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE workflow_sla_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_sla_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_workflow_sla_logs ON workflow_sla_logs;
CREATE POLICY rls_workflow_sla_logs ON workflow_sla_logs
  AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE INDEX IF NOT EXISTS idx_workflow_delegations_active
  ON workflow_delegations(tenant_id, delegator_id, is_active, valid_until);
CREATE INDEX IF NOT EXISTS idx_workflow_sla_due
  ON workflow_sla_logs(tenant_id, due_at, status)
  WHERE status = 'PENDING';