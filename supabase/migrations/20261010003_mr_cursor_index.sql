-- ============================================================
-- Phase 3.6.1 — MR жагсаалтын cursor pagination index (2026-10-10)
-- ============================================================
-- Query (material-requisition.service.ts findAll, cursor горим, статус шүүлтгүй):
--   WHERE tenant_id = $1 AND created_at <= $c AND (created_at < $c OR id < $cid)
--   ORDER BY created_at DESC, id DESC LIMIT n+1
-- Өмнө нь зөвхөн (tenant_id) болон (tenant_id, status, created_at DESC) index байсан →
-- статусгүй жагсаалт tenant-ийн бүх мөрийг эрэмбэлдэг байв.
-- Статус шүүлттэй хувилбар idx_mr_headers_tenant_status_created-ийг ашиглана.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_mr_headers_cursor
  ON mr_headers (tenant_id, created_at DESC, id DESC);
