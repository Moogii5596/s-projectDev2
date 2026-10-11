-- ============================================================
-- v0.2.1 (C-01, C-04) — Ажилтан: албан тушаал (каталог), ажлын хоолны байршил, хоол авах эсэх (эцсийн утга)
-- ============================================================
-- Д-3: одоогийн өгөгдлийг шилжүүлнэ — хоолны тоо ЯГ хэвээр (staging A = B):
--   meal_location_id = хэлтсийн одоогийн байршил; meals_included = NULL (= тийм);
--   чөлөөт `position` текстээс каталог үүсгэж position_id холбоно (`position` текст хадгалагдана — v0.2.2-т устгана).
-- ============================================================

ALTER TABLE camp_employees
  ADD COLUMN position_id      UUID,
  ADD COLUMN meal_location_id UUID,
  ADD COLUMN meals_included   BOOLEAN,
  ADD CONSTRAINT fk_camp_employees_position FOREIGN KEY (tenant_id, position_id) REFERENCES camp_positions (tenant_id, id),
  ADD CONSTRAINT fk_camp_employees_meal_location FOREIGN KEY (tenant_id, camp_id, meal_location_id)
    REFERENCES camp_meal_locations (tenant_id, camp_id, id);
CREATE INDEX idx_camp_employees_position ON camp_employees (tenant_id, position_id) WHERE position_id IS NOT NULL;

-- Backfill: каталог. Давхардлыг жижиг/том үсэг, илүү зайгаар нэгтгэнэ. Нэр = хамгийн олон ажилтанд байгаа хэлбэр
-- (тэнцвэл том үсэгтэй, дараа нь хамгийн эрт бичигдсэн) — жнь " жолооч"×1, "Жолооч"×5 → "Жолооч".
-- lower() кирилл үсгийг DB-ийн locale-оор (C.UTF-8 / en_US.UTF-8) жижигрүүлнэ.
WITH v AS (
  SELECT tenant_id, btrim(left(regexp_replace(btrim(position), '\s+', ' ', 'g'), 100)) AS name, count(*) AS n, min(created_at) AS first_at
  FROM camp_employees
  WHERE position IS NOT NULL AND btrim(position) <> ''
  GROUP BY 1, 2
)
INSERT INTO camp_positions (tenant_id, name)
SELECT DISTINCT ON (tenant_id, lower(name)) tenant_id, name
FROM v
ORDER BY tenant_id, lower(name), n DESC, (name <> lower(name)) DESC, first_at
ON CONFLICT DO NOTHING;

UPDATE camp_employees e SET position_id = p.id
FROM camp_positions p
WHERE p.tenant_id = e.tenant_id AND e.position IS NOT NULL AND btrim(e.position) <> ''
  AND lower(btrim(p.name)) = lower(btrim(left(regexp_replace(btrim(e.position), '\s+', ' ', 'g'), 100)));

UPDATE camp_employees e SET meal_location_id = d.meal_location_id
FROM camp_departments d
WHERE d.tenant_id = e.tenant_id AND d.camp_id = e.camp_id AND d.id = e.department_id AND e.meal_location_id IS NULL;
