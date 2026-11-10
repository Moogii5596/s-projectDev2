-- ============================================================
-- v0.2.4 Блок 8 (FILE-01, M-7) — файлын ерөнхий сервис
--   core_attachments          — объектын (entity_type/id) хавсралт; диск дээр AES-256-GCM-ээр шифрлэгдсэн
--   core_attachment_access    — хандалтын лог (PII төрлийн хавсралтын татах/устгах/оруулах)
-- Устгалт = soft (deleted_at); дискний файлыг цэвэрлэх ажил тусдаа (нөөцөөс сэргээх боломжтой хадгална).
-- ============================================================

CREATE TABLE core_attachments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type   TEXT NOT NULL CHECK (entity_type ~ '^[A-Z][A-Z0-9_]{1,59}$'),
  entity_id     UUID NOT NULL,
  file_name     TEXT NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 255),
  mime_type     TEXT NOT NULL CHECK (mime_type ~ '^[a-z]+/[a-z0-9.+-]+$'),
  size_bytes    INTEGER NOT NULL CHECK (size_bytes > 0),
  sha256        TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  storage_key   TEXT NOT NULL,
  encryption    TEXT NOT NULL DEFAULT 'AES-256-GCM' CHECK (encryption IN ('AES-256-GCM')),
  key_id        TEXT NOT NULL,
  uploaded_by   UUID NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,
  deleted_by    UUID,
  -- camp_apply_tenant_rls UPDATE trigger (update_updated_at_column) шаарддаг
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_core_attachments_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_core_attachments_storage_key UNIQUE (storage_key),
  CONSTRAINT fk_core_attachments_uploaded_by FOREIGN KEY (tenant_id, uploaded_by) REFERENCES core_users (tenant_id, id)
);
SELECT camp_apply_tenant_rls('core_attachments');
CREATE INDEX idx_core_attachments_entity ON core_attachments (tenant_id, entity_type, entity_id) WHERE deleted_at IS NULL;

CREATE TABLE core_attachment_access (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  attachment_id UUID NOT NULL,
  user_id       UUID NOT NULL,
  action        TEXT NOT NULL CHECK (action IN ('UPLOAD', 'DOWNLOAD', 'DELETE')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_core_attachment_access_attachment FOREIGN KEY (tenant_id, attachment_id) REFERENCES core_attachments (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_core_attachment_access_user FOREIGN KEY (tenant_id, user_id) REFERENCES core_users (tenant_id, id) ON DELETE CASCADE
);
SELECT camp_apply_tenant_rls('core_attachment_access');
CREATE INDEX idx_core_attachment_access_attachment ON core_attachment_access (tenant_id, attachment_id, created_at DESC);
