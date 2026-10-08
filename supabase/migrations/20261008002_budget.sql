-- ============================================================
-- Phase 4.1 — Budget Module (Sprint 9.B, v0.1.5.4) — 2026-10-08
-- ============================================================
-- Шийдвэр (2026-10-08):
--   * Модуль хоорондын холболт: MR submit/approve/reject-ийн transaction дотор шууд (MrLifecycleService)
--   * Tenant-д идэвхтэй budget_period байвал MR-ийн хэлтэст идэвхтэй төсөв ЗААВАЛ, үгүй бол шалгахгүй
--
-- RLS хэв маяг (Phase 4 стандарт — sprint_9 баримтын RESTRICTIVE-only хувилбар БУРУУ байсан):
--   ENABLE + FORCE + PERMISSIVE policy TO app_user + GRANT app_user
--   (RESTRICTIVE policy ганцаараа ямар ч мөр харуулахгүй — PostgreSQL permissive policy шаарддаг)
-- RULE-11: uuid_generate_v7()
-- ============================================================

-- 1. Төсвийн хугацаа
CREATE TABLE budget_periods (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  period_type TEXT        NOT NULL CHECK (period_type IN ('ANNUAL', 'QUARTERLY', 'MONTHLY')),
  start_date  DATE        NOT NULL,
  end_date    DATE        NOT NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT chk_budget_period_dates CHECK (end_date >= start_date)
);

-- 2. Хэлтсийн төсөв
CREATE TABLE budget_allocations (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id        UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_id        UUID          NOT NULL REFERENCES budget_periods(id) ON DELETE CASCADE,
  department       TEXT          NOT NULL CHECK (btrim(department) <> ''),
  total_amount     NUMERIC(18,2) NOT NULL CHECK (total_amount > 0),
  committed_amount NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (committed_amount >= 0),
  spent_amount     NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (spent_amount >= 0),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT clock_timestamp(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT clock_timestamp(),
  -- Хамгаалалтын сүүлийн шугам: app түвшинд FOR UPDATE lock-тэй шалгадаг ч DB ч зөвшөөрөхгүй
  CONSTRAINT chk_budget_balance CHECK (committed_amount + spent_amount <= total_amount)
);
-- Нэг хугацаанд нэг хэлтэст нэг төсөв (том/жижиг үсэг, зай үл хамаарна)
CREATE UNIQUE INDEX uq_budget_allocations_period_dept
  ON budget_allocations (tenant_id, period_id, lower(btrim(department)));

-- 3. MR-ийн төсвийн бүртгэл (MR тутамд нэг)
CREATE TABLE budget_commitments (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id     UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  allocation_id UUID          NOT NULL REFERENCES budget_allocations(id),
  mr_header_id  UUID          NOT NULL REFERENCES mr_headers(id) ON DELETE CASCADE,
  amount        NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  status        TEXT          NOT NULL DEFAULT 'COMMITTED'
    CHECK (status IN ('COMMITTED', 'SPENT', 'RELEASED')),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT clock_timestamp(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_budget_commitments_mr UNIQUE (mr_header_id)
);

CREATE INDEX idx_budget_periods_tenant_active ON budget_periods (tenant_id, is_active, start_date, end_date);
CREATE INDEX idx_budget_allocations_period ON budget_allocations (tenant_id, period_id);
CREATE INDEX idx_budget_commitments_allocation ON budget_commitments (tenant_id, allocation_id, status);

-- 4. RLS — ENABLE + FORCE + PERMISSIVE (TO app_user) + GRANT
ALTER TABLE budget_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_periods FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_budget_periods ON budget_periods
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE budget_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_allocations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_budget_allocations ON budget_allocations
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE budget_commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_commitments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_budget_commitments ON budget_commitments
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON budget_periods, budget_allocations, budget_commitments TO app_user;
