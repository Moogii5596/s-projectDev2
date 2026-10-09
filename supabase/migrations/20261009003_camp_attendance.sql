-- ============================================================
-- Camp Module · Шат 1.3 — Цагийн бүртгэл, ирц, өрөө хуваарилалт (2026-10-09)
-- ============================================================
-- camp_shift_adjustments, camp_movement_imports, camp_movements, camp_stays, camp_room_allocations
-- Огнооны давхцал → EXCLUDE USING gist (btree_gist, 1.1-д суулгасан). Хугацаа нь хоёр талдаа хамаарна '[]'.
-- ============================================================

CREATE TYPE "CampShiftAdjustmentReason" AS ENUM ('EARLY_ARRIVAL', 'SHIFT_CHANGE', 'OTHER');
CREATE TYPE "CampImportStatus"          AS ENUM ('PREVIEW', 'CONFIRMED', 'CANCELLED');
CREATE TYPE "CampMovementDirection"     AS ENUM ('ARRIVAL', 'DEPARTURE');
CREATE TYPE "CampMovementKind"          AS ENUM ('ROSTER', 'OFF_ROSTER');
CREATE TYPE "CampMealType"              AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'NIGHT');

-- ── 1. Ээлжийн зохицуулалт (хэлтсийн загварыг ажилтан тус бүрээр дарна) ──
CREATE TABLE camp_shift_adjustments (
  id           UUID                        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id    UUID                        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id  UUID                        NOT NULL,
  start_date   DATE                        NOT NULL,
  end_date     DATE                        NOT NULL,
  shift        "CampShiftType"             NOT NULL,
  reason_type  "CampShiftAdjustmentReason" NOT NULL,
  reason       TEXT,
  created_by   UUID                        NOT NULL,   -- core_users.id (RULE-13)
  created_at   TIMESTAMPTZ                 NOT NULL DEFAULT clock_timestamp(),
  updated_at   TIMESTAMPTZ                 NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT chk_camp_shift_adj_dates CHECK (end_date >= start_date),
  CONSTRAINT chk_camp_shift_adj_reason CHECK (reason_type <> 'OTHER' OR btrim(coalesce(reason, '')) <> ''),
  CONSTRAINT fk_camp_shift_adj_employee FOREIGN KEY (tenant_id, employee_id) REFERENCES camp_employees (tenant_id, id),
  CONSTRAINT fk_camp_shift_adj_created_by FOREIGN KEY (tenant_id, created_by) REFERENCES core_users (tenant_id, id),
  CONSTRAINT ex_camp_shift_adj_overlap EXCLUDE USING gist (
    employee_id WITH =, daterange(start_date, end_date, '[]') WITH &&)
);
CREATE INDEX idx_camp_shift_adj_dates ON camp_shift_adjustments (tenant_id, start_date, end_date);

-- ── 2. Ирцийн xlsx импорт ─────────────────────────────────────
CREATE TABLE camp_movement_imports (
  id            UUID               PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id     UUID               NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camp_id       UUID               NOT NULL,
  file_name     TEXT               NOT NULL CHECK (btrim(file_name) <> ''),
  status        "CampImportStatus" NOT NULL DEFAULT 'PREVIEW',
  total_rows    INTEGER            NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  ok_rows       INTEGER            NOT NULL DEFAULT 0 CHECK (ok_rows >= 0),
  error_rows    INTEGER            NOT NULL DEFAULT 0 CHECK (error_rows >= 0),
  errors        JSONB              NOT NULL DEFAULT '[]'::jsonb,   -- [{row, column, message}]
  uploaded_by   UUID               NOT NULL,
  confirmed_by  UUID,
  confirmed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ        NOT NULL DEFAULT clock_timestamp(),
  updated_at    TIMESTAMPTZ        NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_camp_movement_imports_camp_id UNIQUE (tenant_id, camp_id, id),
  CONSTRAINT chk_camp_movement_imports_rows CHECK (ok_rows + error_rows = total_rows),
  CONSTRAINT chk_camp_movement_imports_confirmed CHECK (
    (status = 'CONFIRMED') = (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)),
  CONSTRAINT fk_camp_movement_imports_camp FOREIGN KEY (tenant_id, camp_id) REFERENCES camps (tenant_id, id),
  CONSTRAINT fk_camp_movement_imports_uploaded_by  FOREIGN KEY (tenant_id, uploaded_by)  REFERENCES core_users (tenant_id, id),
  CONSTRAINT fk_camp_movement_imports_confirmed_by FOREIGN KEY (tenant_id, confirmed_by) REFERENCES core_users (tenant_id, id)
);
CREATE INDEX idx_camp_movement_imports_cursor ON camp_movement_imports (tenant_id, camp_id, created_at DESC, id DESC);

-- ── 3. Ирэх / явах ────────────────────────────────────────────
-- ROSTER ирэлт → {DINNER}, ROSTER явалт → {BREAKFAST}, OFF_ROSTER → сонгосон (эсвэл ээлжийн дүрмээр санал болгосон) хоол
CREATE TABLE camp_movements (
  id              UUID                    PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id       UUID                    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camp_id         UUID                    NOT NULL,
  employee_id     UUID                    NOT NULL,
  movement_date   DATE                    NOT NULL,
  direction       "CampMovementDirection" NOT NULL,
  kind            "CampMovementKind"      NOT NULL,
  meals           "CampMealType"[]        NOT NULL DEFAULT '{}',
  import_id       UUID,
  created_by      UUID,                  -- гараар бүртгэсэн бол; импортынх бол import.uploaded_by
  created_at      TIMESTAMPTZ             NOT NULL DEFAULT clock_timestamp(),
  updated_at      TIMESTAMPTZ             NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_camp_movements_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_camp_movements_unique    UNIQUE (tenant_id, employee_id, movement_date, direction),
  CONSTRAINT chk_camp_movements_meals_nonull CHECK (array_position(meals, NULL) IS NULL),
  CONSTRAINT fk_camp_movements_employee FOREIGN KEY (tenant_id, camp_id, employee_id)
    REFERENCES camp_employees (tenant_id, camp_id, id),
  CONSTRAINT fk_camp_movements_import FOREIGN KEY (tenant_id, camp_id, import_id)
    REFERENCES camp_movement_imports (tenant_id, camp_id, id),
  CONSTRAINT fk_camp_movements_created_by FOREIGN KEY (tenant_id, created_by) REFERENCES core_users (tenant_id, id)
);
CREATE INDEX idx_camp_movements_date   ON camp_movements (tenant_id, camp_id, movement_date);
CREATE INDEX idx_camp_movements_import ON camp_movements (tenant_id, import_id) WHERE import_id IS NOT NULL;

