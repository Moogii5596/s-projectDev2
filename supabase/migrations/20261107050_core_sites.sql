CREATE TABLE core_sites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('CAMP', 'OFFICE', 'MINE', 'OTHER')),
  -- Кемпийн кодын дүрэм ([A-Za-z0-9._-], жнь Sino-гийн «01») — trigger кемпийн кодыг хуулдаг тул түүнээс хатуу байж болохгүй (v0.2.4.2)
  code TEXT NOT NULL CHECK (code ~ '^[A-Za-z0-9._-]{1,40}$'),
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_core_sites_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_core_sites_tenant_code UNIQUE (tenant_id, code)
);
SELECT camp_apply_tenant_rls('core_sites');

ALTER TABLE camps ADD COLUMN site_id UUID;

INSERT INTO core_sites (tenant_id, type, code, name, is_active)
SELECT tenant_id, 'CAMP', code, name, is_active
FROM camps;

UPDATE camps AS c
SET site_id = s.id
FROM core_sites AS s
WHERE s.tenant_id = c.tenant_id
  AND s.type = 'CAMP'
  AND s.code = c.code;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM camps WHERE site_id IS NULL) THEN
    RAISE EXCEPTION 'CAMP_SITE_BACKFILL_FAILED';
  END IF;
END;
$$;

ALTER TABLE camps
  ADD CONSTRAINT fk_camps_site FOREIGN KEY (tenant_id, site_id)
    REFERENCES core_sites (tenant_id, id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT uq_camps_tenant_site UNIQUE (tenant_id, site_id);

CREATE OR REPLACE FUNCTION camps_sync_core_site()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.site_id IS NULL THEN
    INSERT INTO core_sites (tenant_id, type, code, name, is_active)
    VALUES (NEW.tenant_id, 'CAMP', NEW.code, NEW.name, NEW.is_active)
    RETURNING id INTO NEW.site_id;
  ELSE
    UPDATE core_sites
       SET code = NEW.code, name = NEW.name, is_active = NEW.is_active
     WHERE tenant_id = NEW.tenant_id AND id = NEW.site_id AND type = 'CAMP';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CAMP_SITE_LINK: site_id must reference a CAMP site';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_camps_sync_core_site
  BEFORE INSERT OR UPDATE OF site_id, code, name, is_active ON camps
  FOR EACH ROW EXECUTE FUNCTION camps_sync_core_site();
