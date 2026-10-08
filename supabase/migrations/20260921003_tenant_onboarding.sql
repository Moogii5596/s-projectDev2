-- ============================================================
-- Sprint 4: Tenant Onboarding — шинэ баганууд + super_admins
-- RULE-11: uuid_generate_v7()
-- RULE-12: FORCE + RESTRICTIVE + app_user (s_project_app_user БИШ!)
-- ⚠️  settings аль хэдийн байна (0001_initial_schema.sql) → давтахгүй
-- ============================================================

-- ── 1. tenants: шинэ баганууд ────────────────────────────────
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS max_users    INTEGER     NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS max_mfes     INTEGER     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;
-- ⚠️  settings JSONB аль хэдийн байна → давтан нэмэхгүй

-- ── 2. UserRole enum-д 'owner' нэмэх ─────────────────────────
-- ADD VALUE IF NOT EXISTS — transaction дотор ажиллана (PostgreSQL 12+),
-- гэхээ мөн migration дотор ашиглах боломжгүй тул Prisma schema дотор харагдана
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'owner';

-- ── 3. super_admins хүснэгт ──────────────────────────────────
-- Platform-level super admin (RLS bypass — backend service layer шалгана)
CREATE TABLE IF NOT EXISTS super_admins (
  user_id    UUID        PRIMARY KEY REFERENCES core_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- RLS: Platform-level table — app_user directly access хийж чадахгүй
-- Backend service role key-г ашигладаг (RLS-г bypass хийнэ)
ALTER TABLE super_admins ENABLE ROW LEVEL SECURITY;

-- RULE-12: FORCE + RESTRICTIVE + app_user
-- Бодлого байхгүй → app_user нэвтрэх эрхгүй (service role key bypass хийнэ)
CREATE POLICY "super_admins_service_only"
  ON super_admins
  AS RESTRICTIVE
  FOR ALL
  TO app_user
  USING (false);  -- app_user бүрийг хааж, service role ашиглана

