-- ============================================================
-- Camp Module · Шат 1.2 — Тохиргоо ба мастер өгөгдөл (2026-10-09)
-- ============================================================
-- camps, camp_settings, camp_meal_locations, camp_departments, camp_department_shift_patterns,
-- camp_buildings, camp_rooms, camp_organizations, camp_crews, camp_employees
-- D2: кемп доторх холбоос → (tenant_id, camp_id, x_id) composite FK — өөр кемпийн байршил/байр/хэлтэс сонгох боломжгүй.
-- ============================================================

CREATE TYPE "CampShiftType"      AS ENUM ('DAY', 'NIGHT');
CREATE TYPE "CampRoomStatus"     AS ENUM ('ACTIVE', 'MAINTENANCE', 'INACTIVE');
CREATE TYPE "CampOrgType"        AS ENUM ('MAIN', 'SUBCONTRACTOR', 'CONTRACTOR');
CREATE TYPE "CampEmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- ── 1. Кемп ───────────────────────────────────────────────────
CREATE TABLE camps (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code        TEXT        NOT NULL CHECK (btrim(code) <> ''),
  name        TEXT        NOT NULL CHECK (btrim(name) <> ''),
  location    TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_camps_tenant_id   UNIQUE (tenant_id, id),
  CONSTRAINT uq_camps_tenant_code UNIQUE (tenant_id, code)
);

-- 1.1-ийн camp_user_roles.camp_id FK
ALTER TABLE camp_user_roles ADD CONSTRAINT fk_camp_user_roles_camp
  FOREIGN KEY (tenant_id, camp_id) REFERENCES camps (tenant_id, id) ON DELETE CASCADE;

-- ── 2. Хоол идэх байршил ─────────────────────────────────────
CREATE TABLE camp_meal_locations (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camp_id     UUID        NOT NULL,
  name        TEXT        NOT NULL CHECK (btrim(name) <> ''),
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_camp_meal_locations_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_camp_meal_locations_camp_id   UNIQUE (tenant_id, camp_id, id),
  CONSTRAINT uq_camp_meal_locations_name      UNIQUE (tenant_id, camp_id, name),
  CONSTRAINT fk_camp_meal_locations_camp FOREIGN KEY (tenant_id, camp_id) REFERENCES camps (tenant_id, id)
);

