-- ============================================================
-- Camp Module · Шат 1.5 — Гэрээ, гэрээний ажил, үнийн түүх (2026-10-09)
-- ============================================================
-- Үнийн цорын ганц эх сурвалж = гэрээ. Нэг үйлчилгээнд олон идэвхтэй гэрээ байж болно (бүртгэл дээр сонгоно).
-- Тухайн өдрийн үнэ = effective_from <= D-ийн хамгийн сүүлийнх (ContractPricingService, Шат 5).
-- "Хугацаа дууссан" хадгалахгүй — end_date < D-ээр тооцоолно.
-- ============================================================

CREATE TYPE "CampContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'TERMINATED');
CREATE TYPE "CampServiceType"    AS ENUM ('SEWAGE_TRANSPORT', 'SEWAGE_DISPOSAL', 'WASTE_TRANSPORT', 'WASTE_DISPOSAL', 'MEAL');
CREATE TYPE "CampContractUnit"   AS ENUM ('TRIP', 'M3', 'TON', 'PERSON_DAY');

-- ── 1. Гэрээ ──────────────────────────────────────────────────
CREATE TABLE camp_contracts (
  id               UUID                 PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id        UUID                 NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camp_id          UUID                 NOT NULL,
  organization_id  UUID                 NOT NULL,
  contract_no      TEXT                 NOT NULL CHECK (btrim(contract_no) <> ''),
  title            TEXT                 NOT NULL CHECK (btrim(title) <> ''),
  start_date       DATE                 NOT NULL,
  end_date         DATE,                                  -- NULL = хугацаагүй
  status           "CampContractStatus" NOT NULL DEFAULT 'DRAFT',
  terminated_at    DATE,
  note             TEXT,
  created_at       TIMESTAMPTZ          NOT NULL DEFAULT clock_timestamp(),
  updated_at       TIMESTAMPTZ          NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_camp_contracts_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_camp_contracts_camp_id   UNIQUE (tenant_id, camp_id, id),
  CONSTRAINT uq_camp_contracts_no        UNIQUE (tenant_id, contract_no),
  CONSTRAINT chk_camp_contracts_dates CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT chk_camp_contracts_terminated CHECK ((status = 'TERMINATED') = (terminated_at IS NOT NULL)),
  CONSTRAINT fk_camp_contracts_camp FOREIGN KEY (tenant_id, camp_id) REFERENCES camps (tenant_id, id),
  CONSTRAINT fk_camp_contracts_org  FOREIGN KEY (tenant_id, organization_id) REFERENCES camp_organizations (tenant_id, id)
);
CREATE INDEX idx_camp_contracts_active ON camp_contracts (tenant_id, camp_id, status, start_date, end_date);
CREATE INDEX idx_camp_contracts_org    ON camp_contracts (tenant_id, organization_id);

-- ── 2. Гэрээгээр хийх ажил ────────────────────────────────────
-- camp_id-г гэрээнээс давтан хадгална → бүртгэл (haul/meal) зөвхөн өөрийн кемпийн гэрээг сонгоно (composite FK, D2)
CREATE TABLE camp_contract_items (
  id            UUID               PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id     UUID               NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camp_id       UUID               NOT NULL,
  contract_id   UUID               NOT NULL,
  service_type  "CampServiceType"  NOT NULL,
  unit          "CampContractUnit" NOT NULL,
  description   TEXT,
  created_at    TIMESTAMPTZ        NOT NULL DEFAULT clock_timestamp(),
  updated_at    TIMESTAMPTZ        NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_camp_contract_items_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_camp_contract_items_camp_id   UNIQUE (tenant_id, camp_id, id),
  CONSTRAINT uq_camp_contract_items_service   UNIQUE (contract_id, service_type),
  -- Хоол = хүн-өдөр; бохир ус/хог = рейс / м³ / тн
  CONSTRAINT chk_camp_contract_items_unit CHECK (
    (service_type = 'MEAL') = (unit = 'PERSON_DAY')),
  CONSTRAINT fk_camp_contract_items_contract FOREIGN KEY (tenant_id, camp_id, contract_id)
    REFERENCES camp_contracts (tenant_id, camp_id, id) ON DELETE CASCADE
);
CREATE INDEX idx_camp_contract_items_service ON camp_contract_items (tenant_id, camp_id, service_type);

-- ── 3. Үнийн түүх ─────────────────────────────────────────────
CREATE TABLE camp_contract_item_prices (
  id                UUID          PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id         UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contract_item_id  UUID          NOT NULL,
  effective_from    DATE          NOT NULL,
  unit_price        NUMERIC(18,2) NOT NULL CHECK (unit_price >= 0),
  vat_included      BOOLEAN       NOT NULL,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT clock_timestamp(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_camp_contract_item_prices UNIQUE (contract_item_id, effective_from),
  CONSTRAINT fk_camp_contract_item_prices_item FOREIGN KEY (tenant_id, contract_item_id)
    REFERENCES camp_contract_items (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX idx_camp_contract_item_prices_lookup
  ON camp_contract_item_prices (tenant_id, contract_item_id, effective_from DESC);

-- ── 4. RLS + GRANT + updated_at ───────────────────────────────
SELECT camp_apply_tenant_rls('camp_contracts');
SELECT camp_apply_tenant_rls('camp_contract_items');
SELECT camp_apply_tenant_rls('camp_contract_item_prices');
