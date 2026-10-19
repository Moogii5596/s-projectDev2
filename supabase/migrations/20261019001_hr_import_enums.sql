-- ============================================================
-- v0.2.3 Блок D — өгөгдлийн импорт: enum утгууд (2026-10-19)
-- ============================================================
-- Tech plan: 12_v0.2.3_data_import.md §2 (S4–S7)
-- RULE-15: ADD VALUE-г тусдаа migration-д — шинэ утгыг ижил transaction-д ашиглах боломжгүй.
--
-- Rollback: PostgreSQL enum-оос утга хасах боломжгүй — утгыг ашигласан мөр байхгүй үед хоргүй үлдэнэ.
-- ============================================================

ALTER TYPE "CampDataImportType" ADD VALUE IF NOT EXISTS 'POSITIONS';
ALTER TYPE "CampDataImportType" ADD VALUE IF NOT EXISTS 'FORMER_EMPLOYEES';
ALTER TYPE "CampDataImportType" ADD VALUE IF NOT EXISTS 'BUILDING_TYPES';
ALTER TYPE "CampDataImportType" ADD VALUE IF NOT EXISTS 'BUILDINGS';
ALTER TYPE "CampDataImportType" ADD VALUE IF NOT EXISTS 'ROOMS';
ALTER TYPE "CampDataImportType" ADD VALUE IF NOT EXISTS 'ROOM_ALLOCATIONS';
