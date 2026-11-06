-- ============================================================
-- v0.2.3 Блок R7 (PIL-25, R-9, R7-b) — кодгүй ажилтны автомат кодын угтвар (2026-11-06)
-- ============================================================
-- Tech plan: 09_v0.2.3_tech_plan.md Блок R7. HR ID-гүй ажилтан (харуул, ээлжийн унаа, R9-ийн түр бүртгэл) →
-- систем `<угтвар><4 орон>` (анхдагч Z0001) код олгоно. Дугаарлалт tenant даяар (код tenant-д давхардахгүй — uq_camp_employees_code).
-- Угтварыг байгууллага / кемп бүр тохируулна (хатуу код биш).
--
-- Rollback:
--   ALTER TABLE camp_settings DROP COLUMN IF EXISTS auto_code_prefix;
-- ============================================================

ALTER TABLE camp_settings
  ADD COLUMN IF NOT EXISTS auto_code_prefix TEXT NOT NULL DEFAULT 'Z'
    CHECK (auto_code_prefix ~ '^[A-Z]{1,3}$');

COMMENT ON COLUMN camp_settings.auto_code_prefix IS 'Кодгүй ажилтны автомат кодын угтвар (Z → Z0001) — v0.2.3 Блок R7';