-- ── 4. Кемпэд байх хугацаа — "байгаа эсэх"-ийн цорын ганц эх сурвалж ──
-- Ирэлт → нээнэ (end_date NULL), явалт → хаана.
CREATE TABLE camp_stays (
  id                     UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id              UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camp_id                UUID        NOT NULL,
  employee_id            UUID        NOT NULL,
  arrival_movement_id    UUID        NOT NULL,
  departure_movement_id  UUID,
  start_date             DATE        NOT NULL,
  end_date               DATE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_camp_stays_arrival   UNIQUE (arrival_movement_id),
  CONSTRAINT uq_camp_stays_departure UNIQUE (departure_movement_id),
  CONSTRAINT chk_camp_stays_dates  CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT chk_camp_stays_closed CHECK ((end_date IS NULL) = (departure_movement_id IS NULL)),
  CONSTRAINT fk_camp_stays_employee FOREIGN KEY (tenant_id, camp_id, employee_id)
    REFERENCES camp_employees (tenant_id, camp_id, id),
  CONSTRAINT fk_camp_stays_arrival   FOREIGN KEY (tenant_id, arrival_movement_id)   REFERENCES camp_movements (tenant_id, id),
  CONSTRAINT fk_camp_stays_departure FOREIGN KEY (tenant_id, departure_movement_id) REFERENCES camp_movements (tenant_id, id),
  CONSTRAINT ex_camp_stays_overlap EXCLUDE USING gist (
    employee_id WITH =, daterange(start_date, end_date, '[]') WITH &&)
);
CREATE INDEX idx_camp_stays_presence ON camp_stays (tenant_id, camp_id, start_date, end_date);

-- Stay-ийн movement-ууд зөв чиглэлтэй, тухайн ажилтных, огноо таарсан байх ёстой
CREATE OR REPLACE FUNCTION camp_stays_validate()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  m record;
BEGIN
  SELECT employee_id, movement_date, direction INTO m
    FROM camp_movements WHERE tenant_id = NEW.tenant_id AND id = NEW.arrival_movement_id;
  IF m.direction IS DISTINCT FROM 'ARRIVAL' OR m.employee_id <> NEW.employee_id OR m.movement_date <> NEW.start_date THEN
    RAISE EXCEPTION 'CAMP_STAY_INVALID: ирэлтийн бүртгэл таарахгүй (ARRIVAL, ажилтан, огноо)'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.departure_movement_id IS NOT NULL THEN
    SELECT employee_id, movement_date, direction INTO m
      FROM camp_movements WHERE tenant_id = NEW.tenant_id AND id = NEW.departure_movement_id;
    IF m.direction IS DISTINCT FROM 'DEPARTURE' OR m.employee_id <> NEW.employee_id OR m.movement_date <> NEW.end_date THEN
      RAISE EXCEPTION 'CAMP_STAY_INVALID: явалтын бүртгэл таарахгүй (DEPARTURE, ажилтан, огноо)'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_camp_stays_validate
  BEFORE INSERT OR UPDATE ON camp_stays
  FOR EACH ROW EXECUTE FUNCTION camp_stays_validate();

-- ── 5. Өрөө хуваарилалт (ажилтны үндсэн өрөө; өөр багууд нэг өрөөг хуваалцана) ──
-- Багтаамжийн 28 хоногийн шалгалт → app (Шат 3.5); DB: ажилтан нэг үед нэг л үндсэн өрөөтэй.
CREATE TABLE camp_room_allocations (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camp_id      UUID        NOT NULL,
  room_id      UUID        NOT NULL,
  employee_id  UUID        NOT NULL,
  start_date   DATE        NOT NULL,
  end_date     DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT chk_camp_room_alloc_dates CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT fk_camp_room_alloc_room FOREIGN KEY (tenant_id, camp_id, room_id)
    REFERENCES camp_rooms (tenant_id, camp_id, id),
  CONSTRAINT fk_camp_room_alloc_employee FOREIGN KEY (tenant_id, camp_id, employee_id)
    REFERENCES camp_employees (tenant_id, camp_id, id),
  CONSTRAINT ex_camp_room_alloc_overlap EXCLUDE USING gist (
    employee_id WITH =, daterange(start_date, end_date, '[]') WITH &&)
);
CREATE INDEX idx_camp_room_alloc_room ON camp_room_allocations (tenant_id, room_id, start_date, end_date);

-- ── 6. RLS + GRANT + updated_at ───────────────────────────────
SELECT camp_apply_tenant_rls('camp_shift_adjustments');
SELECT camp_apply_tenant_rls('camp_movement_imports');
SELECT camp_apply_tenant_rls('camp_movements');
SELECT camp_apply_tenant_rls('camp_stays');
SELECT camp_apply_tenant_rls('camp_room_allocations');
