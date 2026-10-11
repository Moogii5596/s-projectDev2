-- ============================================================
-- v0.2.1 (C-01, FB-01) — Албан тушаалын каталог (байгууллагын нийтийн, 2026-10-11 Q2)
-- ============================================================
-- Кемп бүрийн анхдагч утга (ажлын хоолны байршил, хоол авах эсэх, ээлжийн загвар) → camp_position_settings (20261012002).
-- Зөвхөн НЭМЭЛТ.
-- ============================================================

CREATE TABLE camp_positions (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 100),
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_camp_positions_tenant_id UNIQUE (tenant_id, id)
);
-- Нэр давхардахгүй (том/жижиг үсэг, илүү зай үл хамаарна)
CREATE UNIQUE INDEX uq_camp_positions_name ON camp_positions (tenant_id, lower(btrim(name)));

SELECT camp_apply_tenant_rls('camp_positions');
