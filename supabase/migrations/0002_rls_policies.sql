-- ============================================================
-- S Project: 0002_rls_policies.sql
-- Row Level Security — Tenant тусгаарлалт
-- ============================================================

-- ── App user үүсгэх (connection pool-д ашиглах) ──────────────
-- Production-д энэ хэрэглэгч BYPASSRLS эрхгүй байна
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user WITH LOGIN PASSWORD 'change_in_production';
  END IF;
END
$$;

-- ── RLS идэвхжүүлэх ──────────────────────────────────────────
ALTER TABLE core_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE mr_headers ENABLE ROW LEVEL SECURITY;
ALTER TABLE mr_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;

-- Tenants хүснэгтэд RLS байхгүй — system level table

-- ── FORCE RLS — superuser-г ч дагуулах ──────────────────────
ALTER TABLE core_users FORCE ROW LEVEL SECURITY;
ALTER TABLE mr_headers FORCE ROW LEVEL SECURITY;
ALTER TABLE mr_items FORCE ROW LEVEL SECURITY;
ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;

-- ── Helper function: current tenant авах ─────────────────────
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID AS $$
  SELECT COALESCE(
    current_setting('app.tenant_id', true),
    ''
  )::UUID;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── core_users RLS policies ──────────────────────────────────
CREATE POLICY "tenant_isolation_users_select"
  ON core_users FOR SELECT
  USING (tenant_id = current_tenant_id());

CREATE POLICY "tenant_isolation_users_insert"
  ON core_users FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "tenant_isolation_users_update"
  ON core_users FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "tenant_isolation_users_delete"
  ON core_users FOR DELETE
  USING (tenant_id = current_tenant_id());

-- ── mr_headers RLS policies ──────────────────────────────────
CREATE POLICY "tenant_isolation_mr_headers_select"
  ON mr_headers FOR SELECT
  USING (tenant_id = current_tenant_id());

CREATE POLICY "tenant_isolation_mr_headers_insert"
  ON mr_headers FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "tenant_isolation_mr_headers_update"
  ON mr_headers FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "tenant_isolation_mr_headers_delete"
  ON mr_headers FOR DELETE
  USING (tenant_id = current_tenant_id());

-- ── mr_items RLS policies ────────────────────────────────────
CREATE POLICY "tenant_isolation_mr_items_select"
  ON mr_items FOR SELECT
  USING (tenant_id = current_tenant_id());

CREATE POLICY "tenant_isolation_mr_items_insert"
  ON mr_items FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "tenant_isolation_mr_items_update"
  ON mr_items FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "tenant_isolation_mr_items_delete"
  ON mr_items FOR DELETE
  USING (tenant_id = current_tenant_id());

-- ── outbox_events RLS policies ───────────────────────────────
CREATE POLICY "tenant_isolation_outbox_select"
  ON outbox_events FOR SELECT
  USING (tenant_id = current_tenant_id());

CREATE POLICY "tenant_isolation_outbox_insert"
  ON outbox_events FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "tenant_isolation_outbox_update"
  ON outbox_events FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
