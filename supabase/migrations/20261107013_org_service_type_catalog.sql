CREATE TABLE camp_organization_service_types (
  tenant_id      UUID NOT NULL,
  organization_id UUID NOT NULL,
  service_type_id UUID NOT NULL,
  PRIMARY KEY (tenant_id, organization_id, service_type_id),
  CONSTRAINT fk_camp_org_service_types_org
    FOREIGN KEY (tenant_id, organization_id) REFERENCES camp_organizations (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_camp_org_service_types_type
    FOREIGN KEY (tenant_id, service_type_id) REFERENCES camp_service_types (tenant_id, id) ON DELETE NO ACTION
);
CREATE INDEX idx_camp_org_service_types_type
  ON camp_organization_service_types (tenant_id, service_type_id, organization_id);
SELECT camp_apply_tenant_rls('camp_organization_service_types');

CREATE OR REPLACE FUNCTION camp_seed_org_service_catalog(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_prev text := current_setting('app.tenant_id', true);
BEGIN
  PERFORM camp_seed_contract_catalog(p_tenant_id);
  PERFORM set_config('app.tenant_id', p_tenant_id::text, true);
  INSERT INTO camp_service_types (tenant_id, code, name_mn, name_en, name_zh, quantity_source, default_unit_id, sort_order)
  SELECT p_tenant_id, 'CATERING', 'Катеринг', 'Catering', '餐饮服务', 'MEAL_ORDER', u.id, 15
    FROM core_units u
   WHERE u.tenant_id = p_tenant_id AND u.code = 'PERSON_DAY'
  ON CONFLICT (tenant_id, code) DO NOTHING;
  PERFORM set_config('app.tenant_id', COALESCE(v_prev, ''), true);
END;
$$;
REVOKE ALL ON FUNCTION camp_seed_org_service_catalog(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION camp_seed_org_service_catalog(uuid) TO app_user;

CREATE OR REPLACE FUNCTION camp_tenants_seed_org_service_catalog()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM camp_seed_org_service_catalog(NEW.id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION camp_tenants_seed_org_service_catalog() FROM PUBLIC;
CREATE TRIGGER trg_tenants_seed_org_service_catalog
  AFTER INSERT ON tenants
  FOR EACH ROW EXECUTE FUNCTION camp_tenants_seed_org_service_catalog();

DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT id FROM tenants LOOP
    PERFORM camp_seed_org_service_catalog(t.id);
  END LOOP;
END $$;

INSERT INTO camp_organization_service_types (tenant_id, organization_id, service_type_id)
SELECT o.tenant_id, o.id, st.id
  FROM camp_organizations o
  CROSS JOIN LATERAL unnest(o.service_types) AS org_service(code)
  JOIN camp_service_types st
    ON st.tenant_id = o.tenant_id
   AND st.code = org_service.code::text;

DROP INDEX idx_camp_organizations_services;
ALTER TABLE camp_organizations DROP CONSTRAINT chk_camp_organizations_services_nonull;
ALTER TABLE camp_organizations DROP COLUMN service_types;
DROP TYPE "CampOrgServiceType";
