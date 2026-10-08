-- ============================================================
-- Phase 4.2 / 4.3 — Inventory-lite + Vendor-lite (2026-10-08)
-- ============================================================
-- Зорилго: платформыг батлах ХӨНГӨН модулиуд (бизнесийн бүрэн функц биш):
--   inventory_items — шинэ модуль 1 хүснэгтээр, cursor pagination, Redis cache, атомик үлдэгдэл өөрчлөлт
--   vendors         — хамгийн энгийн CRUD + RLS (модулийн загвар)
-- RLS стандарт [RLS-004]: ENABLE + FORCE + PERMISSIVE TO app_user + GRANT
-- ============================================================

CREATE TABLE inventory_items (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id     UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sku           TEXT          NOT NULL CHECK (btrim(sku) <> ''),
  name          TEXT          NOT NULL CHECK (btrim(name) <> ''),
  unit          TEXT          NOT NULL DEFAULT 'EA',
  quantity      NUMERIC(15,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  min_threshold NUMERIC(15,3) NOT NULL DEFAULT 0 CHECK (min_threshold >= 0),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT clock_timestamp(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_inventory_items_tenant_sku UNIQUE (tenant_id, sku)
);
-- Cursor pagination (Phase 3.6.1-ийн сургамж: tenant + created_at DESC + id DESC)
CREATE INDEX idx_inventory_items_cursor ON inventory_items (tenant_id, created_at DESC, id DESC);

CREATE TABLE vendors (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL CHECK (btrim(name) <> ''),
  reg_number  TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX idx_vendors_tenant ON vendors (tenant_id, is_active, name);

ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_inventory_items ON inventory_items
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_vendors ON vendors
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON inventory_items, vendors TO app_user;
