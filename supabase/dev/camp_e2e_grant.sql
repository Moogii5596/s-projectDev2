-- ============================================================
-- DEV / E2E: admin@test.mn (seed, approver) хэрэглэгчид "Кемп админ" роль (бүх кемп) олгоно.
-- apps/e2e/tests/camp.spec.ts үүнийг шаардана. Давтан ажиллуулж болно (idempotent).
-- Production-д ХЭРЭГЛЭХГҮЙ.
--
-- Windows (ENV-009 — PowerShell pipe кирилл эвддэг тул файлаар):
--   $db = docker ps --filter "name=supabase_db" --format "{{.Names}}"
--   docker cp supabase/dev/camp_e2e_grant.sql "${db}:/tmp/camp_e2e_grant.sql"
--   docker exec -e PGPASSWORD=postgres $db psql -h 127.0.0.1 -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f /tmp/camp_e2e_grant.sql
-- Эрхийн cache 5 минут (Redis) — өмнө нь /camp нээсэн бол core-kernel-ийг дахин асаах эсвэл 5 мин хүлээнэ.
-- ============================================================
DO $$
DECLARE
  v_user   core_users%ROWTYPE;
  v_role   uuid;
BEGIN
  SELECT * INTO v_user FROM core_users WHERE email = 'admin@test.mn' ORDER BY created_at LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin@test.mn core_users-д алга (supabase/seed.sql)';
  END IF;
  PERFORM camp_seed_default_roles(v_user.tenant_id);   -- анхдагч роль байхгүй бол үүсгэнэ (idempotent)
  SELECT id INTO v_role FROM camp_roles WHERE tenant_id = v_user.tenant_id AND system_code = 'CAMP_ADMIN';
  INSERT INTO camp_user_roles (tenant_id, user_id, role_id, camp_id)
  VALUES (v_user.tenant_id, v_user.id, v_role, NULL)
  ON CONFLICT DO NOTHING;
  RAISE NOTICE 'OK: % → Кемп админ (бүх кемп), tenant %', v_user.email, v_user.tenant_id;
END $$;
