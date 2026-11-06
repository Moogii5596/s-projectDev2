-- ============================================================
-- v0.2.3 Блок 4 (PIL-16) — core_users.last_sign_in_at (2026-11-06)
-- ============================================================
-- Tech plan: 09_v0.2.3_tech_plan.md Блок 4 (B4-2)
--   - Амжилттай sign-in бүрт SignInService time() бичнэ.
--   - Migration!: auth.users.last_sign_in_at-ээс нөхнө (хуучин session-ууд ч).
--   - HR «Хэрэглэгч» («Сүүлийн нэвтрэлт») багана — null → «Хэзээ ч нэвтрээгүй».
--
-- Rollback:
--   ALTER TABLE core_users DROP COLUMN IF EXISTS last_sign_in_at;
-- ============================================================

ALTER TABLE core_users
  ADD COLUMN IF NOT EXISTS last_sign_in_at TIMESTAMPTZ;

COMMENT ON COLUMN core_users.last_sign_in_at IS 'v0.2.3 PIL-16 — сүүлийн амжилттай нэвтрэлтийн огноо (UTC)';

-- Нөхвөр: GoTrue-ийн auth.users.last_sign_in_at-ээс хуулна
UPDATE core_users u
SET last_sign_in_at = au.last_sign_in_at
FROM auth.users au
WHERE u.auth_id = au.id
  AND au.last_sign_in_at IS NOT NULL
  AND u.last_sign_in_at IS NULL;
