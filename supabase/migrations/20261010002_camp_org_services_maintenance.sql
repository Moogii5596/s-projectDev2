-- ============================================================
-- Camp Module · Шат 4.1 — Байгууллагын үйлчилгээний төрөл, катеринг байгууллага, засварын өрөө түгжих (2026-10-09)
-- ============================================================
-- Хэрэглэгчийн шийдвэр (2026-10-09):
--   1) Байгууллага нэмэхдээ үйлчилгээний төрөл сонгоно (олон байж болно): катеринг, хог/бохир ус тээвэрлэгч,
--      хог/бохир ус хүлээн авах цэг, бусад → `service_types` (is_disposal_point-ийг орлоно; өгөгдөл шилжинэ).
--      Кемпийн тохиргоонд "Катерингийн үйлчилгээ үзүүлэгч байгууллага" (catering_organization_id) — сэлбэгийн зардал үүнд.
--   2) Засварын хүсэлт үүсгэхдээ өрөөг засварт оруулах эсэхийг сонгоно → `blocks_room`.
-- ============================================================

CREATE TYPE "CampOrgServiceType" AS ENUM ('CATERING', 'WASTE_TRANSPORT', 'SEWAGE_TRANSPORT', 'WASTE_DISPOSAL', 'SEWAGE_DISPOSAL', 'OTHER');

-- 1. Байгууллагын үйлчилгээний төрөл
ALTER TABLE camp_organizations
  ADD COLUMN service_types "CampOrgServiceType"[] NOT NULL DEFAULT '{}';
ALTER TABLE camp_organizations
  ADD CONSTRAINT chk_camp_organizations_services_nonull CHECK (array_position(service_types, NULL) IS NULL);
-- өмнөх "нийлүүлэх цэг" → хог + бохир ус хүлээн авах (өгөгдөл алдахгүй)
UPDATE camp_organizations
   SET service_types = ARRAY['WASTE_DISPOSAL', 'SEWAGE_DISPOSAL']::"CampOrgServiceType"[]
 WHERE is_disposal_point;
ALTER TABLE camp_organizations DROP COLUMN is_disposal_point;
CREATE INDEX idx_camp_organizations_services ON camp_organizations USING gin (service_types);

-- 2. Кемпийн катеринг байгууллага (CATERING төрөлтэй эсэхийг app шалгана)
ALTER TABLE camp_settings ADD COLUMN catering_organization_id UUID;
ALTER TABLE camp_settings ADD CONSTRAINT fk_camp_settings_catering_org
  FOREIGN KEY (tenant_id, catering_organization_id) REFERENCES camp_organizations (tenant_id, id);

-- 3. Засвар өрөөг түгжих эсэх (үүсгэхдээ сонгоно)
ALTER TABLE camp_maintenance_requests ADD COLUMN blocks_room BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE camp_maintenance_requests
  ADD CONSTRAINT chk_camp_maintenance_blocks_room CHECK (NOT blocks_room OR room_id IS NOT NULL);

-- 4. Сэлбэгийн хамгаалалт: хүсэлтийн мөрийг FOR SHARE-ээр уншина (Шат 4.4 race засвар).
--    Засвар хаах transaction (status → CLOSED) мөрийг түгжсэн үед зэрэгцээ сэлбэг нэмэх/засах нь commit-ийг хүлээгээд
--    CLOSED-ийг харж татгалзана → хаах үед бичигдсэн зардал сэлбэгийн жагсаалттай ҮРГЭЛЖ таарна.
CREATE OR REPLACE FUNCTION camp_maintenance_parts_protect()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_tenant  uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
  v_status  "CampMaintenanceStatus";
BEGIN
  IF TG_OP = 'DELETE' AND NOT camp_tenant_exists(v_tenant) THEN
    RETURN OLD;   -- tenant устгах CASCADE (D6)
  END IF;
  SELECT status INTO v_status FROM camp_maintenance_requests
   WHERE tenant_id = v_tenant AND id = COALESCE(OLD.request_id, NEW.request_id)
   FOR SHARE;
  IF v_status IN ('CLOSED', 'CANCELLED') THEN
    RAISE EXCEPTION 'CAMP_MAINTENANCE_LOCKED: хаагдсан/цуцлагдсан засварын сэлбэгийг өөрчлөх боломжгүй'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.request_id <> OLD.request_id THEN
    SELECT status INTO v_status FROM camp_maintenance_requests
     WHERE tenant_id = v_tenant AND id = NEW.request_id
     FOR SHARE;
    IF v_status IN ('CLOSED', 'CANCELLED') THEN
      RAISE EXCEPTION 'CAMP_MAINTENANCE_LOCKED: хаагдсан/цуцлагдсан засварт сэлбэг шилжүүлэх боломжгүй'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
