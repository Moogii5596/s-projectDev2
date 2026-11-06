-- ============================================================
-- v0.2.3 Блок 6а — Хоолны захиалга: тохиргоотой урсгал (V2-03, G-2, G-6, G-8) (2026-11-07)
-- ============================================================
-- Tech plan: 09_v0.2.3_tech_plan.md Блок 6а. Хэрэглэгч батлав (2026-11-07 02:55).
--
-- Шийдвэр:
--   - Урсгалын дүрэм кодод биш, `camp_settings`-д (G-8): cutoff өмнөх өдөр, cutoff-оос хойш (BLOCK/APPROVAL/FREE),
--     хүлээн авах шаардлагатай эсэх, хүлээн авсны дараах засвар (FORBID/ALLOW/TWO_SIDED), анхдагч тоо, өөрөө хүлээн авах.
--   - Хоолны гэрээ заавал биш (6б-д гэрээ хийгдэнэ; нэхэмжлэх тоо = захиалга, G-2) → chk_camp_meal_orders_contract хасав.
--   - four_eyes CHECK хасав → app код `meal_order_allow_self_accept`-ээр шалгана.
--   - TWO_SIDED: санал болгосон мөрүүд `pending_lines` JSONB-д (CHANGE_REQUESTED), хүлээн авагч зөвшөөрвөл мөрүүдэд хэрэглэнэ.
--   - Түгжээ: ACCEPTED/CHANGE_REQUESTED/REJECTED захиалга ба мөр, зочин/нэмэлт мөр — service `app.meal_order_edit=1`
--     (tx-local set_config) тавьсан үед л өөрчлөгдөнө. Бодлого (хэн, хэзээ) = MealOrderPolicyService.
--   - Зочин/нэмэлт хоол: тусдаа `camp_meal_order_extras` (тайлбар заавал, хэн оруулсан). `camp_meal_order_lines.extra_*`
--     хуучин талбар — хэрэглэхгүй (0/NULL үлдэнэ).
--
-- Rollback:
--   DROP TABLE camp_meal_order_templates, camp_meal_order_extras;
--   ALTER TABLE camp_meal_orders DROP COLUMN is_late, DROP COLUMN pending_lines, DROP COLUMN change_reason,
--     DROP COLUMN revision_no, DROP COLUMN revised_at;
--   ALTER TABLE camp_settings DROP COLUMN meal_order_lead_days, DROP COLUMN meal_order_after_cutoff,
--     DROP COLUMN meal_order_requires_accept, DROP COLUMN meal_order_edit_after_accept,
--     DROP COLUMN meal_order_default_fill, DROP COLUMN meal_order_allow_self_accept;
--   (chk_* буцаах + guard функцийг 20261009006-ийн хувилбараар сэргээх)
-- ============================================================

-- ── 1. Тохиргоо (кемп бүрт) ──────────────────────────────────
ALTER TABLE camp_settings
  ADD COLUMN meal_order_lead_days          SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN meal_order_after_cutoff       TEXT     NOT NULL DEFAULT 'BLOCK',
  ADD COLUMN meal_order_requires_accept    BOOLEAN  NOT NULL DEFAULT true,
  ADD COLUMN meal_order_edit_after_accept  TEXT     NOT NULL DEFAULT 'FORBID',
  ADD COLUMN meal_order_default_fill       TEXT     NOT NULL DEFAULT 'EMPTY',
  ADD COLUMN meal_order_allow_self_accept  BOOLEAN  NOT NULL DEFAULT false,
  ADD CONSTRAINT chk_camp_settings_meal_lead  CHECK (meal_order_lead_days BETWEEN 0 AND 30),
  ADD CONSTRAINT chk_camp_settings_meal_after CHECK (meal_order_after_cutoff IN ('BLOCK', 'APPROVAL', 'FREE')),
  ADD CONSTRAINT chk_camp_settings_meal_edit  CHECK (meal_order_edit_after_accept IN ('FORBID', 'ALLOW', 'TWO_SIDED')),
  ADD CONSTRAINT chk_camp_settings_meal_fill  CHECK (meal_order_default_fill IN ('EMPTY', 'COPY_PREV', 'TEMPLATE'));

