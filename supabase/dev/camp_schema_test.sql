-- ============================================================
-- Camp Module · Шат 1 (+4.1) — DB тест (99 шалгалт): RLS (app_user), composite FK (D2), EXCLUDE, CHECK, trigger, seed, CASCADE
-- ============================================================
-- Цэвэр/local DB дээр (migration up хийсний дараа) ажиллуулна. Өөрийн 2 tenant үүсгээд төгсгөлд устгана (дахин ажиллуулж болно).
-- Windows (PowerShell) — файлыг контейнер руу ХУУЛЖ ажиллуулна (pipe БИШ) [ENV-009], superuser-ээр (SET ROLE app_user) [TEST-007]:
--   $db = docker ps --filter "name=^supabase_db_s-project$" --format "{{.Names}}"
--   docker cp supabase\dev\camp_schema_test.sql "${db}:/tmp/camp_schema_test.sql"
--   docker exec -e PGPASSWORD=postgres $db psql -h 127.0.0.1 -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f /tmp/camp_schema_test.sql
--   (Монгол NOTICE уншигдахгүй бол урьдчилан: [Console]::OutputEncoding = [Text.UTF8Encoding]::new())
-- Амжилттай бол төгсгөлд: ==== CAMP SCHEMA TEST: ALL PASSED ====   (алдаа бол эхний унасан шалгалтаар зогсоно)
-- ============================================================
\set QUIET on
\o /dev/null
SET client_min_messages = warning;

