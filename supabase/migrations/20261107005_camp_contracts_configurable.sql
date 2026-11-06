-- ============================================================
-- v0.2.3 Блок 6б — Гэрээ, үнэ, ханш, сунгалт (V2-01, V2-07, G-1, G-3, G-5) (2026-11-07)
-- ============================================================
-- G-1: нэг байгууллагын гэрээгээр хатуу код бичихгүй — үйлчилгээний төрөл, нэгж, валют, НӨАТ, ханшийн бодлого,
--      төлбөрийн хуваарь бүгд ӨГӨГДӨЛ (enum / CHECK биш).
--   1. `core_units` — нэгжийн каталог (tenant; код, нэр mn/en/zh, бутархайн орон)
--   2. `camp_service_types` — үйлчилгээний төрлийн каталог (tenant; тоо хэмжээний эх сурвалж MEAL_ORDER / HAUL / MANUAL)
--      Анхдагч каталог: `camp_seed_contract_catalog(tenant)` (idempotent) — одоо байгаа tenant + шинэ tenant (trigger)
--   3. `camp_contract_items`: enum `service_type` / `unit` → каталогийн FK; MEAL ⇔ PERSON_DAY CHECK хасав;
--      хоолноос тоо хөрвүүлэх дүрэм (G-3): TOTAL_DIV_N (нийт ÷ N) · MEAL_TYPE (нэг хоолны төрөл; хоол тус бүрийн
--      үнэ = MEAL_TYPE-тай хэд хэдэн мөр)
--   4. `camp_contracts`: захиалагч байгууллага, гэрээний валют, төлбөрийн валют, НӨАТ %, ханшийн бодлого
--      (NONE / FIXED / MONTHLY_MANUAL), төлбөрийн хуваарь (JSONB, service шалгана)
--   5. `camp_contract_item_prices`: валют, тэмдэглэл, хэн, ямар нэмэлт өөрчлөлтөөр
--   6. `core_exchange_rates` — ханш (гараар; 1 base = rate quote)
--   7. `camp_contract_amendments` — сунгалт / нэмэлт өөрчлөлтийн түүх (засагдахгүй)
--   8. trigger-ууд (тээвэр, хоол) каталогоор; `camp_cost_entries.service_type` → TEXT (кодын snapshot)
--   9. `CampServiceType`, `CampContractUnit` enum устгав; `camp.contract.manage` → v1
-- Өгөгдөл: гэрээний хүснэгтүүд пилотод хоосон (D8) — байгаа мөрийг кодоор нь каталог руу шилжүүлнэ.
-- Rollback: зөвхөн хоосон хүснэгттэй үед (staging snapshot A = B: contracts 0).
-- ============================================================

-- ── 1. Нэгжийн каталог ───────────────────────────────────────
CREATE TABLE core_units (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code        TEXT        NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{0,39}$'),
  name_mn     TEXT        NOT NULL CHECK (btrim(name_mn) <> ''),
  name_en     TEXT,
  name_zh     TEXT,
  decimals    SMALLINT    NOT NULL DEFAULT 0 CHECK (decimals BETWEEN 0 AND 4),
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_core_units_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_core_units_code      UNIQUE (tenant_id, code)
);
SELECT camp_apply_tenant_rls('core_units');

-- ── 2. Үйлчилгээний төрлийн каталог ──────────────────────────
-- quantity_source: тоо хэмжээ хаанаас — MEAL_ORDER (хоолны захиалга, G-2) · HAUL (тээврийн бүртгэл, V2-02) · MANUAL
CREATE TABLE camp_service_types (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code             TEXT        NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{0,39}$'),
  name_mn          TEXT        NOT NULL CHECK (btrim(name_mn) <> ''),
  name_en          TEXT,
  name_zh          TEXT,
  quantity_source  TEXT        NOT NULL CHECK (quantity_source IN ('MEAL_ORDER', 'HAUL', 'MANUAL')),
  default_unit_id  UUID,
  sort_order       INTEGER     NOT NULL DEFAULT 0,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_camp_service_types_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_camp_service_types_code      UNIQUE (tenant_id, code),
  CONSTRAINT fk_camp_service_types_unit FOREIGN KEY (tenant_id, default_unit_id) REFERENCES core_units (tenant_id, id)
);
SELECT camp_apply_tenant_rls('camp_service_types');

