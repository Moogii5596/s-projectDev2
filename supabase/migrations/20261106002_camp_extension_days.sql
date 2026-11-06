-- ============================================================
-- v0.2.3 Блок R (PIL-24, R-6) — сунгалтын анхдагч хоног кемп бүрт (2026-11-06)
-- ============================================================
-- ShiftChange «Сунах» мөрөнд «N хоног» байхгүй үед ашиглана (анхдагч 7). Байгууллага бүр тохируулна (хатуу код биш).
--
-- Rollback:
--   ALTER TABLE camp_settings DROP COLUMN IF EXISTS extension_default_days;
-- ============================================================

ALTER TABLE camp_settings
  ADD COLUMN IF NOT EXISTS extension_default_days SMALLINT NOT NULL DEFAULT 7
    CHECK (extension_default_days BETWEEN 1 AND 60);

COMMENT ON COLUMN camp_settings.extension_default_days IS 'ShiftChange «Сунах»: хоног заагаагүй үед сунгах анхдагч хоног (v0.2.3 Блок R)';
