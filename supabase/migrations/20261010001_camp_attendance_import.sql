-- ============================================================
-- Camp Module · Шат 3.0 — Ирц импорт + ростерын тодруулга (2026-10-09)
-- ============================================================
-- 1) camp_movement_imports.parsed_rows — PREVIEW-д задалсан мөрүүдийг хадгална, CONFIRM нь эндээс уншина
--    (Redis биш DB: найдвартай, transaction-тай). Мөр бүр: {row, employeeId, employeeCode, date, direction,
--    kind, meals[], shift|null, errors[]}
-- 2) Ростер (хэрэглэгчийн тодруулга 2026-10-09): 14 ажлын өдөр; ирэх/явах замын хоног АМРАЛТЫН 14 хоногт орно.
--    Ростерын өдөр: 0 = ирэх (Лхагва, оройн хоол), 1..on = ажлын өдөр (Пүрэв..Лхагва), on+1 = явах (Пүрэв, өглөөний хоол).
--    → амралт дор хаяж 2 хоног (ирэх + явах) — roster_off_days >= 2.
-- ============================================================

ALTER TABLE camp_movement_imports
  ADD COLUMN parsed_rows JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE camp_settings DROP CONSTRAINT IF EXISTS camp_settings_roster_off_days_check;
ALTER TABLE camp_settings ADD CONSTRAINT camp_settings_roster_off_days_check CHECK (roster_off_days BETWEEN 2 AND 28);
