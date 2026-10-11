-- ============================================================
-- v0.2.0 §0.5 — Мастер өгөгдлийн Excel / хүснэгтийн импорт (2026-10-11)
-- ============================================================
-- Ажилтан (FB-08), хэлтэс (FB-02) — урьдчилсан харагдац (PREVIEW) → баталгаажуулах (CONFIRMED) / цуцлах.
-- Ирцийн импорттой (camp_movement_imports) ижил зарчим: задалсан мөрүүд DB-д (Redis биш), CONFIRM эндээс уншиж
-- DB-тэй ДАХИН шалгана. Мөрийн алдаа = код + параметр (хариу өгөх үед хэрэглэгчийн хэлээр орчуулна).
-- Зөвхөн НЭМЭЛТ: шинэ төрөл + шинэ хүснэгт.
-- ============================================================

CREATE TYPE "CampDataImportType"   AS ENUM ('EMPLOYEES', 'DEPARTMENTS');
CREATE TYPE "CampDataImportStatus" AS ENUM ('PREVIEW', 'CONFIRMED', 'CANCELLED');
CREATE TYPE "CampDataImportSource" AS ENUM ('XLSX', 'GRID');

CREATE TABLE camp_data_imports (
  id             UUID                   PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id      UUID                   NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camp_id        UUID                   NOT NULL,
  type           "CampDataImportType"   NOT NULL,
  source         "CampDataImportSource" NOT NULL,
  file_name      TEXT,                                          -- XLSX бол
  status         "CampDataImportStatus" NOT NULL DEFAULT 'PREVIEW',
  total_rows     INTEGER                NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  create_rows    INTEGER                NOT NULL DEFAULT 0 CHECK (create_rows >= 0),
  update_rows    INTEGER                NOT NULL DEFAULT 0 CHECK (update_rows >= 0),
  unchanged_rows INTEGER                NOT NULL DEFAULT 0 CHECK (unchanged_rows >= 0),
  error_rows     INTEGER                NOT NULL DEFAULT 0 CHECK (error_rows >= 0),
  parsed_rows    JSONB                  NOT NULL DEFAULT '[]'::jsonb,   -- [{row, values, errors:[{column, code, params}]}]
  uploaded_by    UUID                   NOT NULL,
  confirmed_by   UUID,
  confirmed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ            NOT NULL DEFAULT clock_timestamp(),
  updated_at     TIMESTAMPTZ            NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT chk_camp_data_imports_rows CHECK (create_rows + update_rows + unchanged_rows + error_rows = total_rows),
  CONSTRAINT chk_camp_data_imports_confirmed CHECK ((status = 'CONFIRMED') = (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)),
  CONSTRAINT chk_camp_data_imports_parsed CHECK (jsonb_typeof(parsed_rows) = 'array'),
  CONSTRAINT fk_camp_data_imports_camp         FOREIGN KEY (tenant_id, camp_id)      REFERENCES camps (tenant_id, id),
  CONSTRAINT fk_camp_data_imports_uploaded_by  FOREIGN KEY (tenant_id, uploaded_by)  REFERENCES core_users (tenant_id, id),
  CONSTRAINT fk_camp_data_imports_confirmed_by FOREIGN KEY (tenant_id, confirmed_by) REFERENCES core_users (tenant_id, id)
);
CREATE INDEX idx_camp_data_imports_cursor ON camp_data_imports (tenant_id, camp_id, created_at DESC, id DESC);

-- RLS (RLS-004) + GRANT + updated_at trigger — Camp-ийн нийтлэг функц (20261009001)
SELECT camp_apply_tenant_rls('camp_data_imports');