-- ── 2. Захиалга: хатуу кодтой CHECK-ийг хасаж, шинэ талбар ───
ALTER TABLE camp_meal_orders
  DROP CONSTRAINT chk_camp_meal_orders_contract,
  DROP CONSTRAINT chk_camp_meal_orders_four_eyes,
  DROP CONSTRAINT chk_camp_meal_orders_reviewed,
  ADD COLUMN is_late        BOOLEAN     NOT NULL DEFAULT false,     -- cutoff-оос хойш илгээсэн (APPROVAL горим)
  ADD COLUMN pending_lines  JSONB,                                  -- TWO_SIDED: санал болгосон мөрүүд
  ADD COLUMN change_reason  TEXT,
  ADD COLUMN revision_no    SMALLINT    NOT NULL DEFAULT 0,         -- хүлээн авсны дараах засварын тоо
  ADD COLUMN revised_at     TIMESTAMPTZ,
  ADD CONSTRAINT chk_camp_meal_orders_reviewed CHECK (
    (status IN ('ACCEPTED', 'REJECTED', 'CHANGE_REQUESTED')) = (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  ADD CONSTRAINT chk_camp_meal_orders_pending CHECK (
    (status = 'CHANGE_REQUESTED') = (pending_lines IS NOT NULL)),
  ADD CONSTRAINT chk_camp_meal_orders_pending_json CHECK (
    pending_lines IS NULL OR jsonb_typeof(pending_lines) = 'array');

-- ── 3. Зочин / нэмэлт хоол (гараар) ──────────────────────────
CREATE TABLE camp_meal_order_extras (
  id                UUID           NOT NULL PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id         UUID           NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camp_id           UUID           NOT NULL,
  order_id          UUID           NOT NULL,
  meal_type         "CampMealType" NOT NULL,
  meal_location_id  UUID           NOT NULL,
  guest_count       INTEGER        NOT NULL,
  note              TEXT           NOT NULL,                -- зочин / нэмэлтийн тайлбар (заавал)
  created_by        UUID           NOT NULL,                -- core_users.id (R13)
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT clock_timestamp(),
  updated_at        TIMESTAMPTZ    NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT chk_camp_meal_extras_count CHECK (guest_count > 0),
  CONSTRAINT chk_camp_meal_extras_note  CHECK (btrim(note) <> ''),
  CONSTRAINT fk_camp_meal_extras_order FOREIGN KEY (tenant_id, camp_id, order_id)
    REFERENCES camp_meal_orders (tenant_id, camp_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_camp_meal_extras_location FOREIGN KEY (tenant_id, camp_id, meal_location_id)
    REFERENCES camp_meal_locations (tenant_id, camp_id, id),
  CONSTRAINT fk_camp_meal_extras_created_by FOREIGN KEY (tenant_id, created_by)
    REFERENCES core_users (tenant_id, id)
);
CREATE INDEX idx_camp_meal_extras_order ON camp_meal_order_extras (tenant_id, order_id);
SELECT camp_apply_tenant_rls('camp_meal_order_extras');

-- ── 4. Тогтмол загвар (анхдагч тоо: TEMPLATE горим) ──────────
CREATE TABLE camp_meal_order_templates (
  id                UUID           NOT NULL PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id         UUID           NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camp_id           UUID           NOT NULL,
  meal_type         "CampMealType" NOT NULL,
  meal_location_id  UUID           NOT NULL,
  base_count        INTEGER        NOT NULL,
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT clock_timestamp(),
  updated_at        TIMESTAMPTZ    NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT chk_camp_meal_tpl_count CHECK (base_count >= 0),
  CONSTRAINT uq_camp_meal_tpl UNIQUE (tenant_id, camp_id, meal_type, meal_location_id),
  CONSTRAINT fk_camp_meal_tpl_camp FOREIGN KEY (tenant_id, camp_id)
    REFERENCES camps (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_camp_meal_tpl_location FOREIGN KEY (tenant_id, camp_id, meal_location_id)
    REFERENCES camp_meal_locations (tenant_id, camp_id, id)
);
SELECT camp_apply_tenant_rls('camp_meal_order_templates');

-- ── 5. Guard trigger-ууд ─────────────────────────────────────
-- app.meal_order_edit=1 (tx-local set_config, зөвхөн MealOrderPolicyService) → түгжээг тойрно.
CREATE OR REPLACE FUNCTION camp_meal_edit_allowed() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.meal_order_edit', true), '') = '1'
$$;

CREATE OR REPLACE FUNCTION camp_meal_orders_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_service "CampServiceType";
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('ACCEPTED', 'CHANGE_REQUESTED') AND camp_tenant_exists(OLD.tenant_id) AND NOT camp_meal_edit_allowed() THEN
      RAISE EXCEPTION 'CAMP_MEAL_LOCKED: хүлээн авсан захиалгыг устгах боломжгүй (%)', OLD.order_date
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('ACCEPTED', 'CHANGE_REQUESTED') AND NOT camp_meal_edit_allowed() THEN
    RAISE EXCEPTION 'CAMP_MEAL_LOCKED: хүлээн авсан захиалгыг өөрчлөх боломжгүй (%)', OLD.order_date
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.meal_contract_item_id IS NOT NULL THEN
    SELECT service_type INTO v_service FROM camp_contract_items
     WHERE tenant_id = NEW.tenant_id AND id = NEW.meal_contract_item_id;
    IF v_service IS DISTINCT FROM 'MEAL' THEN
      RAISE EXCEPTION 'CAMP_MEAL_CONTRACT: хоолны (MEAL) гэрээ сонгоно уу (%)', v_service
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Мөр, зочин/нэмэлт мөр: захиалга шийдвэрлэгдсэн/хүлээн авсан бол өөрчлөхгүй (service тойрно)
CREATE OR REPLACE FUNCTION camp_meal_order_lines_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_tenant uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
  v_status "CampMealOrderStatus";
BEGIN
  IF TG_OP = 'DELETE' AND NOT camp_tenant_exists(v_tenant) THEN
    RETURN OLD;
  END IF;
  SELECT status INTO v_status FROM camp_meal_orders
   WHERE tenant_id = v_tenant AND id = COALESCE(OLD.order_id, NEW.order_id);
  -- v_status NULL = эх захиалга устгагдаж буй CASCADE → зөвшөөрнө
  IF v_status IN ('ACCEPTED', 'REJECTED', 'CHANGE_REQUESTED') AND NOT camp_meal_edit_allowed() THEN
    RAISE EXCEPTION 'CAMP_MEAL_LOCKED: шийдвэрлэгдсэн захиалгын мөрийг өөрчлөх боломжгүй'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.order_id <> OLD.order_id THEN
    RAISE EXCEPTION 'CAMP_MEAL_LOCKED: мөрийг өөр захиалга руу шилжүүлэх боломжгүй'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_camp_meal_order_extras_guard
  BEFORE INSERT OR UPDATE OR DELETE ON camp_meal_order_extras
  FOR EACH ROW EXECUTE FUNCTION camp_meal_order_lines_guard();