-- Анхдагч каталог — idempotent (код давхцвал алгасна; админы засварыг дарж бичихгүй)
CREATE OR REPLACE FUNCTION camp_seed_contract_catalog(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_prev text := current_setting('app.tenant_id', true);
BEGIN
  PERFORM set_config('app.tenant_id', p_tenant_id::text, true);

  INSERT INTO core_units (tenant_id, code, name_mn, name_en, name_zh, decimals, sort_order)
  VALUES
    (p_tenant_id, 'PERSON_DAY', 'хүн-өдөр', 'person-day', '人·天', 2, 10),
    (p_tenant_id, 'MEAL',       'хоол',     'meal',       '餐',    0, 20),
    (p_tenant_id, 'TRIP',       'рейс',     'trip',       '车次',  0, 30),
    (p_tenant_id, 'M3',         'м³',       'm³',         '立方米', 2, 40),
    (p_tenant_id, 'TON',        'тн',       't',          '吨',    3, 50),
    (p_tenant_id, 'PIECE',      'ширхэг',   'piece',      '件',    0, 60),
    (p_tenant_id, 'MONTH',      'сар',      'month',      '月',    0, 70)
  ON CONFLICT (tenant_id, code) DO NOTHING;

  INSERT INTO camp_service_types (tenant_id, code, name_mn, name_en, name_zh, quantity_source, default_unit_id, sort_order)
  SELECT p_tenant_id, v.code, v.name_mn, v.name_en, v.name_zh, v.src,
         (SELECT u.id FROM core_units u WHERE u.tenant_id = p_tenant_id AND u.code = v.unit), v.sort
  FROM (VALUES
    ('MEAL',             'Хоол',                       'Meals',               '餐饮',       'MEAL_ORDER', 'PERSON_DAY', 10),
    ('SEWAGE_TRANSPORT', 'Бохир ус тээвэр',            'Sewage transport',    '污水运输',   'HAUL',       'TRIP',       20),
    ('SEWAGE_DISPOSAL',  'Бохир ус хүлээн авах',       'Sewage disposal',     '污水处理',   'HAUL',       'M3',         30),
    ('WASTE_TRANSPORT',  'Хог тээвэр',                 'Waste transport',     '垃圾运输',   'HAUL',       'TRIP',       40),
    ('WASTE_DISPOSAL',   'Хог хүлээн авах',            'Waste disposal',      '垃圾处理',   'HAUL',       'TON',        50),
    ('OTHER',            'Бусад үйлчилгээ',            'Other service',       '其他服务',   'MANUAL',     'PIECE',      90)
  ) AS v(code, name_mn, name_en, name_zh, src, unit, sort)
  ON CONFLICT (tenant_id, code) DO NOTHING;

  PERFORM set_config('app.tenant_id', COALESCE(v_prev, ''), true);
END;
$$;
REVOKE ALL ON FUNCTION camp_seed_contract_catalog(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION camp_seed_contract_catalog(uuid) TO app_user;

CREATE OR REPLACE FUNCTION camp_tenants_seed_contract_catalog()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM camp_seed_contract_catalog(NEW.id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION camp_tenants_seed_contract_catalog() FROM PUBLIC;
CREATE TRIGGER trg_tenants_seed_contract_catalog
  AFTER INSERT ON tenants
  FOR EACH ROW EXECUTE FUNCTION camp_tenants_seed_contract_catalog();

DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT id FROM tenants LOOP
    PERFORM camp_seed_contract_catalog(t.id);
  END LOOP;
END $$;

-- ── 3. Гэрээний ажил → каталог ───────────────────────────────
ALTER TABLE camp_contract_items
  ADD COLUMN service_type_id  UUID,
  ADD COLUMN unit_id          UUID,
  -- G-3 (зөвхөн MEAL_ORDER төрөлд): TOTAL_DIV_N = бүх хоол ÷ quantity_divisor · MEAL_TYPE = зөвхөн meal_type
  ADD COLUMN quantity_rule    TEXT CHECK (quantity_rule IN ('TOTAL_DIV_N', 'MEAL_TYPE')),
  ADD COLUMN quantity_divisor NUMERIC(8,2) CHECK (quantity_divisor > 0),
  ADD COLUMN meal_type        "CampMealType";

-- Байгаа мөр (пилотод 0) — кодоор каталог руу
UPDATE camp_contract_items i
   SET service_type_id = (SELECT s.id FROM camp_service_types s WHERE s.tenant_id = i.tenant_id AND s.code = i.service_type::text),
       unit_id         = (SELECT u.id FROM core_units u WHERE u.tenant_id = i.tenant_id AND u.code = i.unit::text),
       quantity_rule   = CASE WHEN i.service_type::text = 'MEAL' THEN 'TOTAL_DIV_N' END,
       quantity_divisor = CASE WHEN i.service_type::text = 'MEAL' THEN 3 END;

-- Хуучин enum-д тулгуурласан trigger-үүдийг эхлээд солино (доор §8), дараа нь баганыг устгана
CREATE OR REPLACE FUNCTION camp_contract_item_service_code(p_tenant_id uuid, p_item_id uuid)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT s.code FROM camp_contract_items i
    JOIN camp_service_types s ON s.tenant_id = i.tenant_id AND s.id = i.service_type_id
   WHERE i.tenant_id = p_tenant_id AND i.id = p_item_id
$$;

CREATE OR REPLACE FUNCTION camp_haul_records_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_transport text;
  v_disposal  text;
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

  -- 6б: каталогийн КОД-оор (анхдагч код; тусдаа тээврийн урсгал V2-02 / v0.2.4)
  v_transport := camp_contract_item_service_code(NEW.tenant_id, NEW.transport_contract_item_id);
  v_disposal  := camp_contract_item_service_code(NEW.tenant_id, NEW.disposal_contract_item_id);

  IF NEW.haul_type = 'SEWAGE' AND (v_transport IS DISTINCT FROM 'SEWAGE_TRANSPORT' OR v_disposal IS DISTINCT FROM 'SEWAGE_DISPOSAL')
  OR NEW.haul_type = 'WASTE'  AND (v_transport IS DISTINCT FROM 'WASTE_TRANSPORT'  OR v_disposal IS DISTINCT FROM 'WASTE_DISPOSAL') THEN
    RAISE EXCEPTION 'CAMP_HAUL_CONTRACT: гэрээний ажлын төрөл таарахгүй (% → тээвэр %, нийлүүлэх цэг %)',
      NEW.haul_type, v_transport, v_disposal
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- 20261107003-ийн хувилбар + гэрээний шалгалт каталогоор (quantity_source = MEAL_ORDER)
CREATE OR REPLACE FUNCTION camp_meal_orders_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_source text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('ACCEPTED', 'CHANGE_REQUESTED') AND camp_tenant_exists(OLD.tenant_id) AND NOT camp_meal_edit_allowed() THEN
      RAISE EXCEPTION 'CAMP_MEAL_LOCKED: хүлээн авсан захиалгыг устгах боломжгүй (%)', OLD.order_date
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('ACCEPTED', 'CHANGE_REQUESTED') AND NOT camp_meal_edit_allowed() THEN
    RAISE EXCEPTION 'CAMP_MEAL_LOCKED: хүлээн авсан захиалгыг өөрчлөх боломжгүй (%)', OLD.order_date
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.meal_contract_item_id IS NOT NULL THEN
    SELECT s.quantity_source INTO v_source
      FROM camp_contract_items i
      JOIN camp_service_types s ON s.tenant_id = i.tenant_id AND s.id = i.service_type_id
     WHERE i.tenant_id = NEW.tenant_id AND i.id = NEW.meal_contract_item_id;
    IF v_source IS DISTINCT FROM 'MEAL_ORDER' THEN
      RAISE EXCEPTION 'CAMP_MEAL_CONTRACT: хоолны захиалгаас тоолдог гэрээний ажил сонгоно уу (%)', v_source
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE camp_contract_items
  DROP CONSTRAINT chk_camp_contract_items_unit,
  DROP CONSTRAINT uq_camp_contract_items_service,
  DROP COLUMN service_type,
  DROP COLUMN unit,
  ALTER COLUMN service_type_id SET NOT NULL,
  ALTER COLUMN unit_id SET NOT NULL,
  ADD CONSTRAINT fk_camp_contract_items_service_type FOREIGN KEY (tenant_id, service_type_id)
    REFERENCES camp_service_types (tenant_id, id),
  ADD CONSTRAINT fk_camp_contract_items_unit FOREIGN KEY (tenant_id, unit_id)
    REFERENCES core_units (tenant_id, id),
  ADD CONSTRAINT chk_camp_contract_items_rule CHECK (
    (quantity_rule IS NULL     AND quantity_divisor IS NULL AND meal_type IS NULL)
 OR (quantity_rule = 'TOTAL_DIV_N' AND quantity_divisor IS NOT NULL AND meal_type IS NULL)
 OR (quantity_rule = 'MEAL_TYPE'   AND quantity_divisor IS NULL AND meal_type IS NOT NULL));
-- Нэг гэрээнд нэг үйлчилгээ нэг удаа; MEAL_TYPE-д хоолны төрөл бүрт тусдаа мөр (хоол тус бүрийн үнэ, G-3)
CREATE UNIQUE INDEX uq_camp_contract_items_service
  ON camp_contract_items (contract_id, service_type_id, meal_type) NULLS NOT DISTINCT;
DROP INDEX IF EXISTS idx_camp_contract_items_service;
CREATE INDEX idx_camp_contract_items_service ON camp_contract_items (tenant_id, camp_id, service_type_id);

-- ── 4. Гэрээ: валют, НӨАТ, ханш, төлбөрийн хуваарь ───────────
-- rate_policy: NONE (гэрээний валют = төлбөрийн валют) · FIXED (fixed_rate) · MONTHLY_MANUAL (core_exchange_rates, сар бүр)
-- payment_terms: [{ "percent": 95, "rule": "AFTER_INVOICE_WORKDAYS", "n": 10, "note": "…" }, …] — нийлбэр 100 (service)
ALTER TABLE camp_contracts
  ADD COLUMN customer_organization_id UUID,
  ADD COLUMN currency         TEXT          NOT NULL DEFAULT 'MNT' CHECK (currency ~ '^[A-Z]{3}$'),
  ADD COLUMN payment_currency TEXT          NOT NULL DEFAULT 'MNT' CHECK (payment_currency ~ '^[A-Z]{3}$'),
  ADD COLUMN vat_rate         NUMERIC(5,2)  NOT NULL DEFAULT 0 CHECK (vat_rate >= 0 AND vat_rate < 100),
  ADD COLUMN rate_policy      TEXT          NOT NULL DEFAULT 'NONE' CHECK (rate_policy IN ('NONE', 'FIXED', 'MONTHLY_MANUAL')),
  ADD COLUMN fixed_rate       NUMERIC(18,6) CHECK (fixed_rate > 0),
  ADD COLUMN payment_terms    JSONB         NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(payment_terms) = 'array'),
  ADD CONSTRAINT chk_camp_contracts_rate CHECK (
    ((rate_policy = 'NONE') = (currency = payment_currency))
    AND ((rate_policy = 'FIXED') = (fixed_rate IS NOT NULL))),
  ADD CONSTRAINT fk_camp_contracts_customer FOREIGN KEY (tenant_id, customer_organization_id)
    REFERENCES camp_organizations (tenant_id, id);
ALTER TABLE camp_contracts
  ALTER COLUMN currency DROP DEFAULT,
  ALTER COLUMN payment_currency DROP DEFAULT,
  ALTER COLUMN vat_rate DROP DEFAULT;

-- ── 5. Сунгалт / нэмэлт өөрчлөлт (түүх, засагдахгүй) ─────────
CREATE TABLE camp_contract_amendments (
  id                 UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id          UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camp_id            UUID        NOT NULL,
  contract_id        UUID        NOT NULL,
  amendment_type     TEXT        NOT NULL CHECK (amendment_type IN ('EXTENSION', 'PRICE_CHANGE', 'TERMS', 'TERMINATION', 'OTHER')),
  effective_date     DATE        NOT NULL,
  previous_end_date  DATE,
  new_end_date       DATE,
  document_no        TEXT,
  note               TEXT,
  created_by         UUID        NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_camp_contract_amendments_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT chk_camp_contract_amendments_extension CHECK (amendment_type <> 'EXTENSION' OR new_end_date IS NOT NULL),
  CONSTRAINT fk_camp_contract_amendments_contract FOREIGN KEY (tenant_id, camp_id, contract_id)
    REFERENCES camp_contracts (tenant_id, camp_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_camp_contract_amendments_created_by FOREIGN KEY (tenant_id, created_by) REFERENCES core_users (tenant_id, id)
);
CREATE INDEX idx_camp_contract_amendments_contract ON camp_contract_amendments (tenant_id, contract_id, effective_date);
SELECT camp_apply_tenant_rls('camp_contract_amendments');

-- Түүх: засахгүй; устгах зөвхөн эх гэрээ устах (CASCADE) эсвэл tenant устахад
CREATE OR REPLACE FUNCTION camp_contract_amendments_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'CAMP_CONTRACT_HISTORY: нэмэлт өөрчлөлтийн түүхийг засах боломжгүй'
      USING ERRCODE = 'check_violation';
  END IF;
  IF camp_tenant_exists(OLD.tenant_id)
     AND EXISTS (SELECT 1 FROM camp_contracts c WHERE c.tenant_id = OLD.tenant_id AND c.id = OLD.contract_id) THEN
    RAISE EXCEPTION 'CAMP_CONTRACT_HISTORY: нэмэлт өөрчлөлтийн түүхийг устгах боломжгүй'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER trg_camp_contract_amendments_immutable
  BEFORE UPDATE OR DELETE ON camp_contract_amendments
  FOR EACH ROW EXECUTE FUNCTION camp_contract_amendments_immutable();

-- ── 6. Үнэ: валют, тэмдэглэл, хэн, нэмэлт өөрчлөлт ───────────
ALTER TABLE camp_contract_item_prices
  ADD COLUMN currency     TEXT NOT NULL DEFAULT 'MNT' CHECK (currency ~ '^[A-Z]{3}$'),
  ADD COLUMN note         TEXT,
  ADD COLUMN created_by   UUID,
  ADD COLUMN amendment_id UUID,
  ADD CONSTRAINT uq_camp_contract_item_prices_tenant_id UNIQUE (tenant_id, id),
  ADD CONSTRAINT fk_camp_contract_item_prices_created_by FOREIGN KEY (tenant_id, created_by) REFERENCES core_users (tenant_id, id),
  ADD CONSTRAINT fk_camp_contract_item_prices_amendment FOREIGN KEY (tenant_id, amendment_id)
    REFERENCES camp_contract_amendments (tenant_id, id);
UPDATE camp_contract_item_prices p
   SET currency = c.currency
  FROM camp_contract_items i JOIN camp_contracts c ON c.tenant_id = i.tenant_id AND c.id = i.contract_id
 WHERE i.tenant_id = p.tenant_id AND i.id = p.contract_item_id;
ALTER TABLE camp_contract_item_prices ALTER COLUMN currency DROP DEFAULT;

-- ── 7. Ханш (гараар, tenant) ─────────────────────────────────
-- 1 base_currency = rate quote_currency. MONTHLY_MANUAL бодлого: rate_date = сарын 1-ний өдөр (service)
CREATE TABLE core_exchange_rates (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id       UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rate_date       DATE          NOT NULL,
  base_currency   TEXT          NOT NULL CHECK (base_currency ~ '^[A-Z]{3}$'),
  quote_currency  TEXT          NOT NULL CHECK (quote_currency ~ '^[A-Z]{3}$'),
  rate            NUMERIC(18,6) NOT NULL CHECK (rate > 0),
  source_note     TEXT,
  created_by      UUID          NOT NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT clock_timestamp(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT chk_core_exchange_rates_pair CHECK (base_currency <> quote_currency),
  CONSTRAINT uq_core_exchange_rates UNIQUE (tenant_id, rate_date, base_currency, quote_currency),
  CONSTRAINT fk_core_exchange_rates_created_by FOREIGN KEY (tenant_id, created_by) REFERENCES core_users (tenant_id, id)
);
CREATE INDEX idx_core_exchange_rates_lookup ON core_exchange_rates (tenant_id, base_currency, quote_currency, rate_date DESC);
SELECT camp_apply_tenant_rls('core_exchange_rates');

-- ── 8. Зардал: service_type enum → TEXT (каталогийн кодын snapshot) ─
ALTER TABLE camp_cost_entries DROP CONSTRAINT chk_camp_cost_source;
ALTER TABLE camp_cost_entries ALTER COLUMN service_type TYPE TEXT USING service_type::text;
ALTER TABLE camp_cost_entries ADD CONSTRAINT chk_camp_cost_source CHECK (
    (source = 'HAUL'             AND haul_record_id IS NOT NULL AND meal_order_id IS NULL AND maintenance_part_id IS NULL
       AND contract_item_id IS NOT NULL AND service_type IS NOT NULL)
 OR (source = 'MEAL'             AND meal_order_id IS NOT NULL AND haul_record_id IS NULL AND maintenance_part_id IS NULL
       AND contract_item_id IS NOT NULL AND service_type IS NOT NULL)
 OR (source = 'MAINTENANCE_PART' AND maintenance_part_id IS NOT NULL AND haul_record_id IS NULL AND meal_order_id IS NULL
       AND contract_item_id IS NULL AND service_type IS NULL));

-- ── 9. Хуучин enum, эрхийн хувилбар ──────────────────────────
DROP TYPE "CampServiceType";
DROP TYPE "CampContractUnit";

-- `camp.contract.manage` — гэрээ v0.2.3-д орсон (UI-д «удахгүй» биш). Rollback: available_in = 'v2'
UPDATE core_permissions SET available_in = 'v1' WHERE code = 'camp.contract.manage';
