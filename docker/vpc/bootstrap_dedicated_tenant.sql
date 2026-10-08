-- ============================================================
-- Enterprise VPC (DEPLOYMENT_MODE=dedicated) — анхны tenant + owner үүсгэх
-- ADR-001 · Runbook: docs/07_Tech_Stack_and_Environment/03_Enterprise_VPC_Deployment.md
-- ============================================================
-- Ажиллуулах (postgres эрхтэй — RLS-ийг тойрно, нэг удаагийн bootstrap):
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 \
--     -v slug=acme -v name='ACME Mining LLC' \
--     -v admin_auth_id=<Supabase auth.users.id> -v admin_email=admin@acme.mn \
--     -v admin_full_name='Админ' \
--     -f docker/vpc/bootstrap_dedicated_tenant.sql
--
-- slug  = .env.vpc-ийн DEDICATED_TENANT_SLUG-тэй ЯГ ИЖИЛ байх ёстой.
-- admin_auth_id = Supabase Auth-д үүсгэсэн хэрэглэгчийн id (RULE-13: core_users.auth_id).
-- Idempotent: дахин ажиллуулахад давхар бичлэг үүсгэхгүй.
-- ============================================================

BEGIN;

-- 1. Tenant (Enterprise VPC = tier2)
INSERT INTO tenants (slug, name, tier, is_active, onboarded_at)
VALUES (:'slug', :'name', 'tier2', true, now())
ON CONFLICT (slug) DO NOTHING;

-- 2. Owner хэрэглэгч (RULE-13: auth_id = Supabase UUID, core_users.id тусдаа)
INSERT INTO core_users (tenant_id, auth_id, email, full_name, role, is_active)
SELECT t.id, :'admin_auth_id'::uuid, :'admin_email', :'admin_full_name', 'owner', true
FROM tenants t
WHERE t.slug = :'slug'
  AND NOT EXISTS (SELECT 1 FROM core_users u WHERE u.auth_id = :'admin_auth_id'::uuid);

-- 3. Default workflow (20260922003_workflow_default_definitions.sql-тэй ижил дүрэм)
INSERT INTO workflow_definitions (
  tenant_id, name, steps_config, sla_hours, escalation_enabled, delegation_enabled, is_active
)
SELECT
  t.id,
  'Default Advanced Approval',
  '{"amount_rules":[{"min":0,"max":1000000,"steps":[{"order":1,"role":"APPROVER","quorum":1}]},{"min":1000000,"max":10000000,"steps":[{"order":1,"role":"APPROVER","quorum":1},{"order":2,"role":"APPROVER","quorum":1}]},{"min":10000000,"max":null,"steps":[{"order":1,"role":"APPROVER","quorum":1},{"order":2,"role":"APPROVER","quorum":1},{"order":3,"role":"APPROVER","quorum":1}]}],"default_sla_hours":48,"escalation_enabled":true,"delegation_enabled":true}'::jsonb,
  48, true, true, true
FROM tenants t
WHERE t.slug = :'slug'
  AND NOT EXISTS (
    SELECT 1 FROM workflow_definitions w WHERE w.tenant_id = t.id AND w.is_active = true
  );

-- 4. Шалгах
SELECT t.slug, t.tier, t.is_active,
       (SELECT count(*) FROM core_users u WHERE u.tenant_id = t.id)          AS users,
       (SELECT count(*) FROM workflow_definitions w WHERE w.tenant_id = t.id) AS workflows
FROM tenants t WHERE t.slug = :'slug';

COMMIT;
