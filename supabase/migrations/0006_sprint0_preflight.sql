-- =====================================================================
-- 0006_sprint0_preflight.sql
-- Зорилго: 0005-н алдааг засах, InstalledModule нэмэх, enum rename
-- RULE-11: uuid_generate_v7() | RULE-12: FORCE + RESTRICTIVE
-- =====================================================================

-- 0. uuid_generate_v7() функц суулгах (pg_uuidv7 extension байхгүй бол custom impl)
CREATE OR REPLACE FUNCTION uuid_generate_v7()
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  unix_ts_ms bytea;
  uuid_bytes bytea;
BEGIN
  unix_ts_ms = substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint) from 3);
  uuid_bytes = uuid_send(gen_random_uuid());
  uuid_bytes = overlay(uuid_bytes placing unix_ts_ms from 1 for 6);
  uuid_bytes = set_byte(uuid_bytes, 6, (b'0111' || get_byte(uuid_bytes, 6)::bit(4))::bit(8)::int);
  RETURN encode(uuid_bytes, 'hex')::uuid;
END;
$$;

-- 1. approval_logs RLS policy засах (0005 буруу нэр ашигласан)
DO $$
BEGIN
  DROP POLICY IF EXISTS rls_approval_logs_tenant_isolation ON approval_logs;
  DROP POLICY IF EXISTS rls_approval_logs ON approval_logs;
  DROP POLICY IF EXISTS approval_logs_tenant_policy ON approval_logs;
END$$;

ALTER TABLE approval_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_logs FORCE ROW LEVEL SECURITY;

-- RULE-12: зөв нэртэй, зөв config key-тэй policy
CREATE POLICY rls_approval_logs_tenant ON approval_logs
  AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- 2. approval_logs.id default засах (0005 uuid_generate_v4 ашигласан)
-- RULE-11: uuid_generate_v7() ЗААВАЛ
ALTER TABLE approval_logs
  ALTER COLUMN id SET DEFAULT uuid_generate_v7();

-- 3. installed_modules хүснэгт үүсгэх
CREATE TABLE IF NOT EXISTS installed_modules (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_id         VARCHAR(64) NOT NULL,
  version           VARCHAR(32) NOT NULL,
  status            VARCHAR(32) NOT NULL DEFAULT 'INSTALLED',
  drain_started_at  TIMESTAMPTZ,
  manifest_snapshot JSONB       NOT NULL DEFAULT '{}',
  installed_at      TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_tenant_module UNIQUE (tenant_id, module_id),
  CONSTRAINT chk_module_status CHECK (
    status IN ('INSTALLED', 'ACTIVE', 'DRAINING', 'SUSPENDED')
  )
);

ALTER TABLE installed_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE installed_modules FORCE ROW LEVEL SECURITY;

-- RULE-12: RESTRICTIVE policy
CREATE POLICY rls_installed_modules_tenant ON installed_modules
  AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE INDEX IF NOT EXISTS idx_installed_modules_tenant
  ON installed_modules(tenant_id, status);

-- 4. mr_headers: workflow_instance_id баганыг нэмэх
ALTER TABLE mr_headers
  ADD COLUMN IF NOT EXISTS workflow_instance_id UUID;

CREATE INDEX IF NOT EXISTS idx_mr_headers_workflow
  ON mr_headers(tenant_id, workflow_instance_id)
  WHERE workflow_instance_id IS NOT NULL;

-- 5. OutboxStatus enum: DEAD_LETTERED → DLQ
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'OutboxStatus' AND e.enumlabel = 'DEAD_LETTERED'
  ) THEN
    ALTER TYPE "OutboxStatus" RENAME VALUE 'DEAD_LETTERED' TO 'DLQ';
  END IF;
END$$;
