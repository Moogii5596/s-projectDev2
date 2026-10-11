-- ============================================================
-- v0.2.1 (C-12, FB-12) — Байрны төрөл (админ үүсгэнэ, Q4), хөрөнгийг байранд (өрөөгүй) байрлуулах
-- ============================================================
CREATE TABLE camp_building_types (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 100),
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_camp_building_types_tenant_id UNIQUE (tenant_id, id)
);
CREATE UNIQUE INDEX uq_camp_building_types_name ON camp_building_types (tenant_id, lower(btrim(name)));
SELECT camp_apply_tenant_rls('camp_building_types');

ALTER TABLE camp_buildings
  ADD COLUMN type_id UUID,
  ADD CONSTRAINT fk_camp_buildings_type FOREIGN KEY (tenant_id, type_id) REFERENCES camp_building_types (tenant_id, id);

-- Хөрөнгийн байршил: room_id (өрөөнд) · building_id (өрөөгүй, байранд) · хоёулаа NULL = агуулахад
ALTER TABLE camp_assets
  ADD COLUMN building_id UUID,
  ADD CONSTRAINT fk_camp_assets_building FOREIGN KEY (tenant_id, camp_id, building_id)
    REFERENCES camp_buildings (tenant_id, camp_id, id),
  ADD CONSTRAINT chk_camp_assets_location CHECK (room_id IS NULL OR building_id IS NULL);
CREATE INDEX idx_camp_assets_building ON camp_assets (tenant_id, building_id) WHERE building_id IS NOT NULL;

ALTER TABLE camp_asset_movements
  ADD COLUMN from_building_id UUID,
  ADD COLUMN to_building_id   UUID,
  ADD CONSTRAINT fk_camp_asset_movements_from_building FOREIGN KEY (tenant_id, camp_id, from_building_id)
    REFERENCES camp_buildings (tenant_id, camp_id, id),
  ADD CONSTRAINT fk_camp_asset_movements_to_building FOREIGN KEY (tenant_id, camp_id, to_building_id)
    REFERENCES camp_buildings (tenant_id, camp_id, id),
  ADD CONSTRAINT chk_camp_asset_movements_from_one CHECK (from_room_id IS NULL OR from_building_id IS NULL),
  ADD CONSTRAINT chk_camp_asset_movements_to_one   CHECK (to_room_id IS NULL OR to_building_id IS NULL);

-- Агуулах (NULL) ↔ байр (room NULL) шилжилт зөвшөөрөгдөх ёстой → "өмнөх ≠ дараах" шалгалтыг байрыг оролцуулж дахин тодорхойлно
ALTER TABLE camp_asset_movements DROP CONSTRAINT chk_camp_asset_movements_rooms;
ALTER TABLE camp_asset_movements ADD CONSTRAINT chk_camp_asset_movements_rooms
  CHECK ((from_room_id, from_building_id) IS DISTINCT FROM (to_room_id, to_building_id));
