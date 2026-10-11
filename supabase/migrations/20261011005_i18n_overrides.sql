-- ============================================================
-- v0.2.0 §0.7 — Байгууллагын орчуулгын засвар (2026-10-11)
-- ============================================================
-- Кодонд анхдагч орчуулга (frontend packages/i18n, backend messages.ts) + DB-д байгууллагын засвар
-- → үр дүн = засвар ?? анхдагч. "Системийн тохиргоо → Орчуулга" (OWNER/ADMIN): Excel/CSV татах → засах → оруулах.
-- Шинэ хувилбарт нэмэгдсэн түлхүүр автоматаар орно; байгууллагын засвар хадгалагдана.
-- Түүх (хэн, хэзээ, хуучин → шинэ) — append-only.
-- ============================================================

CREATE TABLE i18n_overrides (
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key         TEXT        NOT NULL CHECK (key ~ '^[A-Za-z0-9_.-]{2,120}$'),
  lang        TEXT        NOT NULL CHECK (lang IN ('mn', 'en', 'zh')),
  text        TEXT        NOT NULL CHECK (length(text) BETWEEN 1 AND 500),
  updated_by  UUID        NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, key, lang),
  CONSTRAINT fk_i18n_overrides_user FOREIGN KEY (tenant_id, updated_by) REFERENCES core_users (tenant_id, id)
);

CREATE TABLE i18n_override_history (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key         TEXT        NOT NULL,
  lang        TEXT        NOT NULL CHECK (lang IN ('mn', 'en', 'zh')),
  old_text    TEXT,                       -- NULL = анхдагч байсан
  new_text    TEXT,                       -- NULL = анхдагч руу буцаасан
  source      TEXT        NOT NULL CHECK (source IN ('IMPORT', 'RESET')),
  changed_by  UUID        NOT NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fk_i18n_history_user FOREIGN KEY (tenant_id, changed_by) REFERENCES core_users (tenant_id, id)
);
CREATE INDEX idx_i18n_history ON i18n_override_history (tenant_id, changed_at DESC, id DESC);
CREATE INDEX idx_i18n_history_key ON i18n_override_history (tenant_id, key, changed_at DESC);

-- RLS (RLS-004): PERMISSIVE TO app_user + FORCE + GRANT
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['i18n_overrides', 'i18n_override_history'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I AS PERMISSIVE FOR ALL TO app_user '
      'USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) '
      'WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      'tenant_isolation_' || t, t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON i18n_overrides TO app_user;
GRANT SELECT, INSERT ON i18n_override_history TO app_user;
