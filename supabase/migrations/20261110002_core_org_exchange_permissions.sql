INSERT INTO core_permissions (code, name, sort_order, module, available_in) VALUES
  ('core.organization.manage', 'Байгууллага удирдах', 180, 'core', 'v1'),
  ('core.exchange_rate.manage', 'Валют, ханш удирдах', 190, 'core', 'v1');

CREATE OR REPLACE FUNCTION core_seed_shared_permissions(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_prev text := current_setting('app.tenant_id', true);
BEGIN
  PERFORM set_config('app.tenant_id', p_tenant_id::text, true);

  INSERT INTO core_role_permissions (tenant_id, role_id, permission_code)
  SELECT tenant_id, role_id,
         CASE permission_code
           WHEN 'camp.master.manage' THEN 'core.organization.manage'
           WHEN 'camp.contract.manage' THEN 'core.exchange_rate.manage'
         END
  FROM core_role_permissions
  WHERE tenant_id = p_tenant_id
    AND permission_code IN ('camp.master.manage', 'camp.contract.manage')
  ON CONFLICT DO NOTHING;

  INSERT INTO core_user_permissions (tenant_id, user_id, permission_code, site_id, source, user_role_id)
  SELECT tenant_id, user_id,
         CASE permission_code
           WHEN 'camp.master.manage' THEN 'core.organization.manage'
           WHEN 'camp.contract.manage' THEN 'core.exchange_rate.manage'
         END,
         site_id, source, user_role_id
  FROM core_user_permissions
  WHERE tenant_id = p_tenant_id
    AND permission_code IN ('camp.master.manage', 'camp.contract.manage')
  ON CONFLICT DO NOTHING;

  PERFORM set_config('app.tenant_id', COALESCE(v_prev, ''), true);
END;
$$;
REVOKE ALL ON FUNCTION core_seed_shared_permissions(uuid) FROM PUBLIC;

SELECT core_seed_shared_permissions(id) FROM tenants;

CREATE OR REPLACE FUNCTION core_tenants_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM core_seed_default_roles(NEW.id);
  PERFORM core_seed_shared_permissions(NEW.id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION core_tenants_after_insert() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (
    SELECT tenant_id, role_id, CASE permission_code
      WHEN 'camp.master.manage' THEN 'core.organization.manage'
      ELSE 'core.exchange_rate.manage'
    END
    FROM core_role_permissions
    WHERE permission_code IN ('camp.master.manage', 'camp.contract.manage')
    EXCEPT
    SELECT tenant_id, role_id, permission_code
    FROM core_role_permissions
    WHERE permission_code IN ('core.organization.manage', 'core.exchange_rate.manage')
  ) OR EXISTS (
    SELECT tenant_id, role_id, permission_code
    FROM core_role_permissions
    WHERE permission_code IN ('core.organization.manage', 'core.exchange_rate.manage')
    EXCEPT
    SELECT tenant_id, role_id, CASE permission_code
      WHEN 'camp.master.manage' THEN 'core.organization.manage'
      ELSE 'core.exchange_rate.manage'
    END
    FROM core_role_permissions
    WHERE permission_code IN ('camp.master.manage', 'camp.contract.manage')
  ) THEN
    RAISE EXCEPTION 'CORE_PERMISSION_MIGRATION: role grants do not map 1:1';
  END IF;

  IF EXISTS (
    SELECT tenant_id, user_id, CASE permission_code
      WHEN 'camp.master.manage' THEN 'core.organization.manage'
      ELSE 'core.exchange_rate.manage'
    END, site_id, source, user_role_id
    FROM core_user_permissions
    WHERE permission_code IN ('camp.master.manage', 'camp.contract.manage')
    EXCEPT
    SELECT tenant_id, user_id, permission_code, site_id, source, user_role_id
    FROM core_user_permissions
    WHERE permission_code IN ('core.organization.manage', 'core.exchange_rate.manage')
  ) OR EXISTS (
    SELECT tenant_id, user_id, permission_code, site_id, source, user_role_id
    FROM core_user_permissions
    WHERE permission_code IN ('core.organization.manage', 'core.exchange_rate.manage')
    EXCEPT
    SELECT tenant_id, user_id, CASE permission_code
      WHEN 'camp.master.manage' THEN 'core.organization.manage'
      ELSE 'core.exchange_rate.manage'
    END, site_id, source, user_role_id
    FROM core_user_permissions
    WHERE permission_code IN ('camp.master.manage', 'camp.contract.manage')
  ) THEN
    RAISE EXCEPTION 'CORE_PERMISSION_MIGRATION: user grants do not map 1:1';
  END IF;
END $$;
