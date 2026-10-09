-- ============================================================
-- Camp Module · Шат 1.4 — Үндсэн хөрөнгө, засвар (2026-10-09)
-- ============================================================
-- camp_asset_categories, camp_assets, camp_asset_movements, camp_maintenance_requests, camp_maintenance_parts
-- Засвар: ажлын хөлс үнэгүй; сэлбэг уурхайгаас (MINE_SUPPLIED). Катеринг өөрөө авсан (CATERING_PURCHASED) сэлбэг
-- нь хүсэлт CLOSED болоход camp_cost_entries-д (1.6) орно. CLOSED/CANCELLED хүсэлтийн сэлбэг засагдахгүй.
-- ============================================================

CREATE TYPE "CampAssetCondition"     AS ENUM ('GOOD', 'DAMAGED', 'WRITTEN_OFF');
CREATE TYPE "CampMaintenancePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE "CampMaintenanceStatus"  AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CLOSED', 'CANCELLED');
CREATE TYPE "CampPartSource"         AS ENUM ('MINE_SUPPLIED', 'CATERING_PURCHASED');

-- ── 1. Хөрөнгийн ангилал ─────────────────────────────────────
CREATE TABLE camp_asset_categories (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL CHECK (btrim(name) <> ''),
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_camp_asset_categories_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_camp_asset_categories_name      UNIQUE (tenant_id, name)
);

-- ── 2. Хөрөнгө ────────────────────────────────────────────────
CREATE TABLE camp_assets (
  id             UUID                 PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id      UUID                 NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camp_id        UUID                 NOT NULL,
  category_id    UUID                 NOT NULL,
  inventory_no   TEXT                 NOT NULL CHECK (btrim(inventory_no) <> ''),
  name           TEXT                 NOT NULL CHECK (btrim(name) <> ''),
  serial_no      TEXT,
  room_id        UUID,                                   -- NULL = агуулахад
  condition      "CampAssetCondition" NOT NULL DEFAULT 'GOOD',
  acquired_date  DATE,
  acquired_cost  NUMERIC(18,2)        CHECK (acquired_cost >= 0),
  note           TEXT,
  created_at     TIMESTAMPTZ          NOT NULL DEFAULT clock_timestamp(),
  updated_at     TIMESTAMPTZ          NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_camp_assets_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_camp_assets_camp_id   UNIQUE (tenant_id, camp_id, id),
  CONSTRAINT uq_camp_assets_inventory UNIQUE (tenant_id, inventory_no),
  CONSTRAINT fk_camp_assets_camp     FOREIGN KEY (tenant_id, camp_id) REFERENCES camps (tenant_id, id),
  CONSTRAINT fk_camp_assets_category FOREIGN KEY (tenant_id, category_id) REFERENCES camp_asset_categories (tenant_id, id),
  CONSTRAINT fk_camp_assets_room     FOREIGN KEY (tenant_id, camp_id, room_id) REFERENCES camp_rooms (tenant_id, camp_id, id)
);
CREATE INDEX idx_camp_assets_cursor ON camp_assets (tenant_id, created_at DESC, id DESC);
CREATE INDEX idx_camp_assets_room   ON camp_assets (tenant_id, room_id) WHERE room_id IS NOT NULL;

