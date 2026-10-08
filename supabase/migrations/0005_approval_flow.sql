-- ============================================================
-- 0005_approval_flow.sql
-- MVP.4: approval_logs хүснэгт + mr_headers approved талбарууд
-- ============================================================

-- mr_headers-д approved_at, approved_by нэмэх
ALTER TABLE mr_headers
  ADD COLUMN IF NOT EXISTS approved_by   UUID REFERENCES core_users(id),
  ADD COLUMN IF NOT EXISTS approved_at   TIMESTAMPTZ;

-- approval_logs хүснэгт үүсгэх
CREATE TABLE IF NOT EXISTS approval_logs (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mr_id        UUID        NOT NULL REFERENCES mr_headers(id) ON DELETE CASCADE,
  approver_id  UUID        NOT NULL REFERENCES core_users(id),
  action       TEXT        NOT NULL CHECK (action IN ('APPROVED', 'REJECTED')),
  reason       TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Idempotency key: нэг хэрэглэгч нэг MR-д нэг л action
  CONSTRAINT uq_approval_logs_idempotency UNIQUE (mr_id, approver_id, action)
);

CREATE INDEX IF NOT EXISTS idx_approval_logs_tenant ON approval_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_approval_logs_mr     ON approval_logs(mr_id);

-- RLS идэвхжүүлэх
ALTER TABLE approval_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_logs FORCE ROW LEVEL SECURITY;

-- RLS Policy: tenant isolation
CREATE POLICY "approval_logs_tenant_isolation"
  ON approval_logs
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

COMMENT ON TABLE approval_logs IS 'MVP.4: MR батлах/татгалзах log — idempotency key агуулна';
