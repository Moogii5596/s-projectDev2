-- ============================================================
-- v0.2.3 Блок 2 — ADR-007: роль, эрх системийн түвшинд (camp_* → core_*) (2026-11-06)
-- ============================================================
-- ADR: docs/02_System_Architecture/ADR-007_System_Roles_Permissions.md · PIL-13
-- Tech plan: docs/08_Roadmap/V.0.2/09_v0.2.3_tech_plan.md Блок 2 (B2-1…B2-6)
--
-- Арга: хүснэгтийг БАЙРАНД НЬ нэрлэнэ (ID, FK, RLS, өгөгдөл хэвээр — хуулахгүй).
--   0. legacy_camp_* — migration-ийн өмнөх төлвийн хөлдөөсөн хуулбар (B2-1, зөвхөн SELECT, v0.2.4-т устгана)
--   1. camp_* → core_* (+ constraint / index / policy / trigger нэр), camp_id → site_id, scope_type (generated)
--   2. core_permissions: module, available_in; кодын mapping (B2-3); camp.roles.manage устгах (Q-R3)
--   3. core_permission_aliases (B2-6)
--   4. core_roles.system_code → TEXT (B2-5)
--   5. Функц / trigger шинэчлэх
--   6. Шалгалт: legacy ↔ core мөрийн тоо (зөрвөл RAISE → бүх migration буцна)
--
-- Rollback: DB-г migration-ийн өмнөх нөөцөөс сэргээнэ (pilot.ps1 snapshot) — ADR-007 §7.
-- ============================================================

-- ── 0. Хөлдөөсөн хуулбар (өмнөх төлөв, хуучин код) ───────────────
CREATE TABLE legacy_camp_permissions           AS TABLE camp_permissions;
CREATE TABLE legacy_camp_roles                 AS TABLE camp_roles;
CREATE TABLE legacy_camp_role_permissions      AS TABLE camp_role_permissions;
CREATE TABLE legacy_camp_user_roles            AS TABLE camp_user_roles;
CREATE TABLE legacy_camp_user_permissions      AS TABLE camp_user_permissions;
CREATE TABLE legacy_camp_position_role_templates AS TABLE camp_position_role_templates;

DO $$
DECLARE t text;
BEGIN
  -- tenant-тэй хуулбар: RLS (зөвхөн SELECT policy), app_user-д зөвхөн SELECT
  FOR t IN SELECT unnest(ARRAY['legacy_camp_roles','legacy_camp_role_permissions','legacy_camp_user_roles',
                               'legacy_camp_user_permissions','legacy_camp_position_role_templates'])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I AS PERMISSIVE FOR SELECT TO app_user '
      'USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      'tenant_read_' || t, t);
    EXECUTE format('GRANT SELECT ON %I TO app_user', t);
    EXECUTE format('COMMENT ON TABLE %I IS %L', t,
      'ADR-007 (v0.2.3): 20261106005-ийн өмнөх хөлдөөсөн хуулбар. Зөвхөн унших. v0.2.4-т устгана.');
  END LOOP;
  EXECUTE 'GRANT SELECT ON legacy_camp_permissions TO app_user';
  EXECUTE format('COMMENT ON TABLE legacy_camp_permissions IS %L',
    'ADR-007 (v0.2.3): 20261106005-ийн өмнөх хөлдөөсөн хуулбар. Зөвхөн унших. v0.2.4-т устгана.');
END $$;

-- ── 1. Нэрлэх ─────────────────────────────────────────────────
ALTER TABLE camp_permissions RENAME TO core_permissions;
ALTER TABLE camp_roles RENAME TO core_roles;
ALTER TABLE camp_role_permissions RENAME TO core_role_permissions;
ALTER TABLE camp_user_roles RENAME TO core_user_roles;
ALTER TABLE camp_user_permissions RENAME TO core_user_permissions;
ALTER TABLE camp_position_role_templates RENAME TO core_position_role_templates;

-- Constraint / index / policy / trigger-ийн нэр дэх хуучин хүснэгтийн нэрийг солих
DO $$
DECLARE
  m   record;
  r   record;
  v_new text;
