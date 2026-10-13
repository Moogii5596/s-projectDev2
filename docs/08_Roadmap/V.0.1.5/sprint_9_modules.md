---
title: "Sprint 9 — Нэмэлт Модулиуд (v0.1.5.4)"
type: "Roadmap"
status: "Archived"
last_updated: 2026-10-08
tags: [roadmap, v0.1.5]
---

# Sprint 9 — Нэмэлт Модулиуд (v0.1.5.4)

> 🔧 **Хэрэгжүүлэлтийн засвар (2026-10-08, Phase 4):**
> - RLS: доорх `AS RESTRICTIVE ... TO s_project_app_user` загвар **БУРУУ** (permissive policy-гүй → 0 мөр; role байхгүй).
>   Стандарт: `ENABLE` + `FORCE` + `AS PERMISSIVE FOR ALL TO app_user` + `GRANT ... TO app_user` — lessons [RLS-004].
> - Модуль хоорондын холболт: EventEmitter биш, MR transaction дотор шууд — `MrLifecycleService` (submit/approve/reject).
> - Budget: tenant-д идэвхтэй хугацаа байвал MR-д хэлтэс + төсөв заавал; давхцвал хамгийн богино хугацаа.
> - Inventory: үлдэгдэл хүрэлцэхгүй бол боломжтойг нөөцөлж, дутууг тэмдэглэнэ (батлалт зогсохгүй).
> - `GENERATED` багана ашиглахгүй (Prisma дэмжихгүй) — service-д тооцоолно. `prisma db push` хориотой [MIG-001].
> - Төлөвлөгөө/явц: [[01_analysis_and_plan_2026-10-08]] → Phase 4.
> - **Хамрах хүрээ (2026-10-08 17:47):** Inventory/Vendor/Report нь платформ батлах **ХӨНГӨН** модуль (`inventory_items`, `vendors`, `/reports/summary(.csv)`). Доорх 9.A, 9.C, 9.D-ийн дэлгэрэнгүй (агуулах, нөөцлөлт, үнийн санал, Excel, dashboard) **хэрэгжүүлэхгүй** — түүхэн лавлагаа. Шинэ модулийн загвар: [[03_Module_Template]].

> **Зорилго:** Inventory, Budget, Vendor, Report 4 модуль — schema, CRUD, модуль хоорондын холболт, frontend
> **Working dir:** `apps/core-kernel/src/modules/` + `apps/web-shell/src/pages/`
> **Хамаарал:** Sprint 6 (schema routing), Sprint 7 (workflow) дууссан байх

---

## Архитектурын Зарчим

Модуль бүр нь **тусдаа NestJS Module** — `MaterialRequisitionModule` патерныг дагана:

```
apps/core-kernel/src/modules/
  inventory/
    inventory.module.ts
    inventory.controller.ts
    inventory.service.ts
    dto/
    tests/
  budget/
    budget.module.ts
    budget.controller.ts
    budget.service.ts
    dto/
    tests/
  vendor/
    vendor.module.ts
    vendor.controller.ts
    vendor.service.ts
    dto/
    tests/
  report/
    report.module.ts
    report.controller.ts
    report.service.ts
    dto/
    tests/
```

Модуль хоорондын харилцаа → **EventEmitter2** (RULE-04 дагаж transaction дотор):
```
MR Submit → BudgetModule.checkBudget → InventoryModule.reserveItems
```

---

## 9.A — Inventory Module

### Алхам 9.A.1 — Migration

- [ ] `supabase/migrations/YYYYMMDD_inventory.sql`:

