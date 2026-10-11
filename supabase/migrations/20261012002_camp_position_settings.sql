-- ============================================================
-- v0.2.1 (C-01, C-04) — Кемп × албан тушаалын АНХДАГЧ утга (2026-10-11 Q1, Д-1, Д-2)
-- ============================================================
-- Ажилтны утга (camp_employees.meal_location_id / meals_included) байвал тэр нь ЭЦСИЙН; байхгүй бол эндээс;
-- энд ч байхгүй бол: хоолны байршил = кемпийн анхдагч, хоол авах = тийм, ээлжийн загвар = хэлтсийнх (шилжилтийн үед).
-- Зөвхөн НЭМЭЛТ.
-- ============================================================

CREATE TABLE camp_position_settings (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camp_id           UUID        NOT NULL,
  position_id       UUID        NOT NULL,
  meal_location_id  UUID,                    -- NULL = кемпийн анхдагч
  meals_included    BOOLEAN,                 -- NULL = тийм
  created_at        TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_camp_position_settings_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_camp_position_settings_camp_position UNIQUE (tenant_id, camp_id, position_id),
  CONSTRAINT fk_camp_position_settings_camp FOREIGN KEY (tenant_id, camp_id) REFERENCES camps (tenant_id, id),
  CONSTRAINT fk_camp_position_settings_position FOREIGN KEY (tenant_id, position_id)
    REFERENCES camp_positions (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_camp_position_settings_location FOREIGN KEY (tenant_id, camp_id, meal_location_id)
    REFERENCES camp_meal_locations (tenant_id, camp_id, id)
);
SELECT camp_apply_tenant_rls('camp_position_settings');

-- Ээлжийн загвар (хэлтсийнхтэй ижил бүтэц) — байхгүй бол хэлтсийн загвар (Д-1)
CREATE TABLE camp_position_shift_patterns (
  id                   UUID            PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id            UUID            NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  position_setting_id  UUID            NOT NULL,
  day_from             SMALLINT        NOT NULL,
  day_to               SMALLINT        NOT NULL,
  shift                "CampShiftType" NOT NULL,
  created_at           TIMESTAMPTZ     NOT NULL DEFAULT clock_timestamp(),
  updated_at           TIMESTAMPTZ     NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT chk_camp_position_shift_patterns_range CHECK (day_from >= 1 AND day_to >= day_from AND day_to <= 28),
  CONSTRAINT fk_camp_position_shift_patterns_setting FOREIGN KEY (tenant_id, position_setting_id)
    REFERENCES camp_position_settings (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT ex_camp_position_shift_patterns_overlap EXCLUDE USING gist (
    position_setting_id WITH =, int4range(day_from, day_to, '[]') WITH &&)
);
CREATE INDEX idx_camp_position_shift_patterns_setting ON camp_position_shift_patterns (tenant_id, position_setting_id, day_from);
SELECT camp_apply_tenant_rls('camp_position_shift_patterns');
