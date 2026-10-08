-- ============================================================
-- Sprint 2: Workflow Engine Migration
-- RULE-11: uuid_generate_v7() | RULE-12: FORCE + RESTRICTIVE
-- RULE-13: locked_by/actor_id → core_users.id (authId биш)
-- ============================================================

-- ── workflow_definitions ─────────────────────────────────────
CREATE TABLE workflow_definitions (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  steps_config JSONB       NOT NULL,  -- [{order:1, role:'APPROVER', quorum:1}]
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- ── workflow_instances ───────────────────────────────────────
CREATE TABLE workflow_instances (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  definition_id UUID        NOT NULL REFERENCES workflow_definitions(id),
  entity_type   TEXT        NOT NULL DEFAULT 'MATERIAL_REQUISITION',
  entity_id     UUID        NOT NULL,
  current_step  INTEGER     NOT NULL DEFAULT 0,
  status        TEXT        NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  locked_by     UUID,       -- core_users.id (RULE-13: authId биш!)
  locked_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- ── workflow_step_logs ───────────────────────────────────────
CREATE TABLE workflow_step_logs (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  instance_id UUID        NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  step_order  INTEGER     NOT NULL,
  actor_id    UUID        NOT NULL,  -- core_users.id (RULE-13)
  action      TEXT        NOT NULL CHECK (action IN ('APPROVED','REJECTED','DELEGATED')),
  comment     TEXT,
  acted_at    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- ── idempotency_keys ─────────────────────────────────────────
CREATE TABLE idempotency_keys (
  key           TEXT        NOT NULL,
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  response_code INTEGER     NOT NULL,
  response_body JSONB       NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (clock_timestamp() + interval '24 hours'),
  PRIMARY KEY (key, tenant_id)
);

-- ── RLS: workflow_definitions ────────────────────────────────
-- RULE-12: ENABLE + FORCE + RESTRICTIVE + app_user
ALTER TABLE workflow_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_definitions FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_workflow_definitions ON workflow_definitions
  AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ── RLS: workflow_instances ──────────────────────────────────
ALTER TABLE workflow_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_instances FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_workflow_instances ON workflow_instances
  AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ── RLS: workflow_step_logs ──────────────────────────────────
ALTER TABLE workflow_step_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_step_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_workflow_step_logs ON workflow_step_logs
  AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ── RLS: idempotency_keys ────────────────────────────────────
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_idempotency_keys ON idempotency_keys
  AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ── mr_headers FK constraint ─────────────────────────────────
-- АНХААРУУЛГА: workflow_instance_id баганa Sprint 0-д нэмэгдсэн — зөвхөн FK нэмнэ
ALTER TABLE mr_headers
  ADD CONSTRAINT fk_mr_headers_workflow
  FOREIGN KEY (workflow_instance_id) REFERENCES workflow_instances(id) ON DELETE SET NULL;

-- ── Индексүүд ────────────────────────────────────────────────
CREATE INDEX idx_workflow_instances_entity
  ON workflow_instances(tenant_id, entity_type, entity_id);

CREATE INDEX idx_workflow_step_logs_instance
  ON workflow_step_logs(tenant_id, instance_id);

CREATE INDEX idx_idempotency_expiry
  ON idempotency_keys(expires_at);