BEGIN
  FOR m IN SELECT * FROM (VALUES
    ('camp_permissions', 'core_permissions'),
    ('camp_roles', 'core_roles'),
    ('camp_role_permissions', 'core_role_permissions'),
    ('camp_user_roles', 'core_user_roles'),
    ('camp_user_permissions', 'core_user_permissions'),
    ('camp_position_role_templates', 'core_position_role_templates')
  ) AS x(old_name, new_name)
  LOOP
    FOR r IN SELECT conname FROM pg_constraint
             WHERE conrelid = m.new_name::regclass AND conname LIKE '%' || m.old_name || '%'
    LOOP
      v_new := replace(r.conname, m.old_name, m.new_name);
      EXECUTE format('ALTER TABLE %I RENAME CONSTRAINT %I TO %I', m.new_name, r.conname, v_new);
    END LOOP;
    FOR r IN SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
             WHERE i.indrelid = m.new_name::regclass AND c.relname LIKE '%' || m.old_name || '%'
               AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conindid = i.indexrelid)
    LOOP
      EXECUTE format('ALTER INDEX %I RENAME TO %I', r.relname, replace(r.relname, m.old_name, m.new_name));
    END LOOP;
    FOR r IN SELECT polname FROM pg_policy
             WHERE polrelid = m.new_name::regclass AND polname LIKE '%' || m.old_name || '%'
    LOOP
      EXECUTE format('ALTER POLICY %I ON %I RENAME TO %I', r.polname, m.new_name, replace(r.polname, m.old_name, m.new_name));
    END LOOP;
    FOR r IN SELECT tgname FROM pg_trigger
             WHERE tgrelid = m.new_name::regclass AND NOT tgisinternal AND tgname LIKE '%' || m.old_name || '%'
    LOOP
      EXECUTE format('ALTER TRIGGER %I ON %I RENAME TO %I', r.tgname, m.new_name, replace(r.tgname, m.old_name, m.new_name));
    END LOOP;
  END LOOP;
END $$;

-- Хүрээ: camp_id → site_id (B2-5). NULL = tenant даяар.
ALTER TABLE core_user_roles RENAME COLUMN camp_id TO site_id;
ALTER TABLE core_user_permissions RENAME COLUMN camp_id TO site_id;
ALTER TABLE core_user_roles RENAME CONSTRAINT fk_core_user_roles_camp TO fk_core_user_roles_site;
ALTER TABLE core_user_permissions RENAME CONSTRAINT fk_core_user_permissions_camp TO fk_core_user_permissions_site;
ALTER TABLE core_user_roles
  ADD COLUMN scope_type TEXT GENERATED ALWAYS AS (CASE WHEN site_id IS NULL THEN 'TENANT' ELSE 'SITE' END) STORED;
ALTER TABLE core_user_permissions
  ADD COLUMN scope_type TEXT GENERATED ALWAYS AS (CASE WHEN site_id IS NULL THEN 'TENANT' ELSE 'SITE' END) STORED;
COMMENT ON COLUMN core_user_roles.site_id IS 'ADR-007: ажлын байр (одоо camps.id); NULL = tenant даяар. ADR-008-д sites руу';
COMMENT ON COLUMN core_user_permissions.site_id IS 'ADR-007: ажлын байр (одоо camps.id); NULL = tenant даяар. ADR-008-д sites руу';

-- ── 2. Эрхийн каталог: модуль, хувилбар, код mapping ──────────
ALTER TABLE core_permissions DROP CONSTRAINT core_permissions_code_check;
ALTER TABLE core_permissions ADD COLUMN module TEXT;
ALTER TABLE core_permissions ADD COLUMN available_in TEXT NOT NULL DEFAULT 'v1';

-- Шинэ код (нэр, эрэмбэ хуучнаараа)
INSERT INTO core_permissions (code, name, sort_order, module, available_in) VALUES
  ('hr.employee.manage',    'Ажилтан бүртгэл',                 50, 'hr', 'v1'),
  ('hr.employee.terminate', 'Ажлаас гаргах, дахин ажилд авах', 55, 'hr', 'v1'),
  ('hr.attendance.import',  'Ирц (xlsx) импорт',               60, 'hr', 'v1'),
  ('hr.shift.adjust',       'Ээлжийн зохицуулалт',             70, 'hr', 'v1');

