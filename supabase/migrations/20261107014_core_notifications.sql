-- ============================================================
-- v0.2.4 Блок 7 (NTF-01) — Мэдэгдэл: апп доторх + имэйл
--   core_notifications       — хэрэглэгч бүрийн мэдэгдэл (текст = i18n түлхүүр + params; хэрэглэгчийн хэлээр харуулна)
--   core_notification_prefs  — хэрэглэгч × төрөл: апп доторх / имэйл суваг (мөр байхгүй = төрлийн анхдагч)
-- Имэйлийг мэдэгдлийн мөр дээрх email_status-аар (transactional outbox) cron илгээнэ.
-- ============================================================

CREATE TABLE core_notifications (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL,
  type          TEXT NOT NULL CHECK (type ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$'),
  title_key     TEXT NOT NULL CHECK (btrim(title_key) <> ''),
  body_key      TEXT,
  params        JSONB NOT NULL DEFAULT '{}'::jsonb,
  link          TEXT CHECK (link IS NULL OR link ~ '^/[^/]'),
  in_app        BOOLEAN NOT NULL DEFAULT true,
  read_at       TIMESTAMPTZ,
  email_status  TEXT NOT NULL DEFAULT 'NONE' CHECK (email_status IN ('NONE', 'PENDING', 'SENT', 'FAILED', 'SKIPPED')),
  email_attempts SMALLINT NOT NULL DEFAULT 0,
  email_next_at TIMESTAMPTZ,
  email_error   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- camp_apply_tenant_rls UPDATE trigger (update_updated_at_column) шаарддаг
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_core_notifications_user FOREIGN KEY (tenant_id, user_id)
    REFERENCES core_users (tenant_id, id) ON DELETE CASCADE
);
SELECT camp_apply_tenant_rls('core_notifications');
CREATE INDEX idx_core_notifications_user ON core_notifications (tenant_id, user_id, created_at DESC) WHERE in_app;
CREATE INDEX idx_core_notifications_unread ON core_notifications (tenant_id, user_id) WHERE in_app AND read_at IS NULL;
CREATE INDEX idx_core_notifications_email ON core_notifications (email_next_at) WHERE email_status = 'PENDING';

CREATE TABLE core_notification_prefs (
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL,
  type       TEXT NOT NULL CHECK (type ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$'),
  in_app     BOOLEAN NOT NULL,
  email      BOOLEAN NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, type),
  CONSTRAINT fk_core_notification_prefs_user FOREIGN KEY (tenant_id, user_id)
    REFERENCES core_users (tenant_id, id) ON DELETE CASCADE
);
SELECT camp_apply_tenant_rls('core_notification_prefs');