-- ── 3. Кемпийн тохиргоо (1:1) ─────────────────────────────────
CREATE TABLE camp_settings (
  id                        UUID         PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id                 UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camp_id                   UUID         NOT NULL,
  vat_rate                  NUMERIC(5,2) NOT NULL DEFAULT 10 CHECK (vat_rate >= 0 AND vat_rate < 100),
  changeover_weekday        SMALLINT     NOT NULL DEFAULT 3 CHECK (changeover_weekday BETWEEN 0 AND 6), -- EXTRACT(DOW): 0=Ням, 3=Лхагва
  roster_on_days            SMALLINT     NOT NULL DEFAULT 14 CHECK (roster_on_days BETWEEN 1 AND 28),
  roster_off_days           SMALLINT     NOT NULL DEFAULT 14 CHECK (roster_off_days BETWEEN 0 AND 28),
  meal_order_cutoff_time    TIME,                       -- маргаашийн захиалгын хаалтын цаг (NULL = хязгааргүй)
  default_meal_location_id  UUID,                       -- кемп гал тогоо (өглөө/орой, ажлын бус хоол)
  created_at                TIMESTAMPTZ  NOT NULL DEFAULT clock_timestamp(),
  updated_at                TIMESTAMPTZ  NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_camp_settings_camp UNIQUE (tenant_id, camp_id),
  CONSTRAINT fk_camp_settings_camp FOREIGN KEY (tenant_id, camp_id) REFERENCES camps (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_camp_settings_default_location FOREIGN KEY (tenant_id, camp_id, default_meal_location_id)
    REFERENCES camp_meal_locations (tenant_id, camp_id, id)
);

-- ── 4. Хэлтэс + ээлжийн загвар ────────────────────────────────
CREATE TABLE camp_departments (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camp_id           UUID        NOT NULL,
  code              TEXT        NOT NULL CHECK (btrim(code) <> ''),
  name              TEXT        NOT NULL CHECK (btrim(name) <> ''),
  meal_location_id  UUID        NOT NULL,   -- ажлын хоол (өдөр/шөнө) идэх байршил
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_camp_departments_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_camp_departments_camp_id   UNIQUE (tenant_id, camp_id, id),
  CONSTRAINT uq_camp_departments_code      UNIQUE (tenant_id, camp_id, code),
  CONSTRAINT fk_camp_departments_camp FOREIGN KEY (tenant_id, camp_id) REFERENCES camps (tenant_id, id),
  CONSTRAINT fk_camp_departments_location FOREIGN KEY (tenant_id, camp_id, meal_location_id)
    REFERENCES camp_meal_locations (tenant_id, camp_id, id)
);
CREATE INDEX idx_camp_departments_location ON camp_departments (tenant_id, meal_location_id);

-- Ээлжийн өдрийн дугаар: багийн ирсэн өдөр = 0, дараагийн өдөр = 1 … явах өдөр = roster_on_days.
-- DB: муж зөв + давхцалгүй (EXCLUDE). "1..roster_on_days-ийг цоорхойгүй бүрхэх" → app хадгалахад шалгана (Шат 2.4).
CREATE TABLE camp_department_shift_patterns (
  id             UUID            PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id      UUID            NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  department_id  UUID            NOT NULL,
  day_from       SMALLINT        NOT NULL,
  day_to         SMALLINT        NOT NULL,
  shift          "CampShiftType" NOT NULL,
  created_at     TIMESTAMPTZ     NOT NULL DEFAULT clock_timestamp(),
  updated_at     TIMESTAMPTZ     NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT chk_camp_shift_patterns_range CHECK (day_from >= 1 AND day_to >= day_from AND day_to <= 28),
  CONSTRAINT fk_camp_shift_patterns_department FOREIGN KEY (tenant_id, department_id)
    REFERENCES camp_departments (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT ex_camp_shift_patterns_overlap EXCLUDE USING gist (
    department_id WITH =, int4range(day_from, day_to, '[]') WITH &&)
);
CREATE INDEX idx_camp_shift_patterns_department ON camp_department_shift_patterns (tenant_id, department_id, day_from);

-- ── 5. Байр, өрөө ─────────────────────────────────────────────
CREATE TABLE camp_buildings (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camp_id     UUID        NOT NULL,
  code        TEXT        NOT NULL CHECK (btrim(code) <> ''),
  name        TEXT        NOT NULL CHECK (btrim(name) <> ''),
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_camp_buildings_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_camp_buildings_camp_id   UNIQUE (tenant_id, camp_id, id),
  CONSTRAINT uq_camp_buildings_code      UNIQUE (tenant_id, camp_id, code),
  CONSTRAINT fk_camp_buildings_camp FOREIGN KEY (tenant_id, camp_id) REFERENCES camps (tenant_id, id)
);

-- Дүүргэлт (VACANT/PARTIAL/FULL) хадгалахгүй — хуваарилалт × байгаа эсэхээс тооцоолно (Шат 3.5)
CREATE TABLE camp_rooms (
  id           UUID             PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id    UUID             NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camp_id      UUID             NOT NULL,
  building_id  UUID             NOT NULL,
  room_no      TEXT             NOT NULL CHECK (btrim(room_no) <> ''),
  floor        SMALLINT,
  capacity     SMALLINT         NOT NULL CHECK (capacity > 0),
  status       "CampRoomStatus" NOT NULL DEFAULT 'ACTIVE',
  note         TEXT,
  created_at   TIMESTAMPTZ      NOT NULL DEFAULT clock_timestamp(),
  updated_at   TIMESTAMPTZ      NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_camp_rooms_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_camp_rooms_camp_id   UNIQUE (tenant_id, camp_id, id),
  CONSTRAINT uq_camp_rooms_no        UNIQUE (tenant_id, building_id, room_no),
  CONSTRAINT fk_camp_rooms_building FOREIGN KEY (tenant_id, camp_id, building_id)
    REFERENCES camp_buildings (tenant_id, camp_id, id)
);
CREATE INDEX idx_camp_rooms_camp ON camp_rooms (tenant_id, camp_id, status);

-- ── 6. Байгууллага (tenant түвшин — олон кемпэд үйлчилж болно) ─
CREATE TABLE camp_organizations (
  id                 UUID          PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id          UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name               TEXT          NOT NULL CHECK (btrim(name) <> ''),
  reg_number         TEXT,
  org_type           "CampOrgType" NOT NULL,
  is_disposal_point  BOOLEAN       NOT NULL DEFAULT false,   -- бохир ус/хог нийлүүлэх цэг
  contact_name       TEXT,
  phone              TEXT,
  email              TEXT,
  is_active          BOOLEAN       NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT clock_timestamp(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_camp_organizations_tenant_id UNIQUE (tenant_id, id)
);
CREATE UNIQUE INDEX uq_camp_organizations_reg ON camp_organizations (tenant_id, reg_number) WHERE reg_number IS NOT NULL;
CREATE INDEX idx_camp_organizations_list ON camp_organizations (tenant_id, is_active, name);

-- ── 7. Баг (ростер) ───────────────────────────────────────────
CREATE TABLE camp_crews (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id           UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camp_id             UUID        NOT NULL,
  code                TEXT        NOT NULL CHECK (btrim(code) <> ''),   -- A / B / C / D
  name                TEXT,
  roster_anchor_date  DATE        NOT NULL,   -- энэ багийн ирэх нэг өдөр (солигдох гараг) — мөчлөгийн эхлэл
  is_active           BOOLEAN     NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_camp_crews_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_camp_crews_camp_id   UNIQUE (tenant_id, camp_id, id),
  CONSTRAINT uq_camp_crews_code      UNIQUE (tenant_id, camp_id, code),
  CONSTRAINT fk_camp_crews_camp FOREIGN KEY (tenant_id, camp_id) REFERENCES camps (tenant_id, id)
);

-- ── 8. Ажилтан ────────────────────────────────────────────────
CREATE TABLE camp_employees (
  id               UUID                 PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id        UUID                 NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camp_id          UUID                 NOT NULL,
  organization_id  UUID                 NOT NULL,
  department_id    UUID                 NOT NULL,
  crew_id          UUID,                               -- NULL = ростергүй (ээлжийн бус)
  employee_code    TEXT                 NOT NULL CHECK (btrim(employee_code) <> ''),   -- xlsx импортын түлхүүр
  full_name        TEXT                 NOT NULL CHECK (btrim(full_name) <> ''),
  position         TEXT,
  phone            TEXT,
  status           "CampEmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
  created_at       TIMESTAMPTZ          NOT NULL DEFAULT clock_timestamp(),
  updated_at       TIMESTAMPTZ          NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_camp_employees_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_camp_employees_camp_id   UNIQUE (tenant_id, camp_id, id),
  CONSTRAINT uq_camp_employees_code      UNIQUE (tenant_id, employee_code),
  CONSTRAINT fk_camp_employees_camp FOREIGN KEY (tenant_id, camp_id) REFERENCES camps (tenant_id, id),
  CONSTRAINT fk_camp_employees_org  FOREIGN KEY (tenant_id, organization_id) REFERENCES camp_organizations (tenant_id, id),
  CONSTRAINT fk_camp_employees_department FOREIGN KEY (tenant_id, camp_id, department_id)
    REFERENCES camp_departments (tenant_id, camp_id, id),
  CONSTRAINT fk_camp_employees_crew FOREIGN KEY (tenant_id, camp_id, crew_id)
    REFERENCES camp_crews (tenant_id, camp_id, id)
);
CREATE INDEX idx_camp_employees_cursor     ON camp_employees (tenant_id, created_at DESC, id DESC);
CREATE INDEX idx_camp_employees_department ON camp_employees (tenant_id, department_id);
CREATE INDEX idx_camp_employees_crew       ON camp_employees (tenant_id, crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX idx_camp_employees_org        ON camp_employees (tenant_id, organization_id);

-- ── 9. RLS + GRANT + updated_at ───────────────────────────────
SELECT camp_apply_tenant_rls('camps');
SELECT camp_apply_tenant_rls('camp_meal_locations');
SELECT camp_apply_tenant_rls('camp_settings');
SELECT camp_apply_tenant_rls('camp_departments');
SELECT camp_apply_tenant_rls('camp_department_shift_patterns');
SELECT camp_apply_tenant_rls('camp_buildings');
SELECT camp_apply_tenant_rls('camp_rooms');
SELECT camp_apply_tenant_rls('camp_organizations');
SELECT camp_apply_tenant_rls('camp_crews');
SELECT camp_apply_tenant_rls('camp_employees');