-- ── Туслах: алдаа гарах ёстой SQL ─────────────────────────────
CREATE OR REPLACE FUNCTION t_fail(p_sql text, p_like text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE p_like THEN
      RAISE EXCEPTION 'WRONG ERROR for [%]: got "%", expected like "%"', p_sql, SQLERRM, p_like;
    END IF;
    RAISE NOTICE 'ok (fail as expected): %', left(SQLERRM, 90);
    RETURN;
  END;
  RAISE EXCEPTION 'EXPECTED FAILURE but succeeded: %', p_sql;
END $$;
CREATE OR REPLACE FUNCTION t_eq(p_got anyelement, p_exp anyelement, p_msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_got IS DISTINCT FROM p_exp THEN RAISE EXCEPTION 'ASSERT %: got %, expected %', p_msg, p_got, p_exp; END IF;
  RAISE NOTICE 'ok: %', p_msg;
END $$;
GRANT EXECUTE ON FUNCTION t_fail(text, text), t_eq(anyelement, anyelement, text) TO app_user;
SET client_min_messages = notice;

-- ── 0. Setup (postgres): 2 tenant, хэрэглэгчид ────────────────
DELETE FROM tenants WHERE id IN ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001');  -- өмнөх унасан ажиллагааны үлдэгдэл
INSERT INTO tenants (id, slug, name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'camp-a', 'Camp A'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'camp-b', 'Camp B');
INSERT INTO core_users (id, tenant_id, auth_id, email, role) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', gen_random_uuid(), 'mgr@a.mn', 'admin'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-000000000001', gen_random_uuid(), 'cat@a.mn', 'admin'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000001', gen_random_uuid(), 'mgr@b.mn', 'admin');

-- ── 1. Анхдагч ролиуд (D3) ────────────────────────────────────
SELECT t_eq((SELECT count(*) FROM camp_roles WHERE tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001')::int, 3, 'шинэ tenant-д 3 роль trigger-ээр');
SELECT t_eq((SELECT count(*) FROM camp_roles r JOIN tenants t ON t.id = r.tenant_id)::int, (SELECT count(*) * 3 FROM tenants)::int, 'бүх tenant 3 рольтой (backfill)');
SELECT t_eq((SELECT count(*) FROM camp_role_permissions p JOIN camp_roles r ON r.id = p.role_id
             WHERE r.tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND r.system_code = 'CAMP_ADMIN')::int, 11, 'Кемп админ 11 эрх');
SELECT t_eq((SELECT count(*) FROM camp_role_permissions p JOIN camp_roles r ON r.id = p.role_id
             WHERE r.tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND r.system_code = 'CAMP_MANAGER')::int, 7, 'Кемп менежер 7 эрх');
SELECT t_eq((SELECT count(*) FROM camp_role_permissions p JOIN camp_roles r ON r.id = p.role_id
             WHERE r.tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND r.system_code = 'CATERING_ADMIN')::int, 8, 'Катеринг админ 8 эрх');
-- idempotent + админы зассан эрхийг дарахгүй
DELETE FROM camp_role_permissions WHERE permission_code = 'camp.report.view'
  AND role_id = (SELECT id FROM camp_roles WHERE tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND system_code = 'CAMP_MANAGER');
SELECT camp_seed_default_roles('aaaaaaaa-0000-0000-0000-000000000001');
SELECT t_eq((SELECT count(*) FROM camp_roles WHERE tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001')::int, 3, 'seed дахин дуудахад давхардахгүй');
SELECT t_eq((SELECT count(*) FROM camp_role_permissions p JOIN camp_roles r ON r.id = p.role_id
             WHERE r.tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND r.system_code = 'CAMP_MANAGER')::int, 6, 'seed админы хассан эрхийг сэргээхгүй');
SELECT t_eq(has_function_privilege('app_user', 'camp_seed_default_roles(uuid)', 'EXECUTE'), false, 'app_user seed функц дуудах эрхгүй');
SELECT t_eq(has_function_privilege('app_user', 'camp_apply_tenant_rls(regclass)', 'EXECUTE'), false, 'app_user RLS туслах функц дуудах эрхгүй');

-- ── 2. RLS: app_user, tenant A context ────────────────────────
SET ROLE app_user;
SELECT t_eq((SELECT count(*) FROM camp_roles)::int, 0, 'context-гүй → 0 мөр');
BEGIN;
SELECT set_config('app.tenant_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT t_eq((SELECT count(*) FROM camp_roles)::int, 3, 'A context → зөвхөн A-ийн 3 роль');
SELECT t_eq((SELECT count(*) FROM camp_permissions)::int, 17, 'каталог 17 эрх (бүгдэд харагдана)');
SELECT t_fail($$INSERT INTO camp_permissions (code, name) VALUES ('camp.x.y', 'x')$$, '%permission denied%');
SELECT t_fail($$INSERT INTO camps (tenant_id, code, name) VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'X', 'x')$$, '%row-level security%');
SELECT t_fail($$UPDATE camp_roles SET name = 'x' || name WHERE system_code = 'NOPE'$$, '%invalid input value for enum%');
-- системийн роль
SELECT t_fail($$DELETE FROM camp_roles WHERE system_code = 'CAMP_ADMIN'$$, 'CAMP_SYSTEM_ROLE%');
SELECT t_fail($$UPDATE camp_roles SET system_code = 'CAMP_MANAGER' WHERE system_code = 'CAMP_ADMIN'$$, 'CAMP_SYSTEM_ROLE%');
UPDATE camp_roles SET name = 'Кемп админ (засав)' WHERE system_code = 'CAMP_ADMIN';
SELECT t_eq((SELECT count(*) FROM camp_roles WHERE name = 'Кемп админ (засав)')::int, 1, 'системийн ролийн нэрийг засаж болно');
SELECT t_fail($$INSERT INTO camp_role_permissions (tenant_id, role_id, permission_code)
  SELECT tenant_id, id, 'camp.unknown.perm' FROM camp_roles WHERE system_code = 'CAMP_ADMIN'$$, '%foreign key%');
INSERT INTO camp_roles (tenant_id, name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Нягтлан');
DELETE FROM camp_roles WHERE name = 'Нягтлан';
SELECT t_eq(true, true, 'энгийн роль үүсгэж/устгаж болно');

-- ── 3. Мастер өгөгдөл (A) ─────────────────────────────────────
INSERT INTO camps (id, tenant_id, code, name) VALUES
  ('aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'C1', 'Кемп 1'),
  ('aaaaaaaa-1000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'C2', 'Кемп 2');
INSERT INTO camp_meal_locations (id, tenant_id, camp_id, name) VALUES
  ('aaaaaaaa-1100-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'Кемп гал тогоо'),
  ('aaaaaaaa-1100-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'Уулын хэсэг'),
  ('aaaaaaaa-1100-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000002', 'Кемп-2 гал тогоо');
INSERT INTO camp_settings (tenant_id, camp_id, default_meal_location_id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-1100-0000-0000-000000000001');
SELECT t_eq((SELECT vat_rate FROM camp_settings)::numeric, 10.00::numeric, 'НӨАТ анхдагч 10%');
SELECT t_fail($$INSERT INTO camp_settings (tenant_id, camp_id, default_meal_location_id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000002', 'aaaaaaaa-1100-0000-0000-000000000001')$$, '%fk_camp_settings_default_location%');
INSERT INTO camp_departments (id, tenant_id, camp_id, code, name, meal_location_id) VALUES
  ('aaaaaaaa-1200-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'MINE', 'Уул засвар', 'aaaaaaaa-1100-0000-0000-000000000002'),
  ('aaaaaaaa-1200-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'ADM', 'Захиргаа', 'aaaaaaaa-1100-0000-0000-000000000001');
SELECT t_fail($$INSERT INTO camp_departments (tenant_id, camp_id, code, name, meal_location_id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'X', 'x', 'aaaaaaaa-1100-0000-0000-000000000009')$$,
  '%fk_camp_departments_location%');   -- өөр кемпийн байршил
INSERT INTO camp_department_shift_patterns (tenant_id, department_id, day_from, day_to, shift) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1200-0000-0000-000000000001', 1, 7, 'DAY'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1200-0000-0000-000000000001', 8, 14, 'NIGHT'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1200-0000-0000-000000000002', 1, 14, 'DAY');
SELECT t_fail($$INSERT INTO camp_department_shift_patterns (tenant_id, department_id, day_from, day_to, shift) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1200-0000-0000-000000000001', 7, 9, 'DAY')$$, '%ex_camp_shift_patterns_overlap%');
SELECT t_fail($$INSERT INTO camp_department_shift_patterns (tenant_id, department_id, day_from, day_to, shift) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1200-0000-0000-000000000002', 5, 3, 'DAY')$$, '%chk_camp_shift_patterns_range%');
INSERT INTO camp_buildings (id, tenant_id, camp_id, code, name) VALUES
  ('aaaaaaaa-1300-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'B1', 'Байр 1'),
  ('aaaaaaaa-1300-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000002', 'B9', 'Байр 9');
INSERT INTO camp_rooms (id, tenant_id, camp_id, building_id, room_no, capacity) VALUES
  ('aaaaaaaa-1400-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-1300-0000-0000-000000000001', '101', 2);
SELECT t_fail($$INSERT INTO camp_rooms (tenant_id, camp_id, building_id, room_no, capacity) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-1300-0000-0000-000000000009', '1', 2)$$, '%fk_camp_rooms_building%');
SELECT t_fail($$INSERT INTO camp_rooms (tenant_id, camp_id, building_id, room_no, capacity) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-1300-0000-0000-000000000001', '102', 0)$$, '%capacity_check%');
INSERT INTO camp_organizations (id, tenant_id, name, reg_number, org_type, service_types) VALUES
  ('aaaaaaaa-1500-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Уурхай ХХК', '1111111', 'MAIN', '{}'),
  ('aaaaaaaa-1500-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Тээвэр ХХК', '2222222', 'CONTRACTOR', '{SEWAGE_TRANSPORT,WASTE_TRANSPORT}'),
  ('aaaaaaaa-1500-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Цэвэрлэх байгууламж', '3333333', 'CONTRACTOR', '{SEWAGE_DISPOSAL}'),
  ('aaaaaaaa-1500-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'Катеринг ХХК', '4444444', 'CONTRACTOR', '{CATERING}');
SELECT t_fail($$INSERT INTO camp_organizations (tenant_id, name, reg_number, org_type) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Давхар', '1111111', 'MAIN')$$, '%uq_camp_organizations_reg%');
INSERT INTO camp_crews (id, tenant_id, camp_id, code, roster_anchor_date) VALUES
  ('aaaaaaaa-1600-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'A', '2026-10-07');
INSERT INTO camp_employees (id, tenant_id, camp_id, organization_id, department_id, crew_id, employee_code, full_name) VALUES
  ('aaaaaaaa-1700-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-1500-0000-0000-000000000001', 'aaaaaaaa-1200-0000-0000-000000000001', 'aaaaaaaa-1600-0000-0000-000000000001', 'E001', 'Бат'),
  ('aaaaaaaa-1700-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-1500-0000-0000-000000000001', 'aaaaaaaa-1200-0000-0000-000000000002', NULL, 'E002', 'Дорж');
SELECT t_fail($$INSERT INTO camp_employees (tenant_id, camp_id, organization_id, department_id, employee_code, full_name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000002', 'aaaaaaaa-1500-0000-0000-000000000001', 'aaaaaaaa-1200-0000-0000-000000000001', 'E009', 'x')$$,
  '%fk_camp_employees_department%');   -- өөр кемпийн хэлтэс
SELECT t_fail($$INSERT INTO camp_employees (tenant_id, camp_id, organization_id, department_id, employee_code, full_name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-1500-0000-0000-000000000001', 'aaaaaaaa-1200-0000-0000-000000000001', 'E001', 'x')$$,
  '%uq_camp_employees_code%');
-- хэрэглэгчид роль (camp_id NULL = бүх кемп, NULLS NOT DISTINCT)
INSERT INTO camp_user_roles (tenant_id, user_id, role_id)
  SELECT tenant_id, 'aaaaaaaa-0000-0000-0000-0000000000a1', id FROM camp_roles WHERE system_code = 'CAMP_MANAGER';
SELECT t_fail($$INSERT INTO camp_user_roles (tenant_id, user_id, role_id)
  SELECT tenant_id, 'aaaaaaaa-0000-0000-0000-0000000000a1', id FROM camp_roles WHERE system_code = 'CAMP_MANAGER'$$, '%uq_camp_user_roles%');
SELECT t_fail($$INSERT INTO camp_user_roles (tenant_id, user_id, role_id)
  SELECT tenant_id, 'bbbbbbbb-0000-0000-0000-0000000000b1', id FROM camp_roles WHERE system_code = 'CAMP_MANAGER'$$, '%fk_camp_user_roles_user%');  -- өөр tenant-ийн хэрэглэгч
COMMIT;

-- ── 4. Ирц, ээлж, өрөө (A) ────────────────────────────────────
BEGIN;
SELECT set_config('app.tenant_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
INSERT INTO camp_shift_adjustments (tenant_id, employee_id, start_date, end_date, shift, reason_type, created_by) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1700-0000-0000-000000000001', '2026-10-10', '2026-10-12', 'NIGHT', 'SHIFT_CHANGE', 'aaaaaaaa-0000-0000-0000-0000000000a1');
SELECT t_fail($$INSERT INTO camp_shift_adjustments (tenant_id, employee_id, start_date, end_date, shift, reason_type, created_by) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1700-0000-0000-000000000001', '2026-10-12', '2026-10-13', 'DAY', 'EARLY_ARRIVAL', 'aaaaaaaa-0000-0000-0000-0000000000a1')$$, '%ex_camp_shift_adj_overlap%');
SELECT t_fail($$INSERT INTO camp_shift_adjustments (tenant_id, employee_id, start_date, end_date, shift, reason_type, created_by) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1700-0000-0000-000000000002', '2026-10-12', '2026-10-13', 'DAY', 'OTHER', 'aaaaaaaa-0000-0000-0000-0000000000a1')$$, '%chk_camp_shift_adj_reason%');
INSERT INTO camp_movement_imports (id, tenant_id, camp_id, file_name, total_rows, ok_rows, uploaded_by) VALUES
  ('aaaaaaaa-1800-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'irts.xlsx', 2, 2, 'aaaaaaaa-0000-0000-0000-0000000000a1');
SELECT t_fail($$UPDATE camp_movement_imports SET status = 'CONFIRMED'$$, '%chk_camp_movement_imports_confirmed%');
INSERT INTO camp_movements (id, tenant_id, camp_id, employee_id, movement_date, direction, kind, meals, import_id) VALUES
  ('aaaaaaaa-1900-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-1700-0000-0000-000000000001', '2026-10-07', 'ARRIVAL', 'ROSTER', '{DINNER}', 'aaaaaaaa-1800-0000-0000-000000000001'),
  ('aaaaaaaa-1900-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-1700-0000-0000-000000000001', '2026-10-21', 'DEPARTURE', 'ROSTER', '{BREAKFAST}', 'aaaaaaaa-1800-0000-0000-000000000001'),
  ('aaaaaaaa-1900-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-1700-0000-0000-000000000002', '2026-10-09', 'ARRIVAL', 'OFF_ROSTER', '{LUNCH,DINNER}', NULL);
SELECT t_fail($$INSERT INTO camp_movements (tenant_id, camp_id, employee_id, movement_date, direction, kind) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-1700-0000-0000-000000000001', '2026-10-07', 'ARRIVAL', 'ROSTER')$$, '%uq_camp_movements_unique%');
SELECT t_fail($$INSERT INTO camp_movements (tenant_id, camp_id, employee_id, movement_date, direction, kind) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000002', 'aaaaaaaa-1700-0000-0000-000000000001', '2026-10-08', 'ARRIVAL', 'ROSTER')$$, '%fk_camp_movements_employee%');
SELECT t_fail($$INSERT INTO camp_movements (tenant_id, camp_id, employee_id, movement_date, direction, kind, meals) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-1700-0000-0000-000000000002', '2026-10-30', 'ARRIVAL', 'ROSTER', ARRAY['DINNER', NULL]::"CampMealType"[])$$, '%chk_camp_movements_meals_nonull%');
INSERT INTO camp_stays (tenant_id, camp_id, employee_id, arrival_movement_id, departure_movement_id, start_date, end_date) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-1700-0000-0000-000000000001', 'aaaaaaaa-1900-0000-0000-000000000001', 'aaaaaaaa-1900-0000-0000-000000000002', '2026-10-07', '2026-10-21');
INSERT INTO camp_stays (tenant_id, camp_id, employee_id, arrival_movement_id, start_date) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-1700-0000-0000-000000000002', 'aaaaaaaa-1900-0000-0000-000000000003', '2026-10-09');
SELECT t_fail($$INSERT INTO camp_stays (tenant_id, camp_id, employee_id, arrival_movement_id, start_date) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-1700-0000-0000-000000000001', 'aaaaaaaa-1900-0000-0000-000000000002', '2026-10-21')$$, 'CAMP_STAY_INVALID%'); -- DEPARTURE-аар нээх
SELECT t_fail($$UPDATE camp_stays SET start_date = '2026-10-08' WHERE arrival_movement_id = 'aaaaaaaa-1900-0000-0000-000000000003'$$, 'CAMP_STAY_INVALID%'); -- огноо зөрүү
SELECT t_fail($$UPDATE camp_stays SET end_date = '2026-10-20' WHERE arrival_movement_id = 'aaaaaaaa-1900-0000-0000-000000000003'$$, '%chk_camp_stays_closed%');
-- Нээлттэй stay-тэй давхцах (нэг хүн хоёр газар)
INSERT INTO camp_movements (id, tenant_id, camp_id, employee_id, movement_date, direction, kind) VALUES
  ('aaaaaaaa-1900-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-1700-0000-0000-000000000002', '2026-11-01', 'ARRIVAL', 'OFF_ROSTER');
SELECT t_fail($$INSERT INTO camp_stays (tenant_id, camp_id, employee_id, arrival_movement_id, start_date) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-1700-0000-0000-000000000002', 'aaaaaaaa-1900-0000-0000-000000000004', '2026-11-01')$$, '%ex_camp_stays_overlap%');
INSERT INTO camp_room_allocations (tenant_id, camp_id, room_id, employee_id, start_date) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-1400-0000-0000-000000000001', 'aaaaaaaa-1700-0000-0000-000000000001', '2026-10-07'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-1400-0000-0000-000000000001', 'aaaaaaaa-1700-0000-0000-000000000002', '2026-10-09');
SELECT t_eq(true, true, 'өөр ажилтнууд нэг өрөөг хуваалцана');
SELECT t_fail($$INSERT INTO camp_room_allocations (tenant_id, camp_id, room_id, employee_id, start_date) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-1400-0000-0000-000000000001', 'aaaaaaaa-1700-0000-0000-000000000001', '2026-12-01')$$, '%ex_camp_room_alloc_overlap%');
COMMIT;

-- ── 5. Хөрөнгө, засвар ───────────────────────────────────────
BEGIN;
SELECT set_config('app.tenant_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
INSERT INTO camp_asset_categories (id, tenant_id, name) VALUES ('aaaaaaaa-2000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Цагаан хэрэглэл');
INSERT INTO camp_assets (id, tenant_id, camp_id, category_id, inventory_no, name, room_id) VALUES
  ('aaaaaaaa-2100-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-2000-0000-0000-000000000001', 'INV-1', 'Хөргөгч', 'aaaaaaaa-1400-0000-0000-000000000001');
INSERT INTO camp_asset_movements (tenant_id, camp_id, asset_id, from_room_id, to_room_id, moved_by) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-2100-0000-0000-000000000001', NULL, 'aaaaaaaa-1400-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1');
SELECT t_fail($$INSERT INTO camp_asset_movements (tenant_id, camp_id, asset_id, from_room_id, to_room_id, moved_by) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-2100-0000-0000-000000000001', NULL, NULL, 'aaaaaaaa-0000-0000-0000-0000000000a1')$$, '%chk_camp_asset_movements_rooms%');
SELECT t_fail($$INSERT INTO camp_maintenance_requests (tenant_id, camp_id, request_no, title, reported_by) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'MR-0', 'x', 'aaaaaaaa-0000-0000-0000-0000000000a1')$$, '%chk_camp_maintenance_target%');
SELECT t_fail($$INSERT INTO camp_maintenance_requests (tenant_id, camp_id, request_no, asset_id, title, reported_by, blocks_room) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'MR-B', 'aaaaaaaa-2100-0000-0000-000000000001', 'x', 'aaaaaaaa-0000-0000-0000-0000000000a1', true)$$, '%chk_camp_maintenance_blocks_room%');
SELECT t_fail($$INSERT INTO camp_organizations (tenant_id, name, org_type, service_types) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'x', 'MAIN', ARRAY['CATERING', NULL]::"CampOrgServiceType"[])$$, '%chk_camp_organizations_services_nonull%');
INSERT INTO camp_maintenance_requests (id, tenant_id, camp_id, request_no, room_id, title, reported_by, status) VALUES
  ('aaaaaaaa-2200-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'MR-1', 'aaaaaaaa-1400-0000-0000-000000000001', 'Ус гоожиж байна', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'DONE');
SELECT t_fail($$INSERT INTO camp_maintenance_parts (tenant_id, request_id, part_name, quantity, source, created_by) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2200-0000-0000-000000000001', 'Кран', 1, 'CATERING_PURCHASED', 'aaaaaaaa-0000-0000-0000-0000000000a2')$$, '%chk_camp_parts_price%');
INSERT INTO camp_maintenance_parts (id, tenant_id, request_id, part_name, quantity, unit_price, source, created_by) VALUES
  ('aaaaaaaa-2300-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2200-0000-0000-000000000001', 'Кран', 2, 55000, 'CATERING_PURCHASED', 'aaaaaaaa-0000-0000-0000-0000000000a2'),
  ('aaaaaaaa-2300-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2200-0000-0000-000000000001', 'Хоолой', 1, NULL, 'MINE_SUPPLIED', 'aaaaaaaa-0000-0000-0000-0000000000a2');
SELECT t_fail($$UPDATE camp_maintenance_requests SET status = 'CLOSED'$$, '%chk_camp_maintenance_closed%');
UPDATE camp_maintenance_requests SET status = 'CLOSED', closed_by = 'aaaaaaaa-0000-0000-0000-0000000000a1', closed_at = now();
SELECT t_fail($$UPDATE camp_maintenance_parts SET quantity = 3 WHERE id = 'aaaaaaaa-2300-0000-0000-000000000001'$$, 'CAMP_MAINTENANCE_LOCKED%');
SELECT t_fail($$INSERT INTO camp_maintenance_parts (tenant_id, request_id, part_name, quantity, source, created_by) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2200-0000-0000-000000000001', 'Шинэ', 1, 'MINE_SUPPLIED', 'aaaaaaaa-0000-0000-0000-0000000000a2')$$, 'CAMP_MAINTENANCE_LOCKED%');
SELECT t_fail($$DELETE FROM camp_maintenance_parts WHERE id = 'aaaaaaaa-2300-0000-0000-000000000002'$$, 'CAMP_MAINTENANCE_LOCKED%');
SELECT t_fail($$UPDATE camp_maintenance_requests SET status = 'OPEN'$$, 'CAMP_MAINTENANCE_LOCKED%');
SELECT t_fail($$DELETE FROM camp_maintenance_requests$$, 'CAMP_MAINTENANCE_LOCKED%');
COMMIT;

-- ── 6. Гэрээ ──────────────────────────────────────────────────
BEGIN;
SELECT set_config('app.tenant_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
INSERT INTO camp_contracts (id, tenant_id, camp_id, organization_id, contract_no, title, start_date, status) VALUES
  ('aaaaaaaa-3000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-1500-0000-0000-000000000002', 'G-1', 'Бохир ус тээвэр', '2026-01-01', 'ACTIVE'),
  ('aaaaaaaa-3000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-1500-0000-0000-000000000003', 'G-2', 'Бохир ус хүлээн авах', '2026-01-01', 'ACTIVE'),
  ('aaaaaaaa-3000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-1500-0000-0000-000000000004', 'G-3', 'Хоол', '2026-01-01', 'ACTIVE'),
  ('aaaaaaaa-3000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000002', 'aaaaaaaa-1500-0000-0000-000000000002', 'G-9', 'Кемп 2 тээвэр', '2026-01-01', 'ACTIVE');
SELECT t_fail($$UPDATE camp_contracts SET status = 'TERMINATED' WHERE contract_no = 'G-1'$$, '%chk_camp_contracts_terminated%');
SELECT t_fail($$UPDATE camp_contracts SET end_date = '2025-01-01' WHERE contract_no = 'G-1'$$, '%chk_camp_contracts_dates%');
INSERT INTO camp_contract_items (id, tenant_id, camp_id, contract_id, service_type, unit) VALUES
  ('aaaaaaaa-3100-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-3000-0000-0000-000000000001', 'SEWAGE_TRANSPORT', 'TRIP'),
  ('aaaaaaaa-3100-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-3000-0000-0000-000000000002', 'SEWAGE_DISPOSAL', 'M3'),
  ('aaaaaaaa-3100-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-3000-0000-0000-000000000003', 'MEAL', 'PERSON_DAY'),
  ('aaaaaaaa-3100-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000002', 'aaaaaaaa-3000-0000-0000-000000000009', 'SEWAGE_TRANSPORT', 'TRIP');
SELECT t_fail($$INSERT INTO camp_contract_items (tenant_id, camp_id, contract_id, service_type, unit) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-3000-0000-0000-000000000003', 'WASTE_TRANSPORT', 'PERSON_DAY')$$, '%chk_camp_contract_items_unit%');
SELECT t_fail($$INSERT INTO camp_contract_items (tenant_id, camp_id, contract_id, service_type, unit) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000002', 'aaaaaaaa-3000-0000-0000-000000000001', 'WASTE_TRANSPORT', 'TRIP')$$, '%fk_camp_contract_items_contract%');
INSERT INTO camp_contract_item_prices (tenant_id, contract_item_id, effective_from, unit_price, vat_included) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-3100-0000-0000-000000000001', '2026-01-01', 350000, true),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-3100-0000-0000-000000000001', '2026-07-01', 380000, true);
SELECT t_fail($$INSERT INTO camp_contract_item_prices (tenant_id, contract_item_id, effective_from, unit_price, vat_included) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-3100-0000-0000-000000000001', '2026-07-01', 1, true)$$, '%uq_camp_contract_item_prices%');
COMMIT;

-- ── 7. Бохир ус, хоол, зардал ────────────────────────────────
BEGIN;
SELECT set_config('app.tenant_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT t_fail($$INSERT INTO camp_haul_records (tenant_id, camp_id, record_no, haul_type, haul_date, transport_contract_item_id, disposal_contract_item_id, created_by) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'H-0', 'WASTE', '2026-10-09', 'aaaaaaaa-3100-0000-0000-000000000001', 'aaaaaaaa-3100-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000a2')$$, 'CAMP_HAUL_CONTRACT%');
SELECT t_fail($$INSERT INTO camp_haul_records (tenant_id, camp_id, record_no, haul_type, haul_date, transport_contract_item_id, disposal_contract_item_id, created_by) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'H-0', 'SEWAGE', '2026-10-09', 'aaaaaaaa-3100-0000-0000-000000000009', 'aaaaaaaa-3100-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000a2')$$, '%fk_camp_haul_transport%');  -- өөр кемпийн гэрээ
INSERT INTO camp_haul_records (id, tenant_id, camp_id, record_no, haul_type, haul_date, trips, volume, volume_unit, transport_contract_item_id, disposal_contract_item_id, created_by) VALUES
  ('aaaaaaaa-4000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'H-1', 'SEWAGE', '2026-10-09', 2, 24, 'M3', 'aaaaaaaa-3100-0000-0000-000000000001', 'aaaaaaaa-3100-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000a2');
SELECT t_fail($$UPDATE camp_haul_records SET volume_unit = NULL$$, '%chk_camp_haul_volume%');
SELECT t_fail($$UPDATE camp_haul_records SET status = 'SUBMITTED'$$, '%chk_camp_haul_submitted%');
UPDATE camp_haul_records SET status = 'SUBMITTED', submitted_at = now();
SELECT t_fail($$UPDATE camp_haul_records SET status = 'APPROVED', reviewed_by = created_by, reviewed_at = now()$$, '%chk_camp_haul_four_eyes%');
SELECT t_fail($$UPDATE camp_haul_records SET status = 'REJECTED', reviewed_by = 'aaaaaaaa-0000-0000-0000-0000000000a1', reviewed_at = now()$$, '%chk_camp_haul_rejected%');
UPDATE camp_haul_records SET status = 'APPROVED', reviewed_by = 'aaaaaaaa-0000-0000-0000-0000000000a1', reviewed_at = now();
SELECT t_fail($$UPDATE camp_haul_records SET trips = 3$$, 'CAMP_HAUL_LOCKED%');
SELECT t_fail($$DELETE FROM camp_haul_records$$, 'CAMP_HAUL_LOCKED%');

INSERT INTO camp_cost_entries (tenant_id, camp_id, cost_date, source, haul_record_id, service_type, contract_item_id, organization_id,
  quantity, unit, unit_price, vat_included, vat_rate, net_amount, vat_amount, gross_amount, created_by) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', '2026-10-09', 'HAUL', 'aaaaaaaa-4000-0000-0000-000000000001',
   'SEWAGE_TRANSPORT', 'aaaaaaaa-3100-0000-0000-000000000001', 'aaaaaaaa-1500-0000-0000-000000000002',
   2, 'TRIP', 380000, true, 10, 690909.09, 69090.91, 760000.00, 'aaaaaaaa-0000-0000-0000-0000000000a1');
SELECT t_fail($$INSERT INTO camp_cost_entries (tenant_id, camp_id, cost_date, source, haul_record_id, service_type, contract_item_id,
  quantity, unit, unit_price, vat_included, vat_rate, net_amount, vat_amount, gross_amount, created_by) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', '2026-10-09', 'HAUL', 'aaaaaaaa-4000-0000-0000-000000000001',
   'SEWAGE_TRANSPORT', 'aaaaaaaa-3100-0000-0000-000000000001', 2, 'TRIP', 1, true, 10, 1, 0, 1, 'aaaaaaaa-0000-0000-0000-0000000000a1')$$, '%uq_camp_cost_haul%');
SELECT t_fail($$INSERT INTO camp_cost_entries (tenant_id, camp_id, cost_date, source, haul_record_id, meal_order_id, service_type, contract_item_id,
  quantity, unit, unit_price, vat_included, vat_rate, net_amount, vat_amount, gross_amount, created_by) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', '2026-10-09', 'MEAL', 'aaaaaaaa-4000-0000-0000-000000000001', NULL,
   'MEAL', 'aaaaaaaa-3100-0000-0000-000000000003', 1, 'PERSON_DAY', 1, true, 10, 1, 0, 1, 'aaaaaaaa-0000-0000-0000-0000000000a1')$$, '%chk_camp_cost_source%');
SELECT t_fail($$INSERT INTO camp_cost_entries (tenant_id, camp_id, cost_date, source, maintenance_part_id,
  quantity, unit, unit_price, vat_included, vat_rate, net_amount, vat_amount, gross_amount, created_by) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', '2026-10-09', 'MAINTENANCE_PART', 'aaaaaaaa-2300-0000-0000-000000000001',
   2, 'ш', 55000, true, 10, 100000, 10000, 110001, 'aaaaaaaa-0000-0000-0000-0000000000a1')$$, '%chk_camp_cost_amounts%');
INSERT INTO camp_cost_entries (tenant_id, camp_id, cost_date, source, maintenance_part_id, organization_id,
  quantity, unit, unit_price, vat_included, vat_rate, net_amount, vat_amount, gross_amount, created_by) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', '2026-10-09', 'MAINTENANCE_PART', 'aaaaaaaa-2300-0000-0000-000000000001',
   'aaaaaaaa-1500-0000-0000-000000000004', 2, 'ш', 55000, true, 10, 100000, 10000, 110000, 'aaaaaaaa-0000-0000-0000-0000000000a1');
SELECT t_fail($$UPDATE camp_cost_entries SET unit_price = 1$$, 'CAMP_COST_IMMUTABLE%');
SELECT t_fail($$DELETE FROM camp_cost_entries$$, 'CAMP_COST_IMMUTABLE%');

-- Хоолны захиалга
INSERT INTO camp_meal_orders (id, tenant_id, camp_id, order_date) VALUES
  ('aaaaaaaa-5000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', '2026-10-10');
SELECT t_fail($$INSERT INTO camp_meal_orders (tenant_id, camp_id, order_date) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', '2026-10-10')$$, '%uq_camp_meal_orders_day%');
INSERT INTO camp_meal_order_lines (tenant_id, camp_id, order_id, meal_type, meal_location_id, base_count, extra_count) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-5000-0000-0000-000000000001', 'BREAKFAST', 'aaaaaaaa-1100-0000-0000-000000000001', 120, 0),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-5000-0000-0000-000000000001', 'LUNCH', 'aaaaaaaa-1100-0000-0000-000000000002', 60, 5),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-5000-0000-0000-000000000001', 'DINNER', 'aaaaaaaa-1100-0000-0000-000000000001', 118, -2);
SELECT t_fail($$INSERT INTO camp_meal_order_lines (tenant_id, camp_id, order_id, meal_type, meal_location_id, base_count, extra_count) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-5000-0000-0000-000000000001', 'NIGHT', 'aaaaaaaa-1100-0000-0000-000000000009', 1, 0)$$, '%fk_camp_meal_order_lines_location%');
SELECT t_fail($$INSERT INTO camp_meal_order_lines (tenant_id, camp_id, order_id, meal_type, meal_location_id, base_count, extra_count) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-5000-0000-0000-000000000001', 'NIGHT', 'aaaaaaaa-1100-0000-0000-000000000001', 1, -2)$$, '%chk_camp_meal_order_lines_total%');
SELECT t_fail($$UPDATE camp_meal_orders SET status = 'ORDERED', ordered_by = 'aaaaaaaa-0000-0000-0000-0000000000a1', ordered_at = now()$$, '%chk_camp_meal_orders_contract%');
SELECT t_fail($$UPDATE camp_meal_orders SET meal_contract_item_id = 'aaaaaaaa-3100-0000-0000-000000000001'$$, 'CAMP_MEAL_CONTRACT%');
UPDATE camp_meal_orders SET status = 'ORDERED', meal_contract_item_id = 'aaaaaaaa-3100-0000-0000-000000000003',
  ordered_by = 'aaaaaaaa-0000-0000-0000-0000000000a1', ordered_at = now();
SELECT t_fail($$UPDATE camp_meal_orders SET status = 'ACCEPTED', reviewed_by = ordered_by, reviewed_at = now()$$, '%chk_camp_meal_orders_four_eyes%');
UPDATE camp_meal_orders SET status = 'ACCEPTED', reviewed_by = 'aaaaaaaa-0000-0000-0000-0000000000a2', reviewed_at = now();
SELECT t_fail($$UPDATE camp_meal_order_lines SET extra_count = 10 WHERE meal_type = 'LUNCH'$$, 'CAMP_MEAL_LOCKED%');
SELECT t_fail($$DELETE FROM camp_meal_order_lines$$, 'CAMP_MEAL_LOCKED%');
SELECT t_fail($$UPDATE camp_meal_orders SET note = 'x'$$, 'CAMP_MEAL_LOCKED%');
SELECT t_fail($$DELETE FROM camp_meal_orders$$, 'CAMP_MEAL_LOCKED%');
-- хүн-өдөр = Σ(base+extra)/3 = (120 + 65 + 116) / 3 = 100.3333
SELECT t_eq((SELECT round(sum(base_count + extra_count)::numeric / 3, 4) FROM camp_meal_order_lines), 100.3333::numeric, 'хүн-өдөр тооцоо');
INSERT INTO camp_cost_entries (tenant_id, camp_id, cost_date, source, meal_order_id, service_type, contract_item_id, organization_id,
  quantity, unit, unit_price, vat_included, vat_rate, net_amount, vat_amount, gross_amount, created_by) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', '2026-10-10', 'MEAL', 'aaaaaaaa-5000-0000-0000-000000000001',
   'MEAL', 'aaaaaaaa-3100-0000-0000-000000000003', 'aaaaaaaa-1500-0000-0000-000000000004',
   100.3333, 'PERSON_DAY', 30000, false, 10, 3009999.00, 300999.90, 3310998.90, 'aaaaaaaa-0000-0000-0000-0000000000a2');
-- DRAFT захиалгыг (мөртэй нь) устгаж болно → мөрүүд CASCADE
INSERT INTO camp_meal_orders (id, tenant_id, camp_id, order_date) VALUES
  ('aaaaaaaa-5000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', '2026-10-11');
INSERT INTO camp_meal_order_lines (tenant_id, camp_id, order_id, meal_type, meal_location_id, base_count) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-5000-0000-0000-000000000002', 'BREAKFAST', 'aaaaaaaa-1100-0000-0000-000000000001', 5);
DELETE FROM camp_meal_orders WHERE id = 'aaaaaaaa-5000-0000-0000-000000000002';
SELECT t_eq((SELECT count(*) FROM camp_meal_order_lines WHERE order_id = 'aaaaaaaa-5000-0000-0000-000000000002')::int, 0, 'DRAFT захиалга устгахад мөр CASCADE');
COMMIT;

-- ── 8. Tenant тусгаарлалт (B context-оос A-г харахгүй) ────────
BEGIN;
SELECT set_config('app.tenant_id', 'bbbbbbbb-0000-0000-0000-000000000001', true);
SELECT t_eq((SELECT count(*) FROM camps)::int, 0, 'B → A-ийн кемп 0');
SELECT t_eq((SELECT count(*) FROM camp_cost_entries)::int, 0, 'B → A-ийн зардал 0');
SELECT t_eq((SELECT count(*) FROM camp_employees)::int, 0, 'B → A-ийн ажилтан 0');
SELECT t_eq((SELECT count(*) FROM camp_roles)::int, 3, 'B → өөрийн 3 роль');
UPDATE camp_employees SET full_name = 'hack';   -- 0 мөр
SELECT t_eq((SELECT count(*) FROM camp_employees)::int, 0, 'B UPDATE A-д хүрэхгүй');
INSERT INTO camps (id, tenant_id, code, name) VALUES ('bbbbbbbb-1000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'C1', 'B кемп');
-- B tenant A-ийн байршил/мастер руу FK-ээр холбогдож чадахгүй (D2) — RLS-ээс үл хамааран
SELECT t_fail($$INSERT INTO camp_meal_locations (tenant_id, camp_id, name) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'x')$$, '%fk_camp_meal_locations_camp%');
COMMIT;
RESET ROLE;

-- Superuser (RLS bypass)-ээр ч composite FK өөр tenant-ийн холбоосыг хориглоно (D2 — [RLS-004])
SELECT t_fail($$INSERT INTO camp_employees (tenant_id, camp_id, organization_id, department_id, employee_code, full_name) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-1000-0000-0000-000000000001', 'aaaaaaaa-1500-0000-0000-000000000001', 'aaaaaaaa-1200-0000-0000-000000000001', 'X1', 'x')$$, '%foreign key%');
SELECT t_fail($$INSERT INTO camp_haul_records (tenant_id, camp_id, record_no, haul_type, haul_date, transport_contract_item_id, disposal_contract_item_id, created_by) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-1000-0000-0000-000000000001', 'H', 'SEWAGE', '2026-10-09', 'aaaaaaaa-3100-0000-0000-000000000001', 'aaaaaaaa-3100-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-0000000000b1')$$, 'CAMP_HAUL_CONTRACT%');  -- trigger FK-ээс өмнө барина (гэрээ олдохгүй); FK нь нөөц хамгаалалт

-- ── 9. Policy/grant аудит: бүх camp_* хүснэгт ────────────────
SELECT t_eq((SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'camp%' AND c.relname <> 'camp_permissions'
               AND NOT (c.relrowsecurity AND c.relforcerowsecurity))::int, 0, 'бүх camp_* хүснэгт ENABLE+FORCE RLS');
SELECT t_eq((SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'camp%' AND c.relname <> 'camp_permissions'
               AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname AND p.permissive = 'PERMISSIVE' AND 'app_user' = ANY (p.roles)))::int,
            0, 'бүх camp_* хүснэгт PERMISSIVE TO app_user policy-тэй');
SELECT t_eq((SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'camp%' AND c.relname <> 'camp_permissions'
               AND NOT has_table_privilege('app_user', c.oid, 'SELECT,INSERT,UPDATE,DELETE'))::int, 0, 'бүх camp_* хүснэгт app_user GRANT');
SELECT t_eq((SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'camp%')::int, 31, '31 camp хүснэгт');
SELECT t_eq((SELECT count(*) FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name LIKE 'camp%' AND column_name = 'id' AND column_default <> 'uuid_generate_v7()')::int, 0, 'id default = uuid_generate_v7() (RULE-11)');

-- ── 10. Tenant устгах CASCADE (APPROVED haul, ACCEPTED хоол, зардал, CLOSED засвар, системийн роль) ──
DELETE FROM tenants WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT t_eq((SELECT count(*) FROM camp_cost_entries)::int + (SELECT count(*) FROM camp_roles WHERE tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001')::int
            + (SELECT count(*) FROM camp_haul_records)::int + (SELECT count(*) FROM camps WHERE tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001')::int,
            0, 'tenant устгахад бүх camp өгөгдөл CASCADE (хамгаалах trigger блоклохгүй)');
DELETE FROM tenants WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001';
DROP FUNCTION t_fail(text, text);
DROP FUNCTION t_eq(anyelement, anyelement, text);
\echo '==== CAMP SCHEMA TEST: ALL PASSED ===='
