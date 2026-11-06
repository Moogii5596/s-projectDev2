-- ============================================================
-- v0.2.3 Блок R (PIL-24, R-6) — ээлжийн сунгалт: зохицуулалтын шалтгаан EXTENSION (2026-11-06)
-- ============================================================
-- Tech plan: 09_v0.2.3_tech_plan.md Блок R (R-6). ShiftChange «Сунах» → camp_shift_adjustments (reason_type = EXTENSION).
-- RULE-15: ADD VALUE-г тусдаа migration-д — шинэ утгыг ижил transaction-д ашиглах боломжгүй.
--
-- Rollback: PostgreSQL enum-оос утга хасах боломжгүй — утгыг ашигласан мөр байхгүй үед хоргүй үлдэнэ.
-- ============================================================

ALTER TYPE "CampShiftAdjustmentReason" ADD VALUE IF NOT EXISTS 'EXTENSION';
