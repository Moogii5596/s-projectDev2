-- ============================================================
-- v0.2.2 Блок 5 — ажлаас гаргах, дахин ажилд авах (Q8, Q-C, Q-C2, D-07; B5-Q2, B5-Q4) (2026-10-17)
-- ============================================================
-- Tech plan: 07_v0.2.2_tech_plan.md §3.6, §13
--
-- 1) camp_employees += terminated_at, termination_reason (код), termination_note, rehired_from_id
--    CHECK: TERMINATED ⇔ огноо + шалтгаантай; OTHER бол тайлбар заавал.
-- 2) Q-C2: ажилтны код — TERMINATED биш бүртгэлд л давтагдашгүй (partial unique index, нэр хэвээр `uq_camp_employees_code`).
--    ⚠️ Constraint сулруулалт. Нэг хуучин бүртгэлээс нэг л удаа дахин ажилд авна (uq_camp_employees_rehired_from).
-- 3) B5-Q2: шинэ эрх `camp.employee.terminate` — Кемп админы загварт (seed функц + одоо байгаа роль, олголт бүрт TEMPLATE мөр).
--
-- Rollback (давхардсан код байхгүй үед л — эхлээд шалгана):
--   SELECT tenant_id, employee_code FROM camp_employees GROUP BY 1,2 HAVING count(*) > 1;   -- 0 мөр байх ёстой
--   DROP INDEX uq_camp_employees_code;
--   ALTER TABLE camp_employees ADD CONSTRAINT uq_camp_employees_code UNIQUE (tenant_id, employee_code);
--   ALTER TABLE camp_employees DROP CONSTRAINT ck_camp_employees_terminated, DROP CONSTRAINT ck_camp_employees_termination_note,
--     DROP CONSTRAINT fk_camp_employees_rehired_from, DROP COLUMN terminated_at, DROP COLUMN termination_reason,
--     DROP COLUMN termination_note, DROP COLUMN rehired_from_id;   -- (TERMINATED мөрийг өмнө нь INACTIVE болгоно)
--   DROP TYPE "CampTerminationReason";
--   DELETE FROM camp_user_permissions WHERE permission_code = 'camp.employee.terminate';
--   DELETE FROM camp_role_permissions WHERE permission_code = 'camp.employee.terminate';
--   DELETE FROM camp_permissions WHERE code = 'camp.employee.terminate';
--   (camp_seed_default_roles-ийг 20261013003-ийн хувилбараар дахин үүсгэнэ)
-- ============================================================

CREATE TYPE "CampTerminationReason" AS ENUM ('RESIGNED', 'DISMISSED', 'CONTRACT_END', 'OTHER');

ALTER TABLE camp_employees
  ADD COLUMN terminated_at      DATE,
  ADD COLUMN termination_reason "CampTerminationReason",
  ADD COLUMN termination_note   TEXT,
  ADD COLUMN rehired_from_id    UUID,
  ADD CONSTRAINT ck_camp_employees_terminated CHECK (
    (status = 'TERMINATED') = (terminated_at IS NOT NULL AND termination_reason IS NOT NULL)
  ),
  ADD CONSTRAINT ck_camp_employees_termination_note CHECK (
    termination_reason IS DISTINCT FROM 'OTHER' OR btrim(coalesce(termination_note, '')) <> ''
  ),
  ADD CONSTRAINT fk_camp_employees_rehired_from FOREIGN KEY (tenant_id, rehired_from_id)
    REFERENCES camp_employees (tenant_id, id);

-- Нэг хуучин бүртгэлээс нэг л шинэ бүртгэл
CREATE UNIQUE INDEX uq_camp_employees_rehired_from ON camp_employees (tenant_id, rehired_from_id) WHERE rehired_from_id IS NOT NULL;

-- Q-C2: код давтагдашгүй — ажлаас гарсан бүртгэлээс бусдад (нэр хэвээр: алдааны мессеж, dev тест)
ALTER TABLE camp_employees DROP CONSTRAINT uq_camp_employees_code;
CREATE UNIQUE INDEX uq_camp_employees_code ON camp_employees (tenant_id, employee_code) WHERE status <> 'TERMINATED';
-- Кодоор хайх (импорт, ирц) — ажлаас гарсныг ч багтаана
CREATE INDEX idx_camp_employees_code ON camp_employees (tenant_id, employee_code);

-- ── 3. Эрх ───────────────────────────────────────────────────
INSERT INTO camp_permissions (code, name, sort_order) VALUES
  ('camp.employee.terminate', 'Ажлаас гаргах, дахин ажилд авах', 55)
ON CONFLICT (code) DO NOTHING;

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
      ('CAMP_ADMIN'::"CampRoleCode",     'Кемп админ',     'Тохиргоо, эрх, гэрээ, мастер өгөгдөл, засвар эхлүүлэх/хаах',
        ARRAY['camp.settings.manage','camp.roles.manage','camp.master.manage','camp.contract.manage',
              'camp.employee.manage','camp.room.manage','camp.asset.manage',
              'camp.movement.import','camp.shift.adjust','camp.maintenance.create','camp.report.view',
              'camp.maintenance.parts','camp.maintenance.close','camp.employee.terminate']),
      ('CAMP_MANAGER'::"CampRoleCode",   'Кемп менежер',   'Ирц, ээлж, батлах, хоолны захиалга',
        ARRAY['camp.movement.import','camp.shift.adjust','camp.haul.approve','camp.maintenance.close',
              'camp.meal.order','camp.maintenance.create','camp.report.view']),
      ('CATERING_ADMIN'::"CampRoleCode", 'Катеринг админ', 'Бохир ус/хог, сэлбэг, хоол хүлээн авах',
        ARRAY['camp.employee.manage','camp.room.manage','camp.asset.manage','camp.haul.create',
              'camp.maintenance.parts','camp.meal.accept','camp.maintenance.create','camp.report.view']),
      ('EMPLOYEE'::"CampRoleCode",       'Ажилтан',        'Өөрийн засварын хүсэлт (дараа: feed, хоолны гомдол, цэс)',
        ARRAY['camp.maintenance.create'])
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

-- Одоо байгаа Кемп админ роль ба түүний олголтууд (20261013003-ийн Q9-тэй ижил арга; snapshot-ийн хүлээгдэж буй нэмэлт)
INSERT INTO camp_role_permissions (tenant_id, role_id, permission_code)
SELECT r.tenant_id, r.id, 'camp.employee.terminate'
FROM camp_roles r
WHERE r.system_code = 'CAMP_ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO camp_user_permissions (tenant_id, user_id, permission_code, camp_id, source, user_role_id)
SELECT ur.tenant_id, ur.user_id, 'camp.employee.terminate', ur.camp_id, 'TEMPLATE', ur.id
FROM camp_user_roles ur
JOIN camp_roles r ON r.tenant_id = ur.tenant_id AND r.id = ur.role_id AND r.system_code = 'CAMP_ADMIN'
ON CONFLICT DO NOTHING;
