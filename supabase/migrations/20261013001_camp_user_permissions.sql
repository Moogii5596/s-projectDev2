-- ============================================================
-- v0.2.2 Блок 1 — Хэрэглэгчийн эцсийн эрх (ADR-003 §2.4, D-01, D-09) (2026-10-12)
-- ============================================================
-- Tech plan: docs/08_Roadmap/V.0.2/07_v0.2.2_tech_plan.md §3.1
--
-- D-01: camp_user_permissions = эрхийн ГАНЦ эх сурвалж (guard зөвхөн үүнийг уншина).
-- D-09: camp_user_roles = "загвар олгосон бүртгэл" (устгахгүй).
--       TEMPLATE мөр бүр user_role_id-аар олголтдоо холбогдоно → олголт устахад CASCADE.
--       camp_user_roles-д мөр нэмэгдэхэд trigger загварын эрхийг ХУУЛНА (pilot.ps1 user-ийн raw SQL ч хамрагдана).
--       Загвар (camp_role_permissions) өөрчлөгдөхөд хэрэглэгч рүү АВТОМАТААР тархахгүй — app-ийн "хэрэгжүүлэх" алхам.
-- Нэг эрх олон эх сурвалжаас ирж болно (2 роль, эсвэл роль + шууд) → мөр бүр нэг эх сурвалж; guard DISTINCT.
--
-- Rollback (код v0.2.1 руу буцсаны дараа):
--   DROP TRIGGER trg_camp_user_roles_apply_template ON camp_user_roles;
--   DROP FUNCTION camp_user_roles_apply_template();
--   DROP TABLE camp_user_permissions; DROP TYPE "CampPermissionSource";
--   ALTER TABLE camp_user_roles DROP CONSTRAINT uq_camp_user_roles_tenant_id;
-- ============================================================

CREATE TYPE "CampPermissionSource" AS ENUM ('TEMPLATE', 'DIRECT');

-- D2: олголт руу (tenant_id, id)-аар лавлах
ALTER TABLE camp_user_roles ADD CONSTRAINT uq_camp_user_roles_tenant_id UNIQUE (tenant_id, id);

CREATE TABLE camp_user_permissions (
  id               UUID                   PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id        UUID                   NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id          UUID                   NOT NULL,   -- core_users.id (RULE-13)
  permission_code  TEXT                   NOT NULL REFERENCES camp_permissions(code),
  camp_id          UUID,                              -- NULL = бүх кемп
  source           "CampPermissionSource" NOT NULL,
  user_role_id     UUID,                              -- TEMPLATE: аль олголтоос
  created_by       UUID,                              -- DIRECT: хэн олгосон (core_users.id)
  created_at       TIMESTAMPTZ            NOT NULL DEFAULT clock_timestamp(),
  updated_at       TIMESTAMPTZ            NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fk_camp_user_permissions_user FOREIGN KEY (tenant_id, user_id)
    REFERENCES core_users (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_camp_user_permissions_camp FOREIGN KEY (tenant_id, camp_id)
    REFERENCES camps (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_camp_user_permissions_user_role FOREIGN KEY (tenant_id, user_role_id)
    REFERENCES camp_user_roles (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT ck_camp_user_permissions_source
    CHECK ((source = 'TEMPLATE') = (user_role_id IS NOT NULL))
);
-- Нэг эх сурвалжаас нэг эрх нэг л удаа (DIRECT: user_role_id NULL → NULLS NOT DISTINCT)
CREATE UNIQUE INDEX uq_camp_user_permissions
  ON camp_user_permissions (tenant_id, user_id, permission_code, camp_id, user_role_id) NULLS NOT DISTINCT;
CREATE INDEX idx_camp_user_permissions_user ON camp_user_permissions (tenant_id, user_id);
CREATE INDEX idx_camp_user_permissions_user_role ON camp_user_permissions (user_role_id);

SELECT camp_apply_tenant_rls('camp_user_permissions');

-- ── Олголт → загвар хуулах (D-09) ─────────────────────────────
-- SECURITY INVOKER: app_user-ийн RLS (app.tenant_id) хэвээр үйлчилнэ.
CREATE OR REPLACE FUNCTION camp_user_roles_apply_template()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.role_id IS NOT DISTINCT FROM OLD.role_id AND NEW.camp_id IS NOT DISTINCT FROM OLD.camp_id
       AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id THEN
      RETURN NEW;
    END IF;
    DELETE FROM camp_user_permissions WHERE tenant_id = OLD.tenant_id AND user_role_id = OLD.id;
  END IF;
  INSERT INTO camp_user_permissions (tenant_id, user_id, permission_code, camp_id, source, user_role_id)
  SELECT NEW.tenant_id, NEW.user_id, rp.permission_code, NEW.camp_id, 'TEMPLATE', NEW.id
  FROM camp_role_permissions rp
  WHERE rp.tenant_id = NEW.tenant_id AND rp.role_id = NEW.role_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_camp_user_roles_apply_template
  AFTER INSERT OR UPDATE ON camp_user_roles
  FOR EACH ROW EXECUTE FUNCTION camp_user_roles_apply_template();

-- ── Backfill: одоогийн эрх яг хэвээр (A = B, tech plan §5.1) ──
INSERT INTO camp_user_permissions (tenant_id, user_id, permission_code, camp_id, source, user_role_id)
SELECT ur.tenant_id, ur.user_id, rp.permission_code, ur.camp_id, 'TEMPLATE', ur.id
FROM camp_user_roles ur
JOIN camp_role_permissions rp ON rp.tenant_id = ur.tenant_id AND rp.role_id = ur.role_id;
