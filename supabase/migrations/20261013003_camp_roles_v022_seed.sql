-- ============================================================
-- v0.2.2 Блок 1 — "Ажилтан" загвар (Q-E) + Кемп админд засвар эхлүүлэх/хаах (Q9, Q-D) (2026-10-12)
-- ============================================================
-- Tech plan: 07_v0.2.2_tech_plan.md §3.2, §3.7 (Блок 1-д нэгтгэсэн; дугаар шилжсэн — §3 тэмдэглэл)
-- 20261013001-ээс ТУСДАА: эрхийн зөрүү (§5.2) зөвхөн энэ файлаас гарна.
--
-- 1) camp_seed_default_roles: шинэ tenant-д 4 роль (EMPLOYEE нэмэгдсэн), Кемп админд parts + close.
-- 2) Одоо байгаа tenant бүрт EMPLOYEE роль (seed idempotent — байгаа ролийг өөрчлөхгүй).
-- 3) Q9: одоо байгаа Кемп админ роль (system_code = CAMP_ADMIN) += camp.maintenance.parts, camp.maintenance.close
--    + тухайн рольтой олголт бүрт TEMPLATE мөр (хэрэглэгчид шууд хэрэгжинэ — хэрэглэгчийн шийдвэр Q9).
--
-- Rollback: DELETE FROM camp_user_permissions up USING camp_user_roles ur, camp_roles r
--             WHERE up.user_role_id = ur.id AND ur.role_id = r.id AND r.system_code = 'CAMP_ADMIN'
--               AND up.permission_code IN ('camp.maintenance.parts','camp.maintenance.close');
--           DELETE FROM camp_role_permissions rp USING camp_roles r WHERE rp.role_id = r.id
--               AND r.system_code = 'CAMP_ADMIN' AND rp.permission_code IN ('camp.maintenance.parts','camp.maintenance.close');
--           (⚠️ админ гараар нэмсэн байсан бол тэр нь ч хасагдана — rollback-аас өмнө snapshot)
--           EMPLOYEE роль: системийн роль тул устгахгүй (хоосон/хор хөнөөлгүй).
-- ============================================================

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
              'camp.maintenance.parts','camp.maintenance.close']),
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

-- 2) EMPLOYEE роль одоо байгаа tenant-д.
--    ⚠️ Tenant-д "Ажилтан" нэртэй (системийн биш) роль аль хэдийн байвал uq_camp_roles_tenant_name зөрчигдөнө →
--       тэр tenant-д "Ажилтан (систем)" нэрээр үүсгэнэ.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT id FROM tenants LOOP
    IF EXISTS (SELECT 1 FROM camp_roles WHERE tenant_id = t.id AND name = 'Ажилтан'
               AND system_code IS DISTINCT FROM 'EMPLOYEE') THEN
      INSERT INTO camp_roles (tenant_id, name, description, is_system, system_code)
      VALUES (t.id, 'Ажилтан (систем)', 'Өөрийн засварын хүсэлт (дараа: feed, хоолны гомдол, цэс)', true, 'EMPLOYEE')
      ON CONFLICT (tenant_id, system_code) DO NOTHING;
      INSERT INTO camp_role_permissions (tenant_id, role_id, permission_code)
      SELECT t.id, r.id, 'camp.maintenance.create' FROM camp_roles r
      WHERE r.tenant_id = t.id AND r.system_code = 'EMPLOYEE'
      ON CONFLICT DO NOTHING;
    ELSE
      PERFORM camp_seed_default_roles(t.id);
    END IF;
  END LOOP;
END $$;

-- 3) Q9 — одоо байгаа Кемп админ роль ба түүний олголтууд
INSERT INTO camp_role_permissions (tenant_id, role_id, permission_code)
SELECT r.tenant_id, r.id, p.code
FROM camp_roles r
CROSS JOIN (VALUES ('camp.maintenance.parts'), ('camp.maintenance.close')) AS p(code)
WHERE r.system_code = 'CAMP_ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO camp_user_permissions (tenant_id, user_id, permission_code, camp_id, source, user_role_id)
SELECT ur.tenant_id, ur.user_id, p.code, ur.camp_id, 'TEMPLATE', ur.id
FROM camp_user_roles ur
JOIN camp_roles r ON r.tenant_id = ur.tenant_id AND r.id = ur.role_id AND r.system_code = 'CAMP_ADMIN'
CROSS JOIN (VALUES ('camp.maintenance.parts'), ('camp.maintenance.close')) AS p(code)
ON CONFLICT DO NOTHING;
