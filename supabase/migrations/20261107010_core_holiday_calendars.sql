CREATE TABLE core_holiday_calendars (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{0,39}$'),
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  country_code TEXT CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_core_holiday_calendars_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_core_holiday_calendars_code UNIQUE (tenant_id, code)
);
SELECT camp_apply_tenant_rls('core_holiday_calendars');

CREATE TABLE core_calendar_holidays (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  calendar_id UUID NOT NULL,
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  recurrence TEXT NOT NULL CHECK (recurrence IN ('ONCE', 'ANNUAL')),
  holiday_date DATE,
  month SMALLINT,
  day SMALLINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_core_calendar_holidays_recurrence CHECK (
    (recurrence = 'ONCE' AND holiday_date IS NOT NULL AND month IS NULL AND day IS NULL)
    OR (recurrence = 'ANNUAL' AND holiday_date IS NULL AND month BETWEEN 1 AND 12 AND day BETWEEN 1 AND 31)
  ),
  CONSTRAINT fk_core_calendar_holidays_calendar FOREIGN KEY (tenant_id, calendar_id)
    REFERENCES core_holiday_calendars (tenant_id, id) ON DELETE CASCADE
);
SELECT camp_apply_tenant_rls('core_calendar_holidays');
CREATE INDEX idx_core_calendar_holidays_date ON core_calendar_holidays (tenant_id, calendar_id, holiday_date);