```sql
-- Агуулахын байршил
CREATE TABLE warehouses (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  location    TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Бараа бүтээгдэхүүн
CREATE TABLE inventory_items (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  warehouse_id  UUID        NOT NULL REFERENCES warehouses(id),
  name          TEXT        NOT NULL,
  sku           TEXT,
  unit          TEXT        NOT NULL DEFAULT 'ширхэг',
  quantity      NUMERIC(15,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reserved_qty  NUMERIC(15,3) NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0),
  min_threshold NUMERIC(15,3) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT chk_reserved_lte_qty CHECK (reserved_qty <= quantity)
);

-- MR-тэй холболт (MR approved → inventory reserved)
CREATE TABLE inventory_reservations (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  inventory_item_id UUID      NOT NULL REFERENCES inventory_items(id),
  mr_header_id    UUID        NOT NULL REFERENCES mr_headers(id),
  mr_item_id      UUID        NOT NULL REFERENCES mr_items(id),
  reserved_qty    NUMERIC(15,3) NOT NULL CHECK (reserved_qty > 0),
  status          TEXT        NOT NULL DEFAULT 'RESERVED'
    CHECK (status IN ('RESERVED','FULFILLED','CANCELLED')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- RLS (бүх хүснэгтэд — RULE-12)
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_warehouses ON warehouses AS RESTRICTIVE FOR ALL TO s_project_app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_inventory_items ON inventory_items AS RESTRICTIVE FOR ALL TO s_project_app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE inventory_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_reservations FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_inventory_reservations ON inventory_reservations AS RESTRICTIVE FOR ALL TO s_project_app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE INDEX idx_inventory_items_tenant_sku ON inventory_items(tenant_id, sku) WHERE sku IS NOT NULL;
CREATE INDEX idx_inventory_reservations_mr ON inventory_reservations(tenant_id, mr_header_id);
```

### Алхам 9.A.2 — NestJS Module + CRUD

- [ ] `InventoryModule` — CRUD endpoints:
  - `GET /api/v1/inventory/warehouses` — агуулахын жагсаалт
  - `POST /api/v1/inventory/warehouses` — агуулах нэмэх
  - `GET /api/v1/inventory/items` — бараа жагсаалт (cursor pagination)
  - `POST /api/v1/inventory/items` — бараа нэмэх
  - `PUT /api/v1/inventory/items/:id/adjust` — үлдэгдэл тохируулах
  - `POST /api/v1/inventory/reserve` — MR-д бараа нөөцлөх
  - `GET /api/v1/inventory/low-stock` — доод хязгаараас бага үлдэгдэлтэй барааны жагсаалт

### Алхам 9.A.3 — MR Холболт (Event)

- [ ] `workflow.instance.approved` event → `InventoryService.reserveForMr()`:

```typescript
@OnEvent('workflow.instance.approved')
async handleMrApproved(payload: WorkflowApprovedEvent) {
  // MR items-г inventory_reservations-д бүртгэх
  // reserved_qty нэмэх (transaction дотор — RULE-04)
}
```

### Алхам 9.A.4 — Тест

- [ ] `inventory.service.test.ts` — CRUD, reserve, low-stock
- [ ] `inventory-rls-leakage.test.ts` — Tenant A → Tenant B inventory харагдахгүй
- [ ] Event integration тест — workflow.approved → reservation үүснэ

---

## 9.B — Budget Module

### Алхам 9.B.1 — Migration

- [x] `supabase/migrations/20261008002_budget.sql` (RLS стандартаар засварласан):

```sql
-- Төсвийн ангилал (жил, улирал, сар)
CREATE TABLE budget_periods (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,    -- "2026 оны 3-р улирал"
  period_type TEXT        NOT NULL CHECK (period_type IN ('ANNUAL','QUARTERLY','MONTHLY')),
  start_date  DATE        NOT NULL,
  end_date    DATE        NOT NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Хэлтэс/нэгжийн төсөв
CREATE TABLE budget_allocations (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_id        UUID        NOT NULL REFERENCES budget_periods(id),
  department       TEXT        NOT NULL,
  total_amount     NUMERIC(18,2) NOT NULL CHECK (total_amount > 0),
  committed_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  spent_amount     NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT chk_budget_balance
    CHECK (committed_amount + spent_amount <= total_amount)
);

-- MR-тэй холболт
CREATE TABLE budget_commitments (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  allocation_id   UUID        NOT NULL REFERENCES budget_allocations(id),
  mr_header_id    UUID        NOT NULL REFERENCES mr_headers(id),
  amount          NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  status          TEXT        NOT NULL DEFAULT 'COMMITTED'
    CHECK (status IN ('COMMITTED','SPENT','RELEASED')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- RLS (RULE-12)
ALTER TABLE budget_periods ENABLE ROW LEVEL SECURITY; ALTER TABLE budget_periods FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_budget_periods ON budget_periods AS RESTRICTIVE FOR ALL TO s_project_app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE budget_allocations ENABLE ROW LEVEL SECURITY; ALTER TABLE budget_allocations FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_budget_allocations ON budget_allocations AS RESTRICTIVE FOR ALL TO s_project_app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE budget_commitments ENABLE ROW LEVEL SECURITY; ALTER TABLE budget_commitments FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_budget_commitments ON budget_commitments AS RESTRICTIVE FOR ALL TO s_project_app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
```

