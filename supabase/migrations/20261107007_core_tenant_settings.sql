CREATE TABLE core_tenant_settings (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  organization_name TEXT NOT NULL,
  logo_path TEXT,
  time_zone TEXT NOT NULL DEFAULT 'Asia/Ulaanbaatar',
  default_language TEXT NOT NULL DEFAULT 'mn',
  active_languages TEXT[] NOT NULL DEFAULT ARRAY['mn', 'en', 'zh']::TEXT[],
  base_currency TEXT NOT NULL DEFAULT 'MNT',
  date_format TEXT NOT NULL DEFAULT 'YYYY-MM-DD',
  password_min_length INTEGER NOT NULL DEFAULT 12,
  login_failure_limit INTEGER NOT NULL DEFAULT 10,
  login_lockout_minutes INTEGER NOT NULL DEFAULT 15,
  session_duration_minutes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT core_tenant_settings_default_language_check
    CHECK (default_language IN ('mn', 'en', 'zh')),
  CONSTRAINT core_tenant_settings_active_languages_check
    CHECK (
      cardinality(active_languages) BETWEEN 1 AND 3
      AND active_languages <@ ARRAY['mn', 'en', 'zh']::TEXT[]
      AND default_language = ANY(active_languages)
    ),
  CONSTRAINT core_tenant_settings_base_currency_check
    CHECK (base_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT core_tenant_settings_password_min_length_check
    CHECK (password_min_length BETWEEN 6 AND 72),
  CONSTRAINT core_tenant_settings_login_failure_limit_check
    CHECK (login_failure_limit BETWEEN 3 AND 20),
  CONSTRAINT core_tenant_settings_login_lockout_minutes_check
    CHECK (login_lockout_minutes BETWEEN 1 AND 1440),
  CONSTRAINT core_tenant_settings_session_duration_minutes_check
    CHECK (session_duration_minutes BETWEEN 0 AND 43200)
);

INSERT INTO core_tenant_settings (tenant_id, organization_name)
SELECT id, name FROM tenants
ON CONFLICT (tenant_id) DO NOTHING;

CREATE OR REPLACE FUNCTION core_sync_tenant_settings_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.tenants
  SET name = NEW.organization_name, updated_at = now()
  WHERE id = NEW.tenant_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION core_sync_tenant_settings_name() FROM PUBLIC;

CREATE TRIGGER core_tenant_settings_sync_name
AFTER INSERT OR UPDATE OF organization_name ON core_tenant_settings
FOR EACH ROW EXECUTE FUNCTION core_sync_tenant_settings_name();

SELECT camp_apply_tenant_rls('core_tenant_settings');
