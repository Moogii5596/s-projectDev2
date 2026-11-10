CREATE OR REPLACE FUNCTION core_seed_holiday_calendars(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_prev text := current_setting('app.tenant_id', true);
BEGIN
  PERFORM set_config('app.tenant_id', p_tenant_id::text, true);
  INSERT INTO core_holiday_calendars (tenant_id, code, name, country_code)
  VALUES
    (p_tenant_id, 'MN', 'Монгол Улсын амралтын өдөр', 'MN'),
    (p_tenant_id, 'CN', 'БНХАУ-ын амралтын өдөр', 'CN'),
    (p_tenant_id, 'ORG', 'Байгууллагын календарь', NULL)
  ON CONFLICT (tenant_id, code) DO NOTHING;
  PERFORM set_config('app.tenant_id', COALESCE(v_prev, ''), true);
END;
$$;
REVOKE ALL ON FUNCTION core_seed_holiday_calendars(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core_seed_holiday_calendars(uuid) TO app_user;

CREATE OR REPLACE FUNCTION core_tenants_seed_holiday_calendars()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM core_seed_holiday_calendars(NEW.id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION core_tenants_seed_holiday_calendars() FROM PUBLIC;
CREATE TRIGGER trg_tenants_seed_holiday_calendars
  AFTER INSERT ON tenants
  FOR EACH ROW EXECUTE FUNCTION core_tenants_seed_holiday_calendars();

DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT id FROM tenants LOOP
    PERFORM core_seed_holiday_calendars(t.id);
  END LOOP;
END $$;
