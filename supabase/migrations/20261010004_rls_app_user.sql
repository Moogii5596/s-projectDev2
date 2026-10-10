-- ============================================================
-- Phase 4.8.2 — app_user-ээр ажиллахад бэлтгэх RLS засвар (2026-10-10)
-- ============================================================
-- Аудит (supabase/dev/rls_audit.sql, таны DB 12:19): 52 хүснэгт, 49 нь tenant_id-тай, 39 нь зөв.
--   NO_GRANT (8)  : workflow_definitions, workflow_instances, workflow_step_logs, workflow_sla_logs,
--                   workflow_delegations, idempotency_keys, installed_modules, approval_logs
--   ZERO_ROWS (2) : dlq_events, tenant_routes — зөвхөн RESTRICTIVE policy (PERMISSIVE-гүй бол 0 мөр) [RLS-004]
--   approval_logs : PERMISSIVE policy буруу GUC (`app.current_tenant_id`)-г уншдаг — хаана ч тохируулдаггүй
--   current_tenant_id(): `''::uuid` → GUC тохируулаагүй үед 0 мөр биш АЛДАА [RLS-003]
--   extensions schema: app_user-д USAGE алга (Supabase-д uuid_generate_v4 default тэнд байдаг)
--
-- Энэ migration апп-ын зан төлөвийг ӨӨРЧЛӨХГҮЙ: апп одоогоор `postgres` (BYPASSRLS)-ээр холбогддог.
-- `app_user` руу шилжих нь 4.8.4 (DATABASE_URL), бүх тест ногоон болсны дараа.
-- `tenants`, `super_admins`-д app_user ЭРХГҮЙ хэвээр — tenant lookup/onboarding нь системийн холболтоор (4.8.4).
-- Давтан ажиллуулахад аюулгүй (policy байгаа эсэхийг шалгана).
-- ============================================================

-- 1. Буруу GUC-тэй approval_logs policy (TO PUBLIC) — устгана
DROP POLICY IF EXISTS "approval_logs_tenant_isolation" ON approval_logs;

-- 2. PERMISSIVE tenant policy + GRANT (RESTRICTIVE policy-нууд ижил нөхцөлтэй тул хэвээр үлдэнэ)
DO $$
DECLARE
  t text;
  privs text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'workflow_definitions', 'workflow_instances', 'workflow_step_logs', 'workflow_sla_logs',
    'workflow_delegations', 'idempotency_keys', 'installed_modules', 'approval_logs',
    'dlq_events', 'tenant_routes'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'tenant_isolation_' || t
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I AS PERMISSIVE FOR ALL TO app_user '
        'USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) '
        'WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
        'tenant_isolation_' || t, t);
    END IF;
    -- dlq_events: DELETE-гүй (өмнөх шийдвэр, 20260921002) — бусад нь бүрэн CRUD
    privs := CASE WHEN t = 'dlq_events' THEN 'SELECT, INSERT, UPDATE' ELSE 'SELECT, INSERT, UPDATE, DELETE' END;
    EXECUTE format('GRANT %s ON %I TO app_user', privs, t);
  END LOOP;
END $$;

-- 3. current_tenant_id(): GUC хоосон/тохируулаагүй → NULL (→ 0 мөр), алдаа биш [RLS-003]
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid;
$$;

-- 4. Supabase: extensions schema (uuid_generate_v4 гэх мэт default) — цэвэр PostgreSQL-д schema байхгүй бол алгасна
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
    GRANT USAGE ON SCHEMA extensions TO app_user;
  END IF;
END $$;
