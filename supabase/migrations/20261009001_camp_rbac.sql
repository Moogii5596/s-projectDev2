-- ============================================================
-- Camp Module · Шат 1.1 — RBAC + нийтлэг туслах функцууд (2026-10-09)
-- ============================================================
-- Төлөвлөгөө: docs/08_Roadmap/camp_module/01_plan_and_erd.md (ERD v4)
-- Дүрэм: RULE-11 (uuid_generate_v7), RULE-13 (user FK = core_users.id),
--        [RLS-004] ENABLE + FORCE + PERMISSIVE TO app_user + GRANT, [MIG-001] (db push ХОРИОТОЙ)
--
-- Шат 1-ийн шийдвэрүүд (2026-10-09, Lead Dev):
--   D1. Төлөв/төрлийн талбар → PostgreSQL native enum ("Camp*"), утга = Prisma нэр (UPPERCASE, @map хэрэггүй) → RULE-02
--       ⚠️ Дараа нь утга нэмэх/өөрчлөхдөө RULE-15-ийн дарааллыг мөрдөнө; ADD VALUE-г тусдаа migration-д.
--   D2. Tenant хоорондын холбоосыг DB түвшинд хаах → эх хүснэгт бүрт UNIQUE (tenant_id, id),
--       хүүхэд нь (tenant_id, x_id) composite FK-ээр холбогдоно (кемп доторх бол (tenant_id, camp_id, x_id)).
--       Шалтгаан: app одоогоор superuser-ээр ажилладаг тул RLS bypass [RLS-004] — FK бол bypass-гүй.
--   D3. Анхдагч 3 роль → camp_seed_default_roles(tenant_id); tenants AFTER INSERT trigger + одоо байгаа tenant-д backfill.
--   D4. camp_cost_entries → 3 nullable FK + source-тэй нийцэх CHECK; мөр засагдахгүй (snapshot).
--   D5. Permission каталог → tenant-гүй лавлах хүснэгт camp_permissions (CHECK биш): тайлбар/эрэмбэтэй,
--       FK-ээр хамгаалагдана, шинэ эрх = migration-д нэг INSERT. Кодын каталог (Шат 2.1) үүнтэй тест-ээр тулгагдана.
--   D6. Устгах дүрэм: tenant устгахад бүх camp_* CASCADE. Хүснэгт хооронд NO ACTION (кемп/ажилтныг устгахгүй,
--       is_active/status ашиглана); зөвхөн "эзэмшигч"-ийн дэд мөрүүд CASCADE (role→permissions, order→lines г.м.).
--       Хамгаалах trigger-үүд (системийн роль, APPROVED бүртгэл, зардал) tenant устгах CASCADE-ийг БЛОКЛОХГҮЙ.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;   -- 1.3: EXCLUDE (uuid =, daterange &&)

-- core_users-ийг (tenant_id, id)-аар лавлах боломж (D2). Өгөгдөл өөрчлөхгүй, зөвхөн unique index.
ALTER TABLE core_users ADD CONSTRAINT uq_core_users_tenant_id UNIQUE (tenant_id, id);

-- ── Нийтлэг туслах функцууд ───────────────────────────────────

-- Tenant RLS-ийг нэг загвараар тавих [RLS-004]. Зөвхөн migration-д ашиглана (app_user-д эрхгүй).
CREATE OR REPLACE FUNCTION camp_apply_tenant_rls(p_table regclass)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_name text := (SELECT relname FROM pg_class WHERE oid = p_table);
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', p_table);
  EXECUTE format(
    'CREATE POLICY %I ON %s AS PERMISSIVE FOR ALL TO app_user '
    'USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) '
    'WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
    'tenant_isolation_' || v_name, p_table);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO app_user', p_table);
  EXECUTE format(
    'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
    v_name, p_table);
END;
$$;
REVOKE ALL ON FUNCTION camp_apply_tenant_rls(regclass) FROM PUBLIC;

-- Tenant одоо байгаа эсэх. Хамгаалах trigger-үүд tenant устгах CASCADE-ийг блоклохгүйн тулд (D6).
-- SECURITY DEFINER: app_user-ийн RLS-ээс хамаарахгүй, зөвхөн boolean буцаана.
CREATE OR REPLACE FUNCTION camp_tenant_exists(p_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant_id);
$$;

