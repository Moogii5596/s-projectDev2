-- ============================================================
-- S Project — Local Development Seed
-- supabase db reset хийхэд автоматаар ажиллана
-- ============================================================

-- 1. Test Tenant
INSERT INTO tenants (id, name, slug, tier, is_active, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  'Локал Тест Tenant',
  'test-tenant',
  'tier1',  -- TierType enum: tier1|tier2|tier3 (0004_add_native_enums.sql)
  true,
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO workflow_definitions (
  tenant_id, name, steps_config, sla_hours, escalation_enabled, delegation_enabled, is_active, created_at, updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  'Default Advanced Approval',
  '{"amount_rules":[{"min":0,"max":1000000,"steps":[{"order":1,"role":"APPROVER","quorum":1}]},{"min":1000000,"max":10000000,"steps":[{"order":1,"role":"APPROVER","quorum":1},{"order":2,"role":"APPROVER","quorum":1}]},{"min":10000000,"max":null,"steps":[{"order":1,"role":"APPROVER","quorum":1},{"order":2,"role":"APPROVER","quorum":1},{"order":3,"role":"APPROVER","quorum":1}]}],"default_sla_hours":48,"escalation_enabled":true,"delegation_enabled":true}',
  48, true, true, true, NOW(), NOW()
)
ON CONFLICT DO NOTHING;

-- 2. Supabase Auth user үүсгэх (Supabase local admin API-аар)
-- ТАЙЛБАР: auth.users-г SQL-ээр шууд insert хийдэггүй — Supabase CLI / edge function ашиглана.
-- Доорх нь core_users-г seed хийдэг. Auth user-г нь суулгасны дараа
-- `supabase auth import` эсвэл Studio-оор нэмнэ.

-- 3. core_users — admin@test.mn (approver)
-- АНХААР: auth_id нь Supabase auth.users.id-тай тохирох ёстой.
-- Хэрэв auth user-г шинээр үүсгэсэн бол auth_id-г UPDATE хийх шаардлагатай.
INSERT INTO core_users (id, tenant_id, auth_id, email, full_name, role, is_active, created_at, updated_at)
VALUES (
  '5b68c426-a8c8-46e7-95f9-30329476c5d1',
  '00000000-0000-0000-0000-000000000003',
  '3e021487-8e45-4627-8326-a802901a0ec1',  -- admin@test.mn Supabase auth UUID
  'admin@test.mn',
  'Admin User',
  'approver',
  true,
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- ✅ ХЯЛБАР АРГА (Phase 3.6.5): `pnpm dev:test-user` — доорх 1–2-ыг автоматаар хийнэ (зөвхөн local) [SEED-002]
-- SETUP CHECKLIST (manual steps after `supabase db reset`):
-- 1. Supabase Studio → Auth → Users → admin@test.mn нэвтрэх эрх шалгах
--    Байхгүй бол: Studio → Add user → email: admin@test.mn, password: test1234
-- 2. auth_id-г шалгах: SELECT auth_id FROM core_users WHERE email = 'admin@test.mn';
--    Тохирохгүй бол: UPDATE core_users SET auth_id = '<new_auth_id>' WHERE email = 'admin@test.mn';
-- ============================================================
