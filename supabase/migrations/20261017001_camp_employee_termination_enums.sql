-- ============================================================
-- v0.2.2 Блок 5 — ажлаас гаргах: enum утгууд (2026-10-17)
-- ============================================================
-- Tech plan: 07_v0.2.2_tech_plan.md §3.6, §13 (Блок 5)
-- RULE-15: ADD VALUE-г тусдаа migration-д — шинэ утгыг ижил transaction-д ашиглах боломжгүй
--          (partial index `WHERE status <> 'TERMINATED'` нь 20261017002-т).
--
-- Rollback: PostgreSQL enum-оос утга хасах боломжгүй — утгыг ашигласан мөр байхгүй үед л хоргүй үлдэнэ.
-- ============================================================

ALTER TYPE "CampEmployeeStatus" ADD VALUE IF NOT EXISTS 'TERMINATED';
ALTER TYPE "CampAuditAction"    ADD VALUE IF NOT EXISTS 'TERMINATE';
ALTER TYPE "CampAuditAction"    ADD VALUE IF NOT EXISTS 'REHIRE';
