-- ============================================================
-- S Project: 0001_initial_schema.sql
-- Core tables: tenants, core_users, mr_headers, mr_items, outbox_events
-- ============================================================

-- UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Tenants ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug        TEXT NOT NULL UNIQUE,          -- subdomain identifier
  name        TEXT NOT NULL,
  tier        TEXT NOT NULL DEFAULT 'tier1'  -- tier1 | tier2 | tier3
                CHECK (tier IN ('tier1', 'tier2', 'tier3')),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  settings    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Core Users ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS core_users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  auth_id     UUID NOT NULL UNIQUE,          -- Supabase auth.users.id
  email       TEXT NOT NULL,
  full_name   TEXT,
  role        TEXT NOT NULL DEFAULT 'requester'
                CHECK (role IN ('requester', 'approver', 'admin', 'viewer')),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

-- ── Material Requisition Headers ─────────────────────────────
CREATE TABLE IF NOT EXISTS mr_headers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mr_number       TEXT NOT NULL,              -- MR-2026-001 etc.
  title           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'DRAFT'
                    CHECK (status IN (
                      'DRAFT', 'PENDING_APPROVAL', 'APPROVED',
                      'REJECTED', 'CANCELLED', 'PROVISIONALLY_APPROVED'
                    )),
  requester_id    UUID NOT NULL REFERENCES core_users(id),
  department      TEXT,
  required_date   DATE,
  total_amount    NUMERIC(18, 2) NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'MNT',
  notes           TEXT,
  version         INTEGER NOT NULL DEFAULT 1, -- Optimistic locking
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, mr_number)
);

-- ── Material Requisition Items ───────────────────────────────
CREATE TABLE IF NOT EXISTS mr_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  header_id       UUID NOT NULL REFERENCES mr_headers(id) ON DELETE CASCADE,
  line_number     INTEGER NOT NULL,
  description     TEXT NOT NULL,
  unit_of_measure TEXT NOT NULL DEFAULT 'EA',
  quantity        NUMERIC(18, 4) NOT NULL CHECK (quantity > 0),
  unit_price      NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_price     NUMERIC(18, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (header_id, line_number)
);

-- ── Outbox Events (Transactional Outbox Pattern) ─────────────
CREATE TABLE IF NOT EXISTS outbox_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,              -- 'mr.submitted', 'workflow.approved' etc.
  aggregate_type  TEXT NOT NULL,              -- 'MaterialRequisition', 'Workflow' etc.
  aggregate_id    UUID NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING', 'PUBLISHED', 'FAILED', 'DEAD_LETTERED')),
  retry_count     INTEGER NOT NULL DEFAULT 0,
  next_retry_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  error_message   TEXT,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_core_users_tenant_id ON core_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_core_users_auth_id ON core_users(auth_id);
CREATE INDEX IF NOT EXISTS idx_mr_headers_tenant_id ON mr_headers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mr_headers_status ON mr_headers(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_mr_headers_requester ON mr_headers(requester_id);
CREATE INDEX IF NOT EXISTS idx_mr_items_header_id ON mr_items(header_id);
CREATE INDEX IF NOT EXISTS idx_mr_items_tenant_id ON mr_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_outbox_events_status ON outbox_events(status, next_retry_at)
  WHERE status IN ('PENDING', 'FAILED');
CREATE INDEX IF NOT EXISTS idx_outbox_events_tenant ON outbox_events(tenant_id, created_at DESC);

-- ── updated_at auto-update trigger ───────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_core_users_updated_at BEFORE UPDATE ON core_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mr_headers_updated_at BEFORE UPDATE ON mr_headers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mr_items_updated_at BEFORE UPDATE ON mr_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── MR Number auto-generation ────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS mr_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_mr_number(p_tenant_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_year TEXT := to_char(now(), 'YYYY');
  v_seq  TEXT;
BEGIN
  SELECT LPAD(nextval('mr_number_seq')::TEXT, 4, '0') INTO v_seq;
  RETURN 'MR-' || v_year || '-' || v_seq;
END;
$$ LANGUAGE plpgsql;