-- ── 3. Хөрөнгийн шилжүүлэг (лог) ─────────────────────────────
CREATE TABLE camp_asset_movements (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camp_id       UUID        NOT NULL,
  asset_id      UUID        NOT NULL,
  from_room_id  UUID,                  -- NULL = агуулах
  to_room_id    UUID,                  -- NULL = агуулах
  moved_at      TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  moved_by      UUID        NOT NULL,
  reason        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT chk_camp_asset_movements_rooms CHECK (from_room_id IS DISTINCT FROM to_room_id),
  CONSTRAINT fk_camp_asset_movements_asset FOREIGN KEY (tenant_id, camp_id, asset_id)
    REFERENCES camp_assets (tenant_id, camp_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_camp_asset_movements_from FOREIGN KEY (tenant_id, camp_id, from_room_id)
    REFERENCES camp_rooms (tenant_id, camp_id, id),
  CONSTRAINT fk_camp_asset_movements_to FOREIGN KEY (tenant_id, camp_id, to_room_id)
    REFERENCES camp_rooms (tenant_id, camp_id, id),
  CONSTRAINT fk_camp_asset_movements_moved_by FOREIGN KEY (tenant_id, moved_by) REFERENCES core_users (tenant_id, id)
);
CREATE INDEX idx_camp_asset_movements_asset ON camp_asset_movements (tenant_id, asset_id, moved_at DESC);

-- ── 4. Засварын хүсэлт ────────────────────────────────────────
CREATE TABLE camp_maintenance_requests (
  id                UUID                      PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id         UUID                      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camp_id           UUID                      NOT NULL,
  request_no        TEXT                      NOT NULL CHECK (btrim(request_no) <> ''),
  room_id           UUID,
  asset_id          UUID,
  title             TEXT                      NOT NULL CHECK (btrim(title) <> ''),
  description       TEXT,
  priority          "CampMaintenancePriority" NOT NULL DEFAULT 'MEDIUM',
  status            "CampMaintenanceStatus"   NOT NULL DEFAULT 'OPEN',
  reported_by       UUID                      NOT NULL,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  closed_by         UUID,
  closed_at         TIMESTAMPTZ,
  cancel_reason     TEXT,
  created_at        TIMESTAMPTZ               NOT NULL DEFAULT clock_timestamp(),
  updated_at        TIMESTAMPTZ               NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_camp_maintenance_requests_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_camp_maintenance_requests_no        UNIQUE (tenant_id, request_no),
  CONSTRAINT chk_camp_maintenance_target CHECK (room_id IS NOT NULL OR asset_id IS NOT NULL),
  CONSTRAINT chk_camp_maintenance_closed CHECK ((status = 'CLOSED') = (closed_by IS NOT NULL AND closed_at IS NOT NULL)),
  CONSTRAINT chk_camp_maintenance_cancelled CHECK (status <> 'CANCELLED' OR btrim(coalesce(cancel_reason, '')) <> ''),
  CONSTRAINT fk_camp_maintenance_camp  FOREIGN KEY (tenant_id, camp_id) REFERENCES camps (tenant_id, id),
  CONSTRAINT fk_camp_maintenance_room  FOREIGN KEY (tenant_id, camp_id, room_id)  REFERENCES camp_rooms (tenant_id, camp_id, id),
  CONSTRAINT fk_camp_maintenance_asset FOREIGN KEY (tenant_id, camp_id, asset_id) REFERENCES camp_assets (tenant_id, camp_id, id),
  CONSTRAINT fk_camp_maintenance_reported_by FOREIGN KEY (tenant_id, reported_by) REFERENCES core_users (tenant_id, id),
  CONSTRAINT fk_camp_maintenance_closed_by   FOREIGN KEY (tenant_id, closed_by)   REFERENCES core_users (tenant_id, id)
);
CREATE INDEX idx_camp_maintenance_cursor ON camp_maintenance_requests (tenant_id, camp_id, created_at DESC, id DESC);
CREATE INDEX idx_camp_maintenance_status ON camp_maintenance_requests (tenant_id, camp_id, status);
CREATE INDEX idx_camp_maintenance_room   ON camp_maintenance_requests (tenant_id, room_id) WHERE room_id IS NOT NULL;

-- ── 5. Засварын сэлбэг ────────────────────────────────────────
CREATE TABLE camp_maintenance_parts (
  id            UUID             PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id     UUID             NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  request_id    UUID             NOT NULL,
  part_name     TEXT             NOT NULL CHECK (btrim(part_name) <> ''),
  quantity      NUMERIC(15,3)    NOT NULL CHECK (quantity > 0),
  unit          TEXT             NOT NULL DEFAULT 'ш' CHECK (btrim(unit) <> ''),
  unit_price    NUMERIC(18,2)    CHECK (unit_price >= 0),
  vat_included  BOOLEAN          NOT NULL DEFAULT true,
  source        "CampPartSource" NOT NULL,
  created_by    UUID             NOT NULL,
  created_at    TIMESTAMPTZ      NOT NULL DEFAULT clock_timestamp(),
  updated_at    TIMESTAMPTZ      NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_camp_maintenance_parts_tenant_id UNIQUE (tenant_id, id),
  -- Катерингийн авсан сэлбэг зардалд орох тул үнэ заавал
  CONSTRAINT chk_camp_parts_price CHECK (source <> 'CATERING_PURCHASED' OR unit_price IS NOT NULL),
  CONSTRAINT fk_camp_parts_request FOREIGN KEY (tenant_id, request_id)
    REFERENCES camp_maintenance_requests (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_camp_parts_created_by FOREIGN KEY (tenant_id, created_by) REFERENCES core_users (tenant_id, id)
);
CREATE INDEX idx_camp_parts_request ON camp_maintenance_parts (tenant_id, request_id);

-- CLOSED / CANCELLED хүсэлтийн сэлбэгийг нэмэх/засах/устгахгүй (зардлын snapshot-той зөрөхгүй)
CREATE OR REPLACE FUNCTION camp_maintenance_parts_protect()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_tenant  uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
  v_status  "CampMaintenanceStatus";
BEGIN
  IF TG_OP = 'DELETE' AND NOT camp_tenant_exists(v_tenant) THEN
    RETURN OLD;   -- tenant устгах CASCADE (D6)
  END IF;
  SELECT status INTO v_status FROM camp_maintenance_requests
   WHERE tenant_id = v_tenant AND id = COALESCE(OLD.request_id, NEW.request_id);
  IF v_status IN ('CLOSED', 'CANCELLED') THEN
    RAISE EXCEPTION 'CAMP_MAINTENANCE_LOCKED: хаагдсан/цуцлагдсан засварын сэлбэгийг өөрчлөх боломжгүй'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.request_id <> OLD.request_id THEN
    SELECT status INTO v_status FROM camp_maintenance_requests WHERE tenant_id = v_tenant AND id = NEW.request_id;
    IF v_status IN ('CLOSED', 'CANCELLED') THEN
      RAISE EXCEPTION 'CAMP_MAINTENANCE_LOCKED: хаагдсан/цуцлагдсан засварт сэлбэг шилжүүлэх боломжгүй'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER trg_camp_maintenance_parts_protect
  BEFORE INSERT OR UPDATE OR DELETE ON camp_maintenance_parts
  FOR EACH ROW EXECUTE FUNCTION camp_maintenance_parts_protect();

-- CLOSED хүсэлтийг дахин нээх/засахгүй (зардал бичигдсэн)
CREATE OR REPLACE FUNCTION camp_maintenance_requests_protect()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'CLOSED' AND camp_tenant_exists(OLD.tenant_id) THEN
      RAISE EXCEPTION 'CAMP_MAINTENANCE_LOCKED: хаагдсан засварыг устгах боломжгүй' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'CLOSED' THEN
    RAISE EXCEPTION 'CAMP_MAINTENANCE_LOCKED: хаагдсан засварыг өөрчлөх боломжгүй' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_camp_maintenance_requests_protect
  BEFORE UPDATE OR DELETE ON camp_maintenance_requests
  FOR EACH ROW EXECUTE FUNCTION camp_maintenance_requests_protect();

-- ── 6. RLS + GRANT + updated_at ───────────────────────────────
SELECT camp_apply_tenant_rls('camp_asset_categories');
SELECT camp_apply_tenant_rls('camp_assets');
SELECT camp_apply_tenant_rls('camp_asset_movements');
SELECT camp_apply_tenant_rls('camp_maintenance_requests');
SELECT camp_apply_tenant_rls('camp_maintenance_parts');
