-- ============================================================
-- v0.2.2 Блок 2 — Нэвтрэх нэр (утас / username), нууц үг солих шаардлага, ажилтан ↔ хэрэглэгч (2026-10-12)
-- ============================================================
-- Tech plan: 07_v0.2.2_tech_plan.md §3.4 · ADR-003 §2.1–2.2 · D-10 (server-ээр нэвтрүүлэх), D-11, D-13
--
-- core_users.phone    — Монгол 8 оронтой (нормчилсон: зөвхөн цифр). NULL = утсаар нэвтрэхгүй.
-- core_users.username — жижиг үсэг [a-z0-9._-] (ажилтны кодоос, D-13). NULL = username-гүй.
--   Давтагдашгүй: зөвхөн ИДЭВХТЭЙ хэрэглэгчдийн дунд (идэвхгүй болсон хүний утсыг шинэ хүнд өгч болно).
-- core_users.must_change_password — true бол backend бусад API-г 403 PASSWORD_CHANGE_REQUIRED (D-06).
-- camp_employees.user_id — нэвтрэх эрх (1:1, NULL = нэвтрэх эрхгүй ажилтан).
-- camp_user_roles.source_position_id — албан тушаалын загвараас АВТОМАТААР үүссэн олголт (D-11):
--   албан тушаал солигдоход зөвхөн эдгээрийг солино; NULL = гараар олгосон (хадгалагдана).
--
-- Rollback (код v0.2.1/Блок 1 руу буцсаны дараа) — эхлээд файлын төгсгөлийн trigger-ийг:
--   ALTER TABLE camp_user_roles DROP COLUMN source_position_id;
--   ALTER TABLE camp_employees DROP COLUMN user_id;
--   ALTER TABLE core_users DROP COLUMN must_change_password, DROP COLUMN username, DROP COLUMN phone;
-- ============================================================

ALTER TABLE core_users
  ADD COLUMN phone                TEXT,
  ADD COLUMN username             TEXT,
  ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT ck_core_users_phone    CHECK (phone IS NULL OR phone ~ '^[0-9]{8}$'),
  ADD CONSTRAINT ck_core_users_username CHECK (username IS NULL OR username ~ '^[a-z0-9][a-z0-9._-]{1,63}$');

CREATE UNIQUE INDEX uq_core_users_phone_active    ON core_users (tenant_id, phone)    WHERE is_active AND phone IS NOT NULL;
CREATE UNIQUE INDEX uq_core_users_username_active ON core_users (tenant_id, username) WHERE is_active AND username IS NOT NULL;
-- Имэйлээр нэвтрэх: lower(email)-ээр хайна
CREATE INDEX idx_core_users_email_lower ON core_users (tenant_id, lower(email));

ALTER TABLE camp_employees
  ADD COLUMN user_id UUID,
  ADD CONSTRAINT fk_camp_employees_user FOREIGN KEY (tenant_id, user_id)
    REFERENCES core_users (tenant_id, id) ON DELETE SET NULL (user_id);
CREATE UNIQUE INDEX uq_camp_employees_user ON camp_employees (tenant_id, user_id) WHERE user_id IS NOT NULL;

ALTER TABLE camp_user_roles
  ADD COLUMN source_position_id UUID,
  ADD CONSTRAINT fk_camp_user_roles_source_position FOREIGN KEY (tenant_id, source_position_id)
    REFERENCES camp_positions (tenant_id, id) ON DELETE SET NULL (source_position_id);
CREATE INDEX idx_camp_user_roles_source_position ON camp_user_roles (tenant_id, user_id, source_position_id);

-- ── D-11: ажилтны албан тушаал / нэвтрэх эрх өөрчлөгдөхөд загвар хуулах ──────────
-- Бүх замыг хамарна (ажилтан засах, бөөнөөр засах, Excel импорт, холбох API).
-- Зөвхөн source_position_id-тай (автомат) олголтыг солино; гараар олгосон роль / шууд эрх ХӨНДӨХГҮЙ.
-- Ижил роль × кемп гараар аль хэдийн олгогдсон бол ON CONFLICT DO NOTHING (гарын олголт хэвээр).
-- SECURITY INVOKER: app_user-ийн RLS (app.tenant_id) хэвээр.
-- Rollback: DROP TRIGGER trg_camp_employees_position_roles ON camp_employees; DROP FUNCTION camp_employees_sync_position_roles();
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
    DELETE FROM camp_user_roles
    WHERE tenant_id = OLD.tenant_id AND user_id = OLD.user_id AND source_position_id IS NOT NULL;
  END IF;
  IF NEW.user_id IS NOT NULL AND NEW.position_id IS NOT NULL THEN
    INSERT INTO camp_user_roles (tenant_id, user_id, role_id, camp_id, source_position_id)
    SELECT NEW.tenant_id, NEW.user_id, t.role_id,
           CASE WHEN t.scope = 'ALL_CAMPS' THEN NULL ELSE NEW.camp_id END,
           NEW.position_id
    FROM camp_position_role_templates t
    WHERE t.tenant_id = NEW.tenant_id AND t.position_id = NEW.position_id
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_camp_employees_position_roles
  AFTER INSERT OR UPDATE OF position_id, user_id, camp_id ON camp_employees
  FOR EACH ROW EXECUTE FUNCTION camp_employees_sync_position_roles();