### Алхам 9.B.2 — NestJS Module + Budget Check

- [x] `BudgetModule` endpoints (+ `PATCH /budget/allocations/:id`):
  - `GET /api/v1/budget/periods` — идэвхтэй төсвийн хугацаа
  - `GET /api/v1/budget/allocations` — хэлтэсийн төсөв (үлдэгдэл харах)
  - `POST /api/v1/budget/allocations` — төсөв тогтоох
  - `POST /api/v1/budget/check` — MR-н дүнг төсвийн хязгаартай харьцуулах

- [x] MR submit-д budget check (`MrLifecycleService.onSubmitted` → `BudgetService.commitForMr`, `FOR UPDATE`):

```typescript
// MaterialRequisitionService.submit()
async submit(tenantId: string, mrId: string, userId: string) {
  // 1. MR дүнг тооцоолох
  const total = await this.calculateTotal(tenantId, mrId);

  // 2. Budget шалгах (BudgetService.checkAvailability)
  const budgetOk = await this.budgetService.checkAvailability(tenantId, total);
  if (!budgetOk) {
    throw new BadRequestException('Төсвийн хязгаар хүрсэн байна');
  }

  // 3. Workflow эхлүүлэх (amount-based routing)
  // ...
}
```

### Алхам 9.B.3 — Тест

- [x] `budget.service.test.ts` — CRUD, check, commit (+ PostgreSQL 16 дээр SQL 10 сценари, зэрэгцээ commit)
- [x] Budget limit exceed → 400 BadRequest тест (`test/budget.integration.spec.ts`)
- [x] MR approved → commitment.status = 'SPENT', rejected → 'RELEASED' (transaction дотор)

---

## 9.C — Vendor Module

### Алхам 9.C.1 — Migration

- [ ] `supabase/migrations/YYYYMMDD_vendor.sql`:

```sql
-- Нийлүүлэгч
CREATE TABLE vendors (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  reg_number   TEXT,         -- байгууллагын регистр
  contact_name TEXT,
  email        TEXT,
  phone        TEXT,
  address      TEXT,
  payment_terms INTEGER    DEFAULT 30,   -- өдрөөр
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Үнийн санал (MR-д холбогдох)
CREATE TABLE vendor_quotes (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vendor_id    UUID        NOT NULL REFERENCES vendors(id),
  mr_header_id UUID        REFERENCES mr_headers(id),
  quote_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
  valid_until  DATE        NOT NULL,
  total_amount NUMERIC(18,2) NOT NULL CHECK (total_amount > 0),
  status       TEXT        NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','ACCEPTED','REJECTED','EXPIRED')),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Үнийн саналын мөрүүд
CREATE TABLE vendor_quote_items (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  quote_id     UUID        NOT NULL REFERENCES vendor_quotes(id) ON DELETE CASCADE,
  mr_item_id   UUID        REFERENCES mr_items(id),
  description  TEXT        NOT NULL,
  quantity     NUMERIC(15,3) NOT NULL CHECK (quantity > 0),
  unit_price   NUMERIC(18,2) NOT NULL CHECK (unit_price >= 0),
  total_price  NUMERIC(18,2) GENERATED ALWAYS AS (quantity * unit_price) STORED
);

-- RLS (RULE-12) — бүх хүснэгтэд
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY; ALTER TABLE vendors FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_vendors ON vendors AS RESTRICTIVE FOR ALL TO s_project_app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE vendor_quotes ENABLE ROW LEVEL SECURITY; ALTER TABLE vendor_quotes FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_vendor_quotes ON vendor_quotes AS RESTRICTIVE FOR ALL TO s_project_app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE vendor_quote_items ENABLE ROW LEVEL SECURITY; ALTER TABLE vendor_quote_items FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_vendor_quote_items ON vendor_quote_items AS RESTRICTIVE FOR ALL TO s_project_app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
```

### Алхам 9.C.2 — NestJS Module

