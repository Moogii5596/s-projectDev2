-- ============================================================
-- Sprint 6: Schema-per-Tenant DB Isolation (v0.1.5.1)
-- ============================================================
-- RULE-11: uuid_generate_v7() used in existing tables — not needed here (no new UUID cols)
-- RULE-12: RESTRICTIVE RLS + NULLIF pattern for all cloned tables
-- ============================================================

-- 1. tenants хүснэгтэд schema_name колонк нэмэх
--    (tier колонк TierType enum-тэй хэвээр үлдэнэ — зөрчилдөхгүй)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS schema_name TEXT;

-- 2. provision_tenant_schema — Enterprise tenant-д тусдаа schema үүсгэх
--    SECURITY DEFINER + SET search_path = public (privilege escalation хамгааллын тулд)
CREATE OR REPLACE FUNCTION provision_tenant_schema(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schema_name TEXT;
  v_short_id    TEXT;
BEGIN
  -- UUID-н эхний 8 тэмдэгтийг авна (collision маш бага, нэр богино)
  v_short_id    := REPLACE(LEFT(p_tenant_id::TEXT, 8), '-', '');
  v_schema_name := 'tenant_' || v_short_id;

  -- Schema үүсгэх (аль хэдийн байгаа бол алгасна)
  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', v_schema_name);

  -- App user-д USAGE эрх олгох
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO s_project_app_user', v_schema_name);

  -- Schema дотор үүсэх хүснэгтүүдэд автоматаар DML эрх олгох
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO s_project_app_user',
    v_schema_name
  );

  -- tenants хүснэгтэд schema_name хадгалах
  UPDATE tenants SET schema_name = v_schema_name WHERE id = p_tenant_id;

  RETURN v_schema_name;
END;
$$;

-- 3. clone_tables_to_schema — public schema-н хүснэгтүүдийг tenant schema-д хуулах
--    LIKE ... INCLUDING ALL: structure + CHECK constraints + indexes + defaults хуулна
--    FK constraints хуулагдахгүй (PostgreSQL-ийн зориудын зан — cross-schema FK-г гараар зохицуулна)
CREATE OR REPLACE FUNCTION clone_tables_to_schema(
  p_schema_name TEXT,
  p_tenant_id   UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- mr_headers хуулах
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I.mr_headers (LIKE public.mr_headers INCLUDING ALL)',
    p_schema_name
  );

  -- mr_items хуулах
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I.mr_items (LIKE public.mr_items INCLUDING ALL)',
    p_schema_name
  );

  -- approval_logs хуулах
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I.approval_logs (LIKE public.approval_logs INCLUDING ALL)',
    p_schema_name
  );

  -- workflow_instances хуулах
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I.workflow_instances (LIKE public.workflow_instances INCLUDING ALL)',
    p_schema_name
  );

  -- workflow_step_logs хуулах
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I.workflow_step_logs (LIKE public.workflow_step_logs INCLUDING ALL)',
    p_schema_name
  );

  -- outbox_events хуулах
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I.outbox_events (LIKE public.outbox_events INCLUDING ALL)',
    p_schema_name
  );

  -- ── RLS: mr_headers ────────────────────────────────────────
  -- RULE-12: RESTRICTIVE + NULLIF(current_setting(...), '')::uuid
  EXECUTE format('ALTER TABLE %I.mr_headers ENABLE ROW LEVEL SECURITY', p_schema_name);
  EXECUTE format('ALTER TABLE %I.mr_headers FORCE ROW LEVEL SECURITY', p_schema_name);
  EXECUTE format($pol$
    CREATE POLICY rls_mr_headers ON %I.mr_headers
      AS RESTRICTIVE FOR ALL TO s_project_app_user
      USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  $pol$, p_schema_name);

  -- ── RLS: mr_items ──────────────────────────────────────────
  EXECUTE format('ALTER TABLE %I.mr_items ENABLE ROW LEVEL SECURITY', p_schema_name);
  EXECUTE format('ALTER TABLE %I.mr_items FORCE ROW LEVEL SECURITY', p_schema_name);
  EXECUTE format($pol$
    CREATE POLICY rls_mr_items ON %I.mr_items
      AS RESTRICTIVE FOR ALL TO s_project_app_user
      USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  $pol$, p_schema_name);

  -- ── RLS: approval_logs ─────────────────────────────────────
  EXECUTE format('ALTER TABLE %I.approval_logs ENABLE ROW LEVEL SECURITY', p_schema_name);
  EXECUTE format('ALTER TABLE %I.approval_logs FORCE ROW LEVEL SECURITY', p_schema_name);
  EXECUTE format($pol$
    CREATE POLICY rls_approval_logs ON %I.approval_logs
      AS RESTRICTIVE FOR ALL TO s_project_app_user
      USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  $pol$, p_schema_name);

  -- ── RLS: outbox_events ─────────────────────────────────────
  EXECUTE format('ALTER TABLE %I.outbox_events ENABLE ROW LEVEL SECURITY', p_schema_name);
  EXECUTE format('ALTER TABLE %I.outbox_events FORCE ROW LEVEL SECURITY', p_schema_name);
  EXECUTE format($pol$
    CREATE POLICY rls_outbox_events ON %I.outbox_events
      AS RESTRICTIVE FOR ALL TO s_project_app_user
      USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  $pol$, p_schema_name);

  -- workflow_instances / step_logs: RLS шаардлага хэрэв байгаа бол нэмэх
  -- (workflow нь tenant_id-тэй тул нэмэх нь зөв)
  EXECUTE format('ALTER TABLE %I.workflow_instances ENABLE ROW LEVEL SECURITY', p_schema_name);
  EXECUTE format('ALTER TABLE %I.workflow_instances FORCE ROW LEVEL SECURITY', p_schema_name);
  EXECUTE format($pol$
    CREATE POLICY rls_workflow_instances ON %I.workflow_instances
      AS RESTRICTIVE FOR ALL TO s_project_app_user
      USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  $pol$, p_schema_name);

  EXECUTE format('ALTER TABLE %I.workflow_step_logs ENABLE ROW LEVEL SECURITY', p_schema_name);
  EXECUTE format('ALTER TABLE %I.workflow_step_logs FORCE ROW LEVEL SECURITY', p_schema_name);
  EXECUTE format($pol$
    CREATE POLICY rls_workflow_step_logs ON %I.workflow_step_logs
      AS RESTRICTIVE FOR ALL TO s_project_app_user
      USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  $pol$, p_schema_name);

END;
$$;

-- 4. deprovision_tenant_schema — Enterprise-аас shared руу буцах үед schema устгана
CREATE OR REPLACE FUNCTION deprovision_tenant_schema(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schema_name TEXT;
BEGIN
  SELECT schema_name INTO v_schema_name FROM tenants WHERE id = p_tenant_id;

  IF v_schema_name IS NOT NULL THEN
    -- Schema + бүх агуулгыг устгана (CASCADE)
    EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', v_schema_name);
    -- tenants хүснэгтэд NULL болгох
    UPDATE tenants SET schema_name = NULL WHERE id = p_tenant_id;
  END IF;
END;
$$;

-- 5. Index: schema_name-р хурдан хайлт хийх
CREATE INDEX IF NOT EXISTS idx_tenants_schema_name ON tenants (schema_name)
  WHERE schema_name IS NOT NULL;
