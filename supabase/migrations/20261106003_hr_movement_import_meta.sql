-- ============================================================
-- v0.2.3 Блок R4.1 — ирцийн импортын PREVIEW мета (2026-11-06)
-- ============================================================
-- Tech plan: 09_v0.2.3_tech_plan.md Блок R4 (R-10…R-12). PREVIEW-ийн мөрийг засах / устгах (PATCH …/rows) дараа
-- дахин төлөвлөсөн хариунд загвар (TEMPLATE / SHIFTCHANGE / MANUAL) болон алгассан хуудсыг буцаахад хадгална.
-- Хуучин мөр '{}' → TEMPLATE гэж үзнэ. RLS — хүснэгтийн одоогийн policy хамаарна (шинэ хүснэгт биш).
--
-- Rollback:
--   ALTER TABLE camp_movement_imports DROP COLUMN IF EXISTS preview_meta;
-- ============================================================

ALTER TABLE camp_movement_imports
  ADD COLUMN IF NOT EXISTS preview_meta JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN camp_movement_imports.preview_meta IS 'PREVIEW мета: { format, skippedSheets } (v0.2.3 Блок R4)';