CREATE TABLE core_permission_aliases (
  old_code    TEXT        PRIMARY KEY CHECK (old_code ~ '^[a-z]+\.[a-z_]+\.[a-z_]+$'),
  new_code    TEXT        NOT NULL REFERENCES core_permissions(code),
  remove_in   TEXT        NOT NULL DEFAULT 'v0.2.4',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO core_permission_aliases (old_code, new_code) VALUES
  ('camp.employee.manage',    'hr.employee.manage'),
  ('camp.employee.terminate', 'hr.employee.terminate'),
  ('camp.movement.import',    'hr.attendance.import'),
  ('camp.shift.adjust',       'hr.shift.adjust');
GRANT SELECT ON core_permission_aliases TO app_user;

UPDATE core_role_permissions rp SET permission_code = a.new_code
FROM core_permission_aliases a WHERE rp.permission_code = a.old_code;
UPDATE core_user_permissions up SET permission_code = a.new_code
FROM core_permission_aliases a WHERE up.permission_code = a.old_code;

-- Q-R3: camp.roles.manage — юу ч зөвшөөрдөггүй байсан (SEC-009), устгана
DELETE FROM core_user_permissions WHERE permission_code = 'camp.roles.manage';
DELETE FROM core_role_permissions WHERE permission_code = 'camp.roles.manage';
DELETE FROM core_permissions WHERE code = 'camp.roles.manage' OR code IN (SELECT old_code FROM core_permission_aliases);

UPDATE core_permissions SET module = split_part(code, '.', 1);
UPDATE core_permissions SET available_in = 'v2'
WHERE code IN ('camp.contract.manage', 'camp.haul.create', 'camp.haul.approve', 'camp.meal.order', 'camp.meal.accept', 'camp.report.view');
ALTER TABLE core_permissions ALTER COLUMN module SET NOT NULL;
ALTER TABLE core_permissions ADD CONSTRAINT ck_core_permissions_code CHECK (code ~ '^(camp|hr|core)\.[a-z_]+\.[a-z_]+$');
ALTER TABLE core_permissions ADD CONSTRAINT ck_core_permissions_module CHECK (module = split_part(code, '.', 1));
ALTER TABLE core_permissions ADD CONSTRAINT ck_core_permissions_available CHECK (available_in IN ('v1', 'v2'));

-- ── 4. system_code → TEXT ─────────────────────────────────────
ALTER TABLE core_roles ALTER COLUMN system_code TYPE TEXT USING system_code::text;
ALTER TABLE core_roles ADD CONSTRAINT ck_core_roles_system_code CHECK (system_code ~ '^[A-Z][A-Z0-9_]*$');

-- ── 5. Функц / trigger ────────────────────────────────────────
-- 5.1 Системийн роль хамгаалах (алдааны угтвар CAMP_SYSTEM_ROLE хэвээр — API 409 mapping)
CREATE OR REPLACE FUNCTION core_roles_protect_system()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_system AND camp_tenant_exists(OLD.tenant_id) THEN
      RAISE EXCEPTION 'CAMP_SYSTEM_ROLE: системийн ролийг устгах боломжгүй (%)', OLD.name
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.is_system AND (NEW.is_system IS DISTINCT FROM OLD.is_system
                        OR NEW.system_code IS DISTINCT FROM OLD.system_code) THEN
    RAISE EXCEPTION 'CAMP_SYSTEM_ROLE: системийн ролийн кодыг өөрчлөх боломжгүй (%)', OLD.name
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT OLD.is_system AND NEW.is_system THEN
    RAISE EXCEPTION 'CAMP_SYSTEM_ROLE: энгийн ролийг системийн болгох боломжгүй'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER trg_core_roles_protect_system ON core_roles;
CREATE TRIGGER trg_core_roles_protect_system
  BEFORE UPDATE OR DELETE ON core_roles
  FOR EACH ROW EXECUTE FUNCTION core_roles_protect_system();
DROP FUNCTION camp_roles_protect_system();

-- 5.2 Олголт → загварын эрх хуулах (ADR-003 D-09). SECURITY INVOKER — app_user-ийн RLS хэвээр.
CREATE OR REPLACE FUNCTION core_user_roles_apply_template()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.role_id IS NOT DISTINCT FROM OLD.role_id AND NEW.site_id IS NOT DISTINCT FROM OLD.site_id
       AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id THEN
      RETURN NEW;
    END IF;
    DELETE FROM core_user_permissions WHERE tenant_id = OLD.tenant_id AND user_role_id = OLD.id;
  END IF;
  INSERT INTO core_user_permissions (tenant_id, user_id, permission_code, site_id, source, user_role_id)
  SELECT NEW.tenant_id, NEW.user_id, rp.permission_code, NEW.site_id, 'TEMPLATE', NEW.id
  FROM core_role_permissions rp
  WHERE rp.tenant_id = NEW.tenant_id AND rp.role_id = NEW.role_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER trg_core_user_roles_apply_template ON core_user_roles;
CREATE TRIGGER trg_core_user_roles_apply_template
  AFTER INSERT OR UPDATE ON core_user_roles
  FOR EACH ROW EXECUTE FUNCTION core_user_roles_apply_template();
DROP FUNCTION camp_user_roles_apply_template();

-- 5.3 Ажилтны албан тушаал → роль-загвар (D-11). Trigger нь camp_employees дээр (HR хүснэгт) — нэр хэвээр.
CREATE OR REPLACE FUNCTION camp_employees_sync_position_roles()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.position_id IS NOT DISTINCT FROM OLD.position_id
     AND NEW.user_id     IS NOT DISTINCT FROM OLD.user_id
     AND NEW.camp_id     IS NOT DISTINCT FROM OLD.camp_id THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.user_id IS NOT NULL THEN
    DELETE FROM core_user_roles
    WHERE tenant_id = OLD.tenant_id AND user_id = OLD.user_id AND source_position_id IS NOT NULL;
  END IF;
  IF NEW.user_id IS NOT NULL AND NEW.position_id IS NOT NULL THEN
    INSERT INTO core_user_roles (tenant_id, user_id, role_id, site_id, source_position_id)
    SELECT NEW.tenant_id, NEW.user_id, t.role_id,
           CASE WHEN t.scope = 'ALL_CAMPS' THEN NULL ELSE NEW.camp_id END,
           NEW.position_id
    FROM core_position_role_templates t
    WHERE t.tenant_id = NEW.tenant_id AND t.position_id = NEW.position_id
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- 5.4 Анхдагч роль (шинэ tenant). Idempotent: байгаа роль/эрхийг дарж бичихгүй.
CREATE OR REPLACE FUNCTION core_seed_default_roles(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_prev    text := current_setting('app.tenant_id', true);
  v_role_id uuid;
  r         record;
BEGIN
  PERFORM set_config('app.tenant_id', p_tenant_id::text, true);

  FOR r IN
    SELECT * FROM (VALUES
      ('CAMP_ADMIN',     'Кемп админ',     'Тохиргоо, гэрээ, мастер өгөгдөл, засвар эхлүүлэх/хаах',
        ARRAY['camp.settings.manage','camp.master.manage','camp.contract.manage',
              'hr.employee.manage','camp.room.manage','camp.asset.manage',
              'hr.attendance.import','hr.shift.adjust','camp.maintenance.create','camp.report.view',
              'camp.maintenance.parts','camp.maintenance.close','hr.employee.terminate']),
      ('CAMP_MANAGER',   'Кемп менежер',   'Ирц, ээлж, батлах, хоолны захиалга',
        ARRAY['hr.attendance.import','hr.shift.adjust','camp.haul.approve','camp.maintenance.close',
              'camp.meal.order','camp.maintenance.create','camp.report.view']),
      ('CATERING_ADMIN', 'Катеринг админ', 'Бохир ус/хог, сэлбэг, хоол хүлээн авах',
        ARRAY['hr.employee.manage','camp.room.manage','camp.asset.manage','camp.haul.create',
              'camp.maintenance.parts','camp.meal.accept','camp.maintenance.create','camp.report.view']),
      ('EMPLOYEE',       'Ажилтан',        'Өөрийн засварын хүсэлт (дараа: feed, хоолны гомдол, цэс)',
        ARRAY['camp.maintenance.create'])
    ) AS t(code, name, descr, perms)
  LOOP
    INSERT INTO core_roles (tenant_id, name, description, is_system, system_code)
    VALUES (p_tenant_id, r.name, r.descr, true, r.code)
    ON CONFLICT (tenant_id, system_code) DO NOTHING
    RETURNING id INTO v_role_id;

    IF v_role_id IS NOT NULL THEN
      INSERT INTO core_role_permissions (tenant_id, role_id, permission_code)
      SELECT p_tenant_id, v_role_id, unnest(r.perms);
    END IF;
    v_role_id := NULL;
  END LOOP;

  PERFORM set_config('app.tenant_id', COALESCE(v_prev, ''), true);
END;
$$;
REVOKE ALL ON FUNCTION core_seed_default_roles(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION core_tenants_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM core_seed_default_roles(NEW.id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION core_tenants_after_insert() FROM PUBLIC;
DROP TRIGGER trg_tenants_camp_seed_roles ON tenants;
CREATE TRIGGER trg_tenants_core_seed_roles
  AFTER INSERT ON tenants
  FOR EACH ROW EXECUTE FUNCTION core_tenants_after_insert();
DROP FUNCTION camp_tenants_after_insert();
DROP FUNCTION camp_seed_default_roles(uuid);

-- ── 6. Шалгалт: эрх алдагдаагүй (A = B, ADR-007 §5) ──────────
DO $$
DECLARE
  v_legacy bigint;
  v_core   bigint;
BEGIN
  SELECT count(*) INTO v_legacy FROM legacy_camp_user_permissions WHERE permission_code <> 'camp.roles.manage';
  SELECT count(*) INTO v_core FROM core_user_permissions;
  IF v_legacy <> v_core THEN
    RAISE EXCEPTION 'ADR007_MIGRATION: core_user_permissions % ≠ legacy %', v_core, v_legacy;
  END IF;
  SELECT count(*) INTO v_legacy FROM legacy_camp_role_permissions WHERE permission_code <> 'camp.roles.manage';
  SELECT count(*) INTO v_core FROM core_role_permissions;
  IF v_legacy <> v_core THEN
    RAISE EXCEPTION 'ADR007_MIGRATION: core_role_permissions % ≠ legacy %', v_core, v_legacy;
  END IF;
  SELECT count(*) INTO v_legacy FROM legacy_camp_user_roles;
  SELECT count(*) INTO v_core FROM core_user_roles;
  IF v_legacy <> v_core THEN
    RAISE EXCEPTION 'ADR007_MIGRATION: core_user_roles % ≠ legacy %', v_core, v_legacy;
  END IF;
  -- Хэрэглэгч бүрийн эрхийн олонлог (хуучин код → шинэ код) ижил
  IF EXISTS (
    (SELECT up.tenant_id, up.user_id, COALESCE(a.new_code, up.permission_code), up.camp_id, up.source, up.user_role_id
       FROM legacy_camp_user_permissions up
       LEFT JOIN core_permission_aliases a ON a.old_code = up.permission_code
      WHERE up.permission_code <> 'camp.roles.manage'
     EXCEPT
     SELECT tenant_id, user_id, permission_code, site_id, source, user_role_id FROM core_user_permissions)
    UNION ALL
    (SELECT tenant_id, user_id, permission_code, site_id, source, user_role_id FROM core_user_permissions
     EXCEPT
     SELECT up.tenant_id, up.user_id, COALESCE(a.new_code, up.permission_code), up.camp_id, up.source, up.user_role_id
       FROM legacy_camp_user_permissions up
       LEFT JOIN core_permission_aliases a ON a.old_code = up.permission_code
      WHERE up.permission_code <> 'camp.roles.manage')
  ) THEN
    RAISE EXCEPTION 'ADR007_MIGRATION: хэрэглэгчийн эрхийн олонлог зөрлөө';
  END IF;
END $$;
