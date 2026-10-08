-- Sprint 1: Dynamic Route Ingress
-- RULE-11: uuid_generate_v7() ЗААВАЛ
-- RULE-12: FORCE + RESTRICTIVE RLS pattern
-- role нэр: app_user (0002~0006 migration-тай нийцнэ)

CREATE TABLE tenant_routes (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  path          TEXT        NOT NULL,
  method        TEXT        NOT NULL CHECK (method IN ('GET','POST','PUT','PATCH','DELETE','*')),
  target_module TEXT        NOT NULL,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_tenant_route UNIQUE(tenant_id, path, method)
);

ALTER TABLE tenant_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_routes FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant_routes_tenant ON tenant_routes
  AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE INDEX idx_tenant_routes_tenant_active ON tenant_routes(tenant_id, is_active);

-- app_user-д эрх олгох (0003 migration-тай нийцсэн pattern)
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_routes TO app_user;