- [ ] `VendorModule` endpoints:
  - `GET /api/v1/vendors` — нийлүүлэгчийн жагсаалт
  - `POST /api/v1/vendors` — нийлүүлэгч нэмэх
  - `PUT /api/v1/vendors/:id` — мэдээлэл засах
  - `POST /api/v1/vendors/:id/quotes` — үнийн санал оруулах
  - `GET /api/v1/requisitions/:mrId/quotes` — MR-н үнийн саналууд
  - `POST /api/v1/vendors/quotes/:id/accept` — үнийн санал зөвшөөрөх

### Алхам 9.C.3 — Тест

- [ ] `vendor.service.test.ts` — CRUD, quote create, accept
- [ ] Quote accept → MR status update тест

---

## 9.D — Report Module

### Алхам 9.D.1 — Report Endpoints

- [ ] `ReportModule` endpoints:
  - `GET /api/v1/reports/mr-summary` — MR дүгнэлт (статус, тоо, дүн)
  - `GET /api/v1/reports/approval-sla` — батлах хугацааны статистик (Sprint 7-д бэлтгэсэн)
  - `GET /api/v1/reports/budget-utilization` — төсвийн ашиглалт
  - `GET /api/v1/reports/vendor-performance` — нийлүүлэгчийн гүйцэтгэл
  - `GET /api/v1/reports/inventory-status` — агуулахын байдал
  - `POST /api/v1/reports/export` — Excel/PDF export

### Алхам 9.D.2 — Excel Export

- [ ] `pnpm --filter core-kernel add exceljs`:

```typescript
// ReportService.exportMrSummary() → Buffer (Excel)
const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet('MR Summary');
sheet.columns = [
  { header: 'MR дугаар', key: 'mrNumber', width: 15 },
  { header: 'Гарчиг', key: 'title', width: 30 },
  { header: 'Статус', key: 'status', width: 15 },
  { header: 'Нийт дүн', key: 'totalAmount', width: 15 },
  { header: 'Үүсгэсэн огноо', key: 'createdAt', width: 18 },
];
// ... data нэмэх
const buffer = await workbook.xlsx.writeBuffer();
return buffer;
```

### Алхам 9.D.3 — Frontend Dashboard

- [ ] `apps/web-shell/src/pages/reports/ReportDashboardPage.tsx`:
  - MR статус pie chart
  - Сарын MR тоо bar chart
  - Төсвийн ашиглалт progress bar
  - Excel download товч

---

## 9.E — Тест (Нийт)

- [ ] `apps/core-kernel/src/modules/inventory/tests/inventory.service.test.ts`
- [ ] `apps/core-kernel/src/modules/budget/tests/budget.service.test.ts`
- [ ] `apps/core-kernel/src/modules/vendor/tests/vendor.service.test.ts`
- [ ] `apps/core-kernel/src/modules/report/tests/report.service.test.ts`
- [ ] `apps/core-kernel/src/modules/tests/cross-module-chain.test.ts`:
  - MR submit → Budget check → Inventory reserve дараалал
  - Budget limit exceeded → 400, MR DRAFT хэвээр

---

## Шалгуур (Definition of Done)

- [ ] `pnpm test` бүх модулийн тест давна
- [ ] Inventory: MR approved → автоматаар бараа нөөцлөгдөнө
- [ ] Budget: MR submit → budget хязгаараас давсан бол 400 буцаана
- [ ] Vendor: MR-д үнийн санал холбож, нэг нь accept хийж болно
- [ ] Report: Excel export → `.xlsx` файл татаж болно
- [ ] RLS leakage тест: модуль бүрт tenant isolation баталгаажсан

---

## Алдааны Урьдчилсан Сэрэмжлүүлэг

> ⚠️ **АНХААР:** `budget_allocations.committed_amount + spent_amount <= total_amount` CHECK constraint — update хийхдээ нийлбэрийг шалгаж байна уу. Concurrent request-д `SELECT ... FOR UPDATE` pessimistic lock ашиглах (RULE: workflow engine pattern дагах).

> ⚠️ **АНХААР:** `vendor_quote_items.total_price` нь `GENERATED ALWAYS AS ... STORED` — Prisma-д `@default` биш `@computed` гэж тэмдэглэх, INSERT-д оруулж болохгүй.

> ⚠️ **АНХААР:** `exceljs` Buffer буцаах — NestJS controller-д `@Res()` ашигладаг бол `passthrough: true` оруулахаа мартах, эс бөгөөс FastifyReply flush хийхгүй.