-- ── Enum ──────────────────────────────────────────────────────
CREATE TYPE "CampRoleCode" AS ENUM ('CAMP_ADMIN', 'CAMP_MANAGER', 'CATERING_ADMIN');

-- ── 1. Permission каталог (tenant-гүй, бүх tenant-д нийтлэг) ──
CREATE TABLE camp_permissions (
  code        TEXT        PRIMARY KEY CHECK (code ~ '^camp\.[a-z_]+\.[a-z_]+$'),
  name        TEXT        NOT NULL CHECK (btrim(name) <> ''),
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO camp_permissions (code, name, sort_order) VALUES
  ('camp.settings.manage',     'Кемпийн тохиргоо (НӨАТ, ростер, хоол идэх байршил)', 10),
  ('camp.roles.manage',        'Роль, эрхийн тохиргоо',                              20),
  ('camp.master.manage',       'Мастер өгөгдөл (кемп, байр, өрөө, хэлтэс, баг, байгууллага)', 30),
  ('camp.contract.manage',     'Гэрээ, ажил, үнэ',                                   40),
  ('camp.employee.manage',     'Ажилтан бүртгэл',                                    50),
  ('camp.movement.import',     'Ирц (xlsx) импорт',                                  60),
  ('camp.shift.adjust',        'Ээлжийн зохицуулалт',                                70),
  ('camp.room.manage',         'Өрөө хуваарилалт',                                   80),
  ('camp.asset.manage',        'Үндсэн хөрөнгө',                                     90),
  ('camp.maintenance.create',  'Засварын хүсэлт үүсгэх',                            100),
  ('camp.maintenance.parts',   'Засварын сэлбэг бүртгэх',                           110),
  ('camp.maintenance.close',   'Засвар хаах (сэлбэгийн зардал батлах)',            120),
  ('camp.haul.create',         'Бохир ус / хог бүртгэх',                            130),
  ('camp.haul.approve',        'Бохир ус / хог батлах',                             140),
  ('camp.meal.order',          'Хоолны захиалга өгөх',                              150),
  ('camp.meal.accept',         'Хоолны захиалга хүлээн авах',                       160),
  ('camp.report.view',         'Зардлын тайлан харах',                              170);

-- ── 2. Роль ───────────────────────────────────────────────────
CREATE TABLE camp_roles (
  id           UUID           PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id    UUID           NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         TEXT           NOT NULL CHECK (btrim(name) <> ''),
  description  TEXT,
  is_system    BOOLEAN        NOT NULL DEFAULT false,
  system_code  "CampRoleCode",                       -- зөвхөн анхдагч ролиудад; seed-ийн idempotency түлхүүр
  created_at   TIMESTAMPTZ    NOT NULL DEFAULT clock_timestamp(),
  updated_at   TIMESTAMPTZ    NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_camp_roles_tenant_id   UNIQUE (tenant_id, id),
  CONSTRAINT uq_camp_roles_tenant_name UNIQUE (tenant_id, name),
  CONSTRAINT uq_camp_roles_tenant_code UNIQUE (tenant_id, system_code),
  CONSTRAINT chk_camp_roles_system CHECK ((system_code IS NOT NULL) = is_system)
);

CREATE TABLE camp_role_permissions (
  tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role_id          UUID        NOT NULL,
  permission_code  TEXT        NOT NULL REFERENCES camp_permissions(code),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT pk_camp_role_permissions PRIMARY KEY (role_id, permission_code),
  CONSTRAINT fk_camp_role_permissions_role FOREIGN KEY (tenant_id, role_id)
    REFERENCES camp_roles (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX idx_camp_role_permissions_tenant ON camp_role_permissions (tenant_id, role_id);

-- camp_id NULL = бүх кемп. camps хүснэгт 1.2-т үүснэ → FK-г 1.2-т нэмнэ.
CREATE TABLE camp_user_roles (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL,   -- core_users.id (RULE-13), authId БИШ
  role_id     UUID        NOT NULL,
  camp_id     UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fk_camp_user_roles_user FOREIGN KEY (tenant_id, user_id)
    REFERENCES core_users (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_camp_user_roles_role FOREIGN KEY (tenant_id, role_id)
    REFERENCES camp_roles (tenant_id, id) ON DELETE CASCADE
);
-- PG15+: NULL camp_id-г давхардал гэж тооцно (Prisma илэрхийлэхгүй — зөвхөн энд)
CREATE UNIQUE INDEX uq_camp_user_roles ON camp_user_roles (tenant_id, user_id, role_id, camp_id) NULLS NOT DISTINCT;
CREATE INDEX idx_camp_user_roles_role ON camp_user_roles (tenant_id, role_id);

-- ── 3. Системийн ролийг устгахгүй, кодыг солихгүй ────────────
CREATE OR REPLACE FUNCTION camp_roles_protect_system()
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
CREATE TRIGGER trg_camp_roles_protect_system
  BEFORE UPDATE OR DELETE ON camp_roles
  FOR EACH ROW EXECUTE FUNCTION camp_roles_protect_system();

-- ── 4. Анхдагч ролиуд (D3) ────────────────────────────────────
-- Idempotent: байгаа роль/эрхийг дахин үүсгэхгүй, админы зассан эрхийг дарж бичихгүй (зөвхөн шинээр үүссэн рольд эрх өгнө).
CREATE OR REPLACE FUNCTION camp_seed_default_roles(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_prev    text := current_setting('app.tenant_id', true);
  v_role_id uuid;
  r         record;
BEGIN
  PERFORM set_config('app.tenant_id', p_tenant_id::text, true);

  FOR r IN
    SELECT * FROM (VALUES
      ('CAMP_ADMIN'::"CampRoleCode",     'Кемп админ',     'Тохиргоо, эрх, гэрээ, мастер өгөгдөл',
        ARRAY['camp.settings.manage','camp.roles.manage','camp.master.manage','camp.contract.manage',
              'camp.employee.manage','camp.room.manage','camp.asset.manage',
              'camp.movement.import','camp.shift.adjust','camp.maintenance.create','camp.report.view']),
      ('CAMP_MANAGER'::"CampRoleCode",   'Кемп менежер',   'Ирц, ээлж, батлах, хоолны захиалга',
        ARRAY['camp.movement.import','camp.shift.adjust','camp.haul.approve','camp.maintenance.close',
              'camp.meal.order','camp.maintenance.create','camp.report.view']),
      ('CATERING_ADMIN'::"CampRoleCode", 'Катеринг админ', 'Бохир ус/хог, сэлбэг, хоол хүлээн авах',
        ARRAY['camp.employee.manage','camp.room.manage','camp.asset.manage','camp.haul.create',
              'camp.maintenance.parts','camp.meal.accept','camp.maintenance.create','camp.report.view'])
    ) AS t(code, name, descr, perms)
  LOOP
    INSERT INTO camp_roles (tenant_id, name, description, is_system, system_code)
    VALUES (p_tenant_id, r.name, r.descr, true, r.code)
    ON CONFLICT (tenant_id, system_code) DO NOTHING
    RETURNING id INTO v_role_id;

    IF v_role_id IS NOT NULL THEN
      INSERT INTO camp_role_permissions (tenant_id, role_id, permission_code)
      SELECT p_tenant_id, v_role_id, unnest(r.perms);
    END IF;
    v_role_id := NULL;
  END LOOP;

  PERFORM set_config('app.tenant_id', COALESCE(v_prev, ''), true);
END;
$$;
REVOKE ALL ON FUNCTION camp_seed_default_roles(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION camp_tenants_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM camp_seed_default_roles(NEW.id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION camp_tenants_after_insert() FROM PUBLIC;
CREATE TRIGGER trg_tenants_camp_seed_roles
  AFTER INSERT ON tenants
  FOR EACH ROW EXECUTE FUNCTION camp_tenants_after_insert();

-- ── 5. RLS + GRANT ────────────────────────────────────────────
SELECT camp_apply_tenant_rls('camp_roles');
SELECT camp_apply_tenant_rls('camp_role_permissions');
SELECT camp_apply_tenant_rls('camp_user_roles');
GRANT SELECT ON camp_permissions TO app_user;   -- каталог: зөвхөн унших

-- ── 6. Одоо байгаа tenant-уудад backfill ─────────────────────
SELECT camp_seed_default_roles(id) FROM tenants;
