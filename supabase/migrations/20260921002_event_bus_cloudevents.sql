-- ============================================================
-- Sprint 3: Event Bus — CloudEvents v1.0 + DLQ архив
-- RULE-11: uuid_generate_v7()
-- RULE-12: FORCE + RESTRICTIVE + app_user (s_project_app_user БИШ!)
-- ⚠️  retry_count, next_retry_at, error_message аль хэдийн байна → давтахгүй
-- ============================================================

-- ── 1. outbox_events: CloudEvents баганууд нэмэх ────────────
ALTER TABLE outbox_events
  ADD COLUMN IF NOT EXISTS cloud_event_id     TEXT,
  ADD COLUMN IF NOT EXISTS cloud_event_source TEXT,   -- '/s-project/core-kernel'
  ADD COLUMN IF NOT EXISTS cloud_event_type   TEXT,   -- 'mn.s-project.requisition.submitted'
  ADD COLUMN IF NOT EXISTS last_error         TEXT;

-- ── 2. dlq_events шинэ хүснэгт ──────────────────────────────
CREATE TABLE dlq_events (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  original_event JSONB       NOT NULL,
  error_message  TEXT        NOT NULL,
  retry_count    INTEGER     NOT NULL DEFAULT 0,
  max_retries    INTEGER     NOT NULL DEFAULT 3,
  next_retry_at  TIMESTAMPTZ,
  status         TEXT        NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'EXHAUSTED')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- ── 3. RLS (RULE-12: FORCE + RESTRICTIVE + app_user) ────────
ALTER TABLE dlq_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE dlq_events FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_dlq_events ON dlq_events
  AS RESTRICTIVE FOR ALL TO app_user
  USING     (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ── 4. Indexes ───────────────────────────────────────────────
CREATE INDEX idx_dlq_events_pending ON dlq_events(next_retry_at)
  WHERE status = 'PENDING';
CREATE INDEX idx_dlq_events_tenant  ON dlq_events(tenant_id, status);

-- ── 5. Permissions ───────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON dlq_events TO app_user;
