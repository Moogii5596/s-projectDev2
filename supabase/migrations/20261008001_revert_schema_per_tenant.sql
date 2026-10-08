-- ============================================================
-- v0.1.5 Phase 2: Schema-per-Tenant-аас татгалзах (ADR-001, шийдвэр B — 2026-10-08)
-- ============================================================
-- 20260921004_schema_isolation.sql-ийн нэмсэн зүйлсийг буцаана:
--   - provision_tenant_schema / clone_tables_to_schema / deprovision_tenant_schema функцууд
--   - idx_tenants_schema_name index
--   - tenants.schema_name багана
--
-- Tenant тусгаарлалт:
--   - Shared (SaaS) tenant  → RLS (app.tenant_id), өөрчлөгдөхгүй
--   - Enterprise VPC tenant → тусдаа DB + тусдаа deploy (DEPLOYMENT_MODE=dedicated)
--
-- ⚠️ ӨГӨГДӨЛ УСТГАХГҮЙ: өмнө нь provision хийгдсэн `tenant_*` schema байвал
--    энэ migration түүнийг УСТГАХГҮЙ, зөвхөн NOTICE-оор мэдэгдэнэ.
--    Шалгаад гараар устгах:  DROP SCHEMA <нэр> CASCADE;
-- Idempotent: дахин ажиллуулахад алдаа гарахгүй.
-- ============================================================

-- 1. Үлдсэн enterprise schema-уудыг мэдэгдэх (устгахгүй)
DO $$
DECLARE
  r RECORD;
  v_has_column BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'schema_name'
  ) INTO v_has_column;

  IF v_has_column THEN
    FOR r IN EXECUTE
      'SELECT slug, schema_name FROM public.tenants WHERE schema_name IS NOT NULL'
    LOOP
      RAISE NOTICE 'ADR-001: tenant "%" өмнө нь schema "%"-тэй байсан — өгөгдөл хэвээр, гараар шалгаж устгана уу',
        r.slug, r.schema_name;
    END LOOP;
  END IF;

  FOR r IN
    SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant\_%'
  LOOP
    RAISE NOTICE 'ADR-001: үлдсэн schema "%" (DROP SCHEMA % CASCADE; — шалгасны дараа гараар)',
      r.nspname, r.nspname;
  END LOOP;
END;
$$;

-- 2. Provisioning функцууд
DROP FUNCTION IF EXISTS public.provision_tenant_schema(UUID);
DROP FUNCTION IF EXISTS public.clone_tables_to_schema(TEXT, UUID);
DROP FUNCTION IF EXISTS public.deprovision_tenant_schema(UUID);

-- 3. Index + багана (index-ийг эхэлж — RULE-15 дараалал)
DROP INDEX IF EXISTS public.idx_tenants_schema_name;
ALTER TABLE public.tenants DROP COLUMN IF EXISTS schema_name;
