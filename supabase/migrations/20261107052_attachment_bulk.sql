-- v0.2.4 FILE-01 — bulk attachment naming, preview, and versioned replacement.
ALTER TABLE core_attachments
  ADD COLUMN doc_type TEXT,
  ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  ADD COLUMN doc_date DATE,
  ADD COLUMN superseded_at TIMESTAMPTZ;

ALTER TABLE core_attachments
  ADD CONSTRAINT ck_core_attachments_doc_type
  CHECK (doc_type IS NULL OR doc_type ~ '^[A-Z][A-Z0-9_]{0,29}$');

CREATE UNIQUE INDEX uq_core_attachments_current_document
  ON core_attachments (tenant_id, entity_type, entity_id, doc_type)
  WHERE doc_type IS NOT NULL AND superseded_at IS NULL AND deleted_at IS NULL;

CREATE TABLE core_attachment_name_patterns (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type ~ '^[A-Z][A-Z0-9_]{1,59}$'),
  pattern     TEXT NOT NULL CHECK (char_length(pattern) BETWEEN 1 AND 100),
  updated_by  UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_core_attachment_name_patterns_tenant_entity UNIQUE (tenant_id, entity_type),
  CONSTRAINT fk_core_attachment_name_patterns_updated_by
    FOREIGN KEY (tenant_id, updated_by) REFERENCES core_users (tenant_id, id)
);

SELECT camp_apply_tenant_rls('core_attachment_name_patterns');
