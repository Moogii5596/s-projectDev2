-- ============================================================
-- v0.2.3 Блок D — ажилтны нэр (ургийн овог / овог / нэр), нэмэлт утас, албан тушаалын код (2026-10-19)
-- ============================================================
-- Tech plan: 12_v0.2.3_data_import.md §2 (S1, S2, S4)
--
-- S1: full_name хадгалагдана (хайлт, тайлан, Кемп, экспорт) — trigger «овог + нэр»-ээс бүрдүүлнэ.
--     Хуучин клиент зөвхөн full_name өгвөл (first_name өөрчлөгдөөгүй) эхний зайгаар салгана.
-- S2: үндсэн утас = camp_employees.phone (хэвээр); НЭМЭЛТ дугаарууд = camp_employee_phones (sort_order-оор).
-- S4: camp_positions.code — ажлын байрны индекс (жнь 1322-11), давхардаж болно.
--
-- Rollback:
--   DROP TRIGGER trg_camp_employees_names ON camp_employees; DROP FUNCTION camp_employees_names();
--   DROP TABLE camp_employee_phones;
--   ALTER TABLE camp_employees DROP COLUMN family_name, DROP COLUMN last_name, DROP COLUMN first_name;
--   ALTER TABLE camp_positions DROP COLUMN code;
-- ============================================================

ALTER TABLE camp_employees
  ADD COLUMN family_name TEXT,
  ADD COLUMN last_name   TEXT,
  ADD COLUMN first_name  TEXT;

-- Одоо байгаа мөр: «Овог Нэр» → эхний үг = овог, үлдсэн = нэр; нэг үгтэй бол нэр
UPDATE camp_employees SET
  last_name  = CASE WHEN btrim(full_name) ~ '\s' THEN split_part(regexp_replace(btrim(full_name), '\s+', ' ', 'g'), ' ', 1) END,
  first_name = CASE WHEN btrim(full_name) ~ '\s'
                    THEN substr(regexp_replace(btrim(full_name), '\s+', ' ', 'g'), length(split_part(regexp_replace(btrim(full_name), '\s+', ' ', 'g'), ' ', 1)) + 2)
                    ELSE btrim(full_name) END;

ALTER TABLE camp_employees
  ALTER COLUMN first_name SET NOT NULL,
  ADD CONSTRAINT ck_camp_employees_first_name CHECK (btrim(first_name) <> '');

CREATE OR REPLACE FUNCTION camp_employees_names()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_full text;
BEGIN
  -- Хуучин урсгал: зөвхөн full_name өгсөн (нэр/овог өгөөгүй эсвэл өөрчлөгдөөгүй) → салгана
  IF NEW.first_name IS NULL
     OR (TG_OP = 'UPDATE' AND NEW.full_name IS DISTINCT FROM OLD.full_name
         AND NEW.first_name IS NOT DISTINCT FROM OLD.first_name
         AND NEW.last_name IS NOT DISTINCT FROM OLD.last_name) THEN
    v_full := regexp_replace(btrim(coalesce(NEW.full_name, '')), '\s+', ' ', 'g');
    IF v_full ~ ' ' THEN
      NEW.last_name  := split_part(v_full, ' ', 1);
      NEW.first_name := substr(v_full, length(NEW.last_name) + 2);
    ELSE
      NEW.last_name  := NULL;
      NEW.first_name := v_full;
    END IF;
  END IF;
  NEW.family_name := nullif(btrim(NEW.family_name), '');
  NEW.last_name   := nullif(btrim(NEW.last_name), '');
  NEW.first_name  := btrim(NEW.first_name);
  NEW.full_name   := concat_ws(' ', NEW.last_name, NEW.first_name);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_camp_employees_names
  BEFORE INSERT OR UPDATE OF full_name, family_name, last_name, first_name ON camp_employees
  FOR EACH ROW EXECUTE FUNCTION camp_employees_names();

-- ── Нэмэлт утас ───────────────────────────────────────────────
CREATE TABLE camp_employee_phones (
  id          UUID        NOT NULL PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id UUID        NOT NULL,
  phone       TEXT        NOT NULL,
  sort_order  SMALLINT    NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_camp_employee_phones_phone CHECK (phone ~ '^(\+[0-9]{8,15}|[0-9]{8})$'),
  CONSTRAINT uq_camp_employee_phones UNIQUE (tenant_id, employee_id, phone),
  FOREIGN KEY (tenant_id, employee_id) REFERENCES camp_employees (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX idx_camp_employee_phones_employee ON camp_employee_phones (tenant_id, employee_id, sort_order);
SELECT camp_apply_tenant_rls('camp_employee_phones');

-- ── Албан тушаалын код (ажлын байрны индекс) ──────────────────
ALTER TABLE camp_positions ADD COLUMN code TEXT;
