-- ============================================================
-- v0.2.2 Блок 3 — Урилга ба нууц үг сэргээх токен (ADR-003 §2.3, D-03) (2026-10-13)
-- ============================================================
-- Tech plan: 07_v0.2.2_tech_plan.md §3.5 (дугаар: урилга = 005 — Блок 3 нь Блок 5-аас өмнө; Supabase CLI дараалал)
--
-- Токен өөрөө хадгалагдахгүй: зөвхөн SHA-256 hash (hex). Токен = 32 санамсаргүй байт (base64url) — нэг удаа л харагдана.
--   purpose INVITE — шинэ хэрэглэгч нууц үгээ үүсгэнэ (72 цаг)
--   purpose RESET  — "нууц үг мартсан" (1 цаг)
--   channel LINK   — админ линкийг хуулж өгнө; EMAIL — системийн имэйлээр
-- Нэг хэрэглэгчид нэг зорилгоор идэвхтэй ганц токен (шинэ үүсгэхэд хуучныг цуцална — app код).
--
-- Rollback: DROP TABLE core_user_invites; DROP TYPE "CoreInvitePurpose"; DROP TYPE "CoreInviteChannel";
-- ============================================================

CREATE TYPE "CoreInvitePurpose" AS ENUM ('INVITE', 'RESET');
CREATE TYPE "CoreInviteChannel" AS ENUM ('LINK', 'EMAIL');

CREATE TABLE core_user_invites (
  id          UUID                NOT NULL PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id   UUID                NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID                NOT NULL,
  token_hash  TEXT                NOT NULL,
  purpose     "CoreInvitePurpose" NOT NULL,
  channel     "CoreInviteChannel" NOT NULL,
  expires_at  TIMESTAMPTZ         NOT NULL,
  used_at     TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ,
  created_by  UUID,               -- core_users.id (админ); RESET (өөрөө хүссэн) бол NULL
  created_at  TIMESTAMPTZ         NOT NULL DEFAULT clock_timestamp(),
  updated_at  TIMESTAMPTZ         NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fk_core_user_invites_user FOREIGN KEY (tenant_id, user_id)
    REFERENCES core_users (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT ck_core_user_invites_hash CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_core_user_invites_expiry CHECK (expires_at > created_at)
);
-- Токеноор хайх (tenant-гүй — нэвтрэлтгүй хуудас; системийн холболтоор, hash-аар л)
CREATE UNIQUE INDEX uq_core_user_invites_token ON core_user_invites (token_hash);
CREATE INDEX idx_core_user_invites_user ON core_user_invites (tenant_id, user_id, purpose) WHERE used_at IS NULL AND revoked_at IS NULL;

SELECT camp_apply_tenant_rls('core_user_invites');
