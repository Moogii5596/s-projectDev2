-- ============================================================
-- Camp Module · Шат 1.6 — Бохир ус/хог, хоолны захиалга, нэгдсэн зардал (2026-10-09)
-- ============================================================
-- camp_haul_records, camp_meal_orders, camp_meal_order_lines, camp_cost_entries + хамгаалах trigger-үүд
-- Хяналтын дүрэм: бүртгэл үүсгэсэн/захиалсан хүн өөрөө батлах/хүлээн авахгүй (CHECK).
-- Зардал (camp_cost_entries) = тайлангийн цорын ганц эх сурвалж; батлах/хүлээн авах/хаах үеийн snapshot, засагдахгүй.
-- ============================================================

CREATE TYPE "CampHaulType"        AS ENUM ('SEWAGE', 'WASTE');
CREATE TYPE "CampVolumeUnit"      AS ENUM ('M3', 'TON');
CREATE TYPE "CampHaulStatus"      AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');
CREATE TYPE "CampMealOrderStatus" AS ENUM ('DRAFT', 'ORDERED', 'ACCEPTED', 'REJECTED');
CREATE TYPE "CampCostSource"      AS ENUM ('HAUL', 'MEAL', 'MAINTENANCE_PART');

-- ── 1. Бохир ус / хог ─────────────────────────────────────────
CREATE TABLE camp_haul_records (
  id                          UUID             PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id                   UUID             NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camp_id                     UUID             NOT NULL,
  record_no                   TEXT             NOT NULL CHECK (btrim(record_no) <> ''),
  haul_type                   "CampHaulType"   NOT NULL,
  haul_date                   DATE             NOT NULL,
  vehicle_no                  TEXT,
  driver_name                 TEXT,
  trips                       INTEGER          NOT NULL DEFAULT 1 CHECK (trips > 0),
  volume                      NUMERIC(15,3)    CHECK (volume > 0),
  volume_unit                 "CampVolumeUnit",
  transport_contract_item_id  UUID             NOT NULL,   -- тээврийн гэрээт
  disposal_contract_item_id   UUID             NOT NULL,   -- нийлүүлэх цэгийн гэрээт
  status                      "CampHaulStatus" NOT NULL DEFAULT 'DRAFT',
  note                        TEXT,
  created_by                  UUID             NOT NULL,   -- катеринг
  submitted_at                TIMESTAMPTZ,
  reviewed_by                 UUID,                         -- кемп менежер (батласан/татгалзсан)
  reviewed_at                 TIMESTAMPTZ,
  reject_reason               TEXT,
  created_at                  TIMESTAMPTZ      NOT NULL DEFAULT clock_timestamp(),
  updated_at                  TIMESTAMPTZ      NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_camp_haul_records_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_camp_haul_records_no        UNIQUE (tenant_id, record_no),
  CONSTRAINT chk_camp_haul_volume CHECK ((volume IS NULL) = (volume_unit IS NULL)),
  CONSTRAINT chk_camp_haul_submitted CHECK (status = 'DRAFT' OR submitted_at IS NOT NULL),
  CONSTRAINT chk_camp_haul_reviewed CHECK (
    (status IN ('APPROVED', 'REJECTED')) = (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  CONSTRAINT chk_camp_haul_rejected CHECK (status <> 'REJECTED' OR btrim(coalesce(reject_reason, '')) <> ''),
  CONSTRAINT chk_camp_haul_four_eyes CHECK (reviewed_by IS NULL OR reviewed_by <> created_by),
  CONSTRAINT fk_camp_haul_camp FOREIGN KEY (tenant_id, camp_id) REFERENCES camps (tenant_id, id),
  CONSTRAINT fk_camp_haul_transport FOREIGN KEY (tenant_id, camp_id, transport_contract_item_id)
    REFERENCES camp_contract_items (tenant_id, camp_id, id),
  CONSTRAINT fk_camp_haul_disposal FOREIGN KEY (tenant_id, camp_id, disposal_contract_item_id)
    REFERENCES camp_contract_items (tenant_id, camp_id, id),
  CONSTRAINT fk_camp_haul_created_by  FOREIGN KEY (tenant_id, created_by)  REFERENCES core_users (tenant_id, id),
  CONSTRAINT fk_camp_haul_reviewed_by FOREIGN KEY (tenant_id, reviewed_by) REFERENCES core_users (tenant_id, id)
);
CREATE INDEX idx_camp_haul_date   ON camp_haul_records (tenant_id, camp_id, haul_date);
CREATE INDEX idx_camp_haul_status ON camp_haul_records (tenant_id, camp_id, status);
CREATE INDEX idx_camp_haul_cursor ON camp_haul_records (tenant_id, created_at DESC, id DESC);

-- Гэрээний ажлын төрөл haul_type-тай таарах ёстой (SEWAGE → SEWAGE_TRANSPORT + SEWAGE_DISPOSAL г.м.)
-- APPROVED мөрийг өөрчлөх/устгахгүй (tenant устгах CASCADE-аас бусад, D6)
CREATE OR REPLACE FUNCTION camp_haul_records_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_transport "CampServiceType";
  v_disposal  "CampServiceType";
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'APPROVED' AND camp_tenant_exists(OLD.tenant_id) THEN
      RAISE EXCEPTION 'CAMP_HAUL_LOCKED: батлагдсан бүртгэлийг устгах боломжгүй (%)', OLD.record_no
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'APPROVED' THEN
    RAISE EXCEPTION 'CAMP_HAUL_LOCKED: батлагдсан бүртгэлийг өөрчлөх боломжгүй (%)', OLD.record_no
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT service_type INTO v_transport FROM camp_contract_items
   WHERE tenant_id = NEW.tenant_id AND id = NEW.transport_contract_item_id;
  SELECT service_type INTO v_disposal FROM camp_contract_items
   WHERE tenant_id = NEW.tenant_id AND id = NEW.disposal_contract_item_id;

  IF NEW.haul_type = 'SEWAGE' AND (v_transport IS DISTINCT FROM 'SEWAGE_TRANSPORT' OR v_disposal IS DISTINCT FROM 'SEWAGE_DISPOSAL')
  OR NEW.haul_type = 'WASTE'  AND (v_transport IS DISTINCT FROM 'WASTE_TRANSPORT'  OR v_disposal IS DISTINCT FROM 'WASTE_DISPOSAL') THEN
    RAISE EXCEPTION 'CAMP_HAUL_CONTRACT: гэрээний ажлын төрөл таарахгүй (% → тээвэр %, нийлүүлэх цэг %)',
      NEW.haul_type, v_transport, v_disposal
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_camp_haul_records_guard
  BEFORE INSERT OR UPDATE OR DELETE ON camp_haul_records
  FOR EACH ROW EXECUTE FUNCTION camp_haul_records_guard();

-- ── 2. Хоолны захиалга (кемп × өдөр) ──────────────────────────
CREATE TABLE camp_meal_orders (
  id                     UUID                  PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id              UUID                  NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camp_id                UUID                  NOT NULL,
  order_date             DATE                  NOT NULL,
  meal_contract_item_id  UUID,                              -- DRAFT-д хоосон байж болно, ORDERED-оос заавал
  status                 "CampMealOrderStatus" NOT NULL DEFAULT 'DRAFT',
  note                   TEXT,
  ordered_by             UUID,                              -- кемп менежер
  ordered_at             TIMESTAMPTZ,
  reviewed_by            UUID,                              -- катеринг админ (хүлээн авсан/татгалзсан)
  reviewed_at            TIMESTAMPTZ,
  reject_reason          TEXT,
  created_at             TIMESTAMPTZ           NOT NULL DEFAULT clock_timestamp(),
  updated_at             TIMESTAMPTZ           NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_camp_meal_orders_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_camp_meal_orders_camp_id   UNIQUE (tenant_id, camp_id, id),
  CONSTRAINT uq_camp_meal_orders_day       UNIQUE (tenant_id, camp_id, order_date),
  CONSTRAINT chk_camp_meal_orders_contract CHECK (status = 'DRAFT' OR meal_contract_item_id IS NOT NULL),
  CONSTRAINT chk_camp_meal_orders_ordered CHECK (
    status = 'DRAFT' OR (ordered_by IS NOT NULL AND ordered_at IS NOT NULL)),
  CONSTRAINT chk_camp_meal_orders_reviewed CHECK (
    (status IN ('ACCEPTED', 'REJECTED')) = (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  CONSTRAINT chk_camp_meal_orders_rejected CHECK (status <> 'REJECTED' OR btrim(coalesce(reject_reason, '')) <> ''),
  CONSTRAINT chk_camp_meal_orders_four_eyes CHECK (reviewed_by IS NULL OR reviewed_by <> ordered_by),
  CONSTRAINT fk_camp_meal_orders_camp FOREIGN KEY (tenant_id, camp_id) REFERENCES camps (tenant_id, id),
  CONSTRAINT fk_camp_meal_orders_contract FOREIGN KEY (tenant_id, camp_id, meal_contract_item_id)
    REFERENCES camp_contract_items (tenant_id, camp_id, id),
  CONSTRAINT fk_camp_meal_orders_ordered_by  FOREIGN KEY (tenant_id, ordered_by)  REFERENCES core_users (tenant_id, id),
  CONSTRAINT fk_camp_meal_orders_reviewed_by FOREIGN KEY (tenant_id, reviewed_by) REFERENCES core_users (tenant_id, id)
);
CREATE INDEX idx_camp_meal_orders_status ON camp_meal_orders (tenant_id, camp_id, status, order_date);

-- Хоол × байршил. base_count = захиалах үеийн тооцоолсон snapshot, extra_count = менежерийн залруулга (±)
CREATE TABLE camp_meal_order_lines (
  id                UUID           PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id         UUID           NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camp_id           UUID           NOT NULL,
  order_id          UUID           NOT NULL,
  meal_type         "CampMealType" NOT NULL,
  meal_location_id  UUID           NOT NULL,   -- snapshot: хэлтсийн байршил хожим солигдсон ч өөрчлөгдөхгүй
  base_count        INTEGER        NOT NULL DEFAULT 0 CHECK (base_count >= 0),
  extra_count       INTEGER        NOT NULL DEFAULT 0,
  extra_note        TEXT,
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT clock_timestamp(),
  updated_at        TIMESTAMPTZ    NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_camp_meal_order_lines UNIQUE (order_id, meal_type, meal_location_id),
  CONSTRAINT chk_camp_meal_order_lines_total CHECK (base_count + extra_count >= 0),
  CONSTRAINT fk_camp_meal_order_lines_order FOREIGN KEY (tenant_id, camp_id, order_id)
    REFERENCES camp_meal_orders (tenant_id, camp_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_camp_meal_order_lines_location FOREIGN KEY (tenant_id, camp_id, meal_location_id)
    REFERENCES camp_meal_locations (tenant_id, camp_id, id)
);
CREATE INDEX idx_camp_meal_order_lines_order ON camp_meal_order_lines (tenant_id, order_id);

-- Хоолны гэрээ MEAL төрөлтэй байх; ACCEPTED захиалгыг өөрчлөх/устгахгүй
CREATE OR REPLACE FUNCTION camp_meal_orders_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_service "CampServiceType";
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'ACCEPTED' AND camp_tenant_exists(OLD.tenant_id) THEN
      RAISE EXCEPTION 'CAMP_MEAL_LOCKED: хүлээн авсан захиалгыг устгах боломжгүй (%)', OLD.order_date
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'ACCEPTED' THEN
    RAISE EXCEPTION 'CAMP_MEAL_LOCKED: хүлээн авсан захиалгыг өөрчлөх боломжгүй (%)', OLD.order_date
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.meal_contract_item_id IS NOT NULL THEN
    SELECT service_type INTO v_service FROM camp_contract_items
     WHERE tenant_id = NEW.tenant_id AND id = NEW.meal_contract_item_id;
    IF v_service IS DISTINCT FROM 'MEAL' THEN
      RAISE EXCEPTION 'CAMP_MEAL_CONTRACT: хоолны (MEAL) гэрээ сонгоно уу (%)', v_service
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_camp_meal_orders_guard
  BEFORE INSERT OR UPDATE OR DELETE ON camp_meal_orders
  FOR EACH ROW EXECUTE FUNCTION camp_meal_orders_guard();

-- Мөрүүд: захиалга ACCEPTED/REJECTED болсон бол өөрчлөхгүй (зардлын snapshot-той зөрөхгүй)
CREATE OR REPLACE FUNCTION camp_meal_order_lines_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_tenant uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
  v_status "CampMealOrderStatus";
BEGIN
  IF TG_OP = 'DELETE' AND NOT camp_tenant_exists(v_tenant) THEN
    RETURN OLD;
  END IF;
  SELECT status INTO v_status FROM camp_meal_orders
   WHERE tenant_id = v_tenant AND id = COALESCE(OLD.order_id, NEW.order_id);
  -- v_status NULL = эх захиалга устгагдаж буй CASCADE → зөвшөөрнө
  IF v_status IN ('ACCEPTED', 'REJECTED') THEN
    RAISE EXCEPTION 'CAMP_MEAL_LOCKED: шийдвэрлэгдсэн захиалгын мөрийг өөрчлөх боломжгүй'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.order_id <> OLD.order_id THEN
    RAISE EXCEPTION 'CAMP_MEAL_LOCKED: мөрийг өөр захиалга руу шилжүүлэх боломжгүй'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER trg_camp_meal_order_lines_guard
  BEFORE INSERT OR UPDATE OR DELETE ON camp_meal_order_lines
  FOR EACH ROW EXECUTE FUNCTION camp_meal_order_lines_guard();

-- ── 3. Нэгдсэн зардал (snapshot) ──────────────────────────────
-- D4: source бүрт яг нэг FK. HAUL → 1 бүртгэлд 2 мөр (тээвэр + нийлүүлэх цэг), MEAL → 1, MAINTENANCE_PART → 1.
-- НӨАТ: vat_included бол net = gross / (1 + r/100), үгүй бол vat = net × r/100; 2 оронтой тойм (Шат 5 VatCalculator).
CREATE TABLE camp_cost_entries (
  id                   UUID              PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id            UUID              NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camp_id              UUID              NOT NULL,
  cost_date            DATE              NOT NULL,
  source               "CampCostSource"  NOT NULL,
  haul_record_id       UUID,
  meal_order_id        UUID,
  maintenance_part_id  UUID,
  service_type         "CampServiceType",          -- HAUL/MEAL-д заавал, сэлбэгт NULL
  contract_item_id     UUID,                       -- HAUL/MEAL-д заавал
  organization_id      UUID,                       -- гэрээт байгууллага (snapshot)
  description          TEXT,
  quantity             NUMERIC(15,4)     NOT NULL CHECK (quantity > 0),
  unit                 TEXT              NOT NULL CHECK (btrim(unit) <> ''),
  unit_price           NUMERIC(18,2)     NOT NULL CHECK (unit_price >= 0),
  vat_included         BOOLEAN           NOT NULL,
  vat_rate             NUMERIC(5,2)      NOT NULL CHECK (vat_rate >= 0 AND vat_rate < 100),
  net_amount           NUMERIC(18,2)     NOT NULL CHECK (net_amount >= 0),
  vat_amount           NUMERIC(18,2)     NOT NULL CHECK (vat_amount >= 0),
  gross_amount         NUMERIC(18,2)     NOT NULL CHECK (gross_amount >= 0),
  created_by           UUID              NOT NULL,   -- батласан / хүлээн авсан / хаасан хүн
  created_at           TIMESTAMPTZ       NOT NULL DEFAULT clock_timestamp(),
  updated_at           TIMESTAMPTZ       NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT chk_camp_cost_amounts CHECK (net_amount + vat_amount = gross_amount),
  CONSTRAINT chk_camp_cost_source CHECK (
    (source = 'HAUL'             AND haul_record_id IS NOT NULL AND meal_order_id IS NULL AND maintenance_part_id IS NULL
       AND contract_item_id IS NOT NULL
       AND service_type IN ('SEWAGE_TRANSPORT', 'SEWAGE_DISPOSAL', 'WASTE_TRANSPORT', 'WASTE_DISPOSAL'))
 OR (source = 'MEAL'             AND meal_order_id IS NOT NULL AND haul_record_id IS NULL AND maintenance_part_id IS NULL
       AND contract_item_id IS NOT NULL AND service_type = 'MEAL')
 OR (source = 'MAINTENANCE_PART' AND maintenance_part_id IS NOT NULL AND haul_record_id IS NULL AND meal_order_id IS NULL
       AND contract_item_id IS NULL AND service_type IS NULL)),
  CONSTRAINT fk_camp_cost_camp FOREIGN KEY (tenant_id, camp_id) REFERENCES camps (tenant_id, id),
  CONSTRAINT fk_camp_cost_haul FOREIGN KEY (tenant_id, haul_record_id) REFERENCES camp_haul_records (tenant_id, id),
  CONSTRAINT fk_camp_cost_meal FOREIGN KEY (tenant_id, camp_id, meal_order_id)
    REFERENCES camp_meal_orders (tenant_id, camp_id, id),
  CONSTRAINT fk_camp_cost_part FOREIGN KEY (tenant_id, maintenance_part_id)
    REFERENCES camp_maintenance_parts (tenant_id, id),
  CONSTRAINT fk_camp_cost_contract_item FOREIGN KEY (tenant_id, camp_id, contract_item_id)
    REFERENCES camp_contract_items (tenant_id, camp_id, id),
  CONSTRAINT fk_camp_cost_org FOREIGN KEY (tenant_id, organization_id) REFERENCES camp_organizations (tenant_id, id),
  CONSTRAINT fk_camp_cost_created_by FOREIGN KEY (tenant_id, created_by) REFERENCES core_users (tenant_id, id)
);
-- Давхар бичихгүй (idempotent батлах/хүлээн авах/хаах)
CREATE UNIQUE INDEX uq_camp_cost_haul ON camp_cost_entries (haul_record_id, service_type) WHERE haul_record_id IS NOT NULL;
CREATE UNIQUE INDEX uq_camp_cost_meal ON camp_cost_entries (meal_order_id)               WHERE meal_order_id IS NOT NULL;
CREATE UNIQUE INDEX uq_camp_cost_part ON camp_cost_entries (maintenance_part_id)         WHERE maintenance_part_id IS NOT NULL;
CREATE INDEX idx_camp_cost_report ON camp_cost_entries (tenant_id, camp_id, cost_date);
CREATE INDEX idx_camp_cost_org    ON camp_cost_entries (tenant_id, organization_id, cost_date);

-- Snapshot: засахгүй, устгахгүй (tenant устгах CASCADE-аас бусад, D6).
-- Алдаатай зардлыг залруулах урсгал (сторно мөр) шаардлагатай бол Шат 5–6-д тусдаа шийдэгдэнэ.
CREATE OR REPLACE FUNCTION camp_cost_entries_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT camp_tenant_exists(OLD.tenant_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'CAMP_COST_IMMUTABLE: зардлын бүртгэл (snapshot) өөрчлөх/устгах боломжгүй'
    USING ERRCODE = 'check_violation';
END;
$$;
CREATE TRIGGER trg_camp_cost_entries_immutable
  BEFORE UPDATE OR DELETE ON camp_cost_entries
  FOR EACH ROW EXECUTE FUNCTION camp_cost_entries_immutable();

-- ── 4. RLS + GRANT + updated_at ───────────────────────────────
SELECT camp_apply_tenant_rls('camp_haul_records');
SELECT camp_apply_tenant_rls('camp_meal_orders');
SELECT camp_apply_tenant_rls('camp_meal_order_lines');
SELECT camp_apply_tenant_rls('camp_cost_entries');
