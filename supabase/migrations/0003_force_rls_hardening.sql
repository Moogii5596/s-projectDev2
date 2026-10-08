-- ============================================================
-- S Project: 0003_force_rls_hardening.sql
-- RLS Hardening: app_user BYPASSRLS эрхгүй болгох
-- Connection pool хамгаалалт
-- ============================================================

-- 1. app_user-ийн BYPASSRLS эрхийг хасах (хамгийн чухал!)
ALTER ROLE app_user NOBYPASSRLS;

-- 2. app_user-д шаардлагатай хамгийн бага эрх олгох
GRANT CONNECT ON DATABASE postgres TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;

-- Tables: SELECT, INSERT, UPDATE, DELETE (DELETE зарим хүснэгтэд хязгаарлагдана)
GRANT SELECT, INSERT, UPDATE, DELETE ON core_users TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON mr_headers TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON mr_items TO app_user;
GRANT SELECT, INSERT, UPDATE ON outbox_events TO app_user;  -- DELETE байхгүй

-- Sequences
GRANT USAGE ON SEQUENCE mr_number_seq TO app_user;

-- 3. Connection pool cleanup function
-- Session дуусахад app.tenant_id, app.user_id цэвэрлэнэ
CREATE OR REPLACE FUNCTION cleanup_tenant_context()
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.tenant_id', '', false);
  PERFORM set_config('app.user_id', '', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Tenant context шалгах function (тест-д ашиглана)
CREATE OR REPLACE FUNCTION assert_tenant_context_set() RETURNS void AS $$
DECLARE
  v_tenant_id TEXT := current_setting('app.tenant_id', true);
BEGIN
  IF v_tenant_id IS NULL OR v_tenant_id = '' THEN
    RAISE EXCEPTION 'SECURITY: app.tenant_id тохируулаагүй байна. RLS ажиллахгүй.'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 5. Seed data: test tenant-үүд (development зориулалт)
INSERT INTO tenants (id, slug, name, tier, is_active) VALUES
  ('00000000-0000-0000-0000-000000000001', 'tenant-a', 'Tenant A (Тест)', 'tier1', true),
  ('00000000-0000-0000-0000-000000000002', 'tenant-b', 'Tenant B (Тест)', 'tier1', true),
  ('00000000-0000-0000-0000-000000000003', 'test-tenant', 'Локал Тест Tenant', 'tier1', true)
ON CONFLICT (slug) DO NOTHING;

-- ── Баталгаажуулалт ──────────────────────────────────────────
DO $$
DECLARE
  v_tenant_a_rls BOOLEAN;
  v_bypass BOOLEAN;
BEGIN
  -- mr_headers RLS идэвхтэй эсэхийг шалгах
  SELECT relrowsecurity INTO v_tenant_a_rls
  FROM pg_class WHERE relname = 'mr_headers';

  IF NOT v_tenant_a_rls THEN
    RAISE EXCEPTION 'ХУРАЛДААН: mr_headers дээр RLS идэвхгүй байна!';
  END IF;

  -- app_user BYPASSRLS эрхгүй эсэхийг шалгах
  SELECT rolbypassrls INTO v_bypass
  FROM pg_roles WHERE rolname = 'app_user';

  IF v_bypass THEN
    RAISE EXCEPTION 'АЮУЛ: app_user BYPASSRLS эрхтэй байна!';
  END IF;

  RAISE NOTICE '✅ RLS Hardening баталгаажлаа:';
  RAISE NOTICE '  - mr_headers RLS: %', v_tenant_a_rls;
  RAISE NOTICE '  - app_user BYPASSRLS: %', v_bypass;
END;
$$;
