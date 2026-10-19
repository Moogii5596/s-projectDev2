-- ============================================================
-- v0.2.3 Блок D (S9, S11) — ажилтны «Мэдээлэл дутуу» тэмдэглэгээ (2026-10-19)
-- ============================================================
-- Tech plan: 12_v0.2.3_data_import.md §2 (S9, S11)
--
-- data_issues = [{ "field": "email|phone|extraPhones|terminatedAt", "code": "<алдааны код>", "value": "<эх утга>" }]
--   Импортын буруу утга (имэйл, утас) жинхэнэ талбарт ОРОХГҮЙ — энд хадгалагдаж, HR засна (талбарыг засахад арилна).
--   Статустай холбоогүй: ажилтан ACTIVE хэвээр (хоолны тоо, өрөө, эрх өөрчлөгдөхгүй).
-- S11: ажлаас гарсан (TERMINATED) бүртгэлд огноо тодорхойгүй байж болно — ЗӨВХӨН data_issues-д "terminatedAt" байвал.
--
-- Rollback:
--   ALTER TABLE camp_employees DROP CONSTRAINT ck_camp_employees_terminated;
--   ALTER TABLE camp_employees ADD CONSTRAINT ck_camp_employees_terminated CHECK (
--     (status = 'TERMINATED') = (terminated_at IS NOT NULL AND termination_reason IS NOT NULL));   -- огноогүй мөр байхгүй үед
--   ALTER TABLE camp_employees DROP COLUMN data_issues;
-- ============================================================

ALTER TABLE camp_employees
  ADD COLUMN data_issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD CONSTRAINT ck_camp_employees_data_issues CHECK (jsonb_typeof(data_issues) = 'array');

ALTER TABLE camp_employees DROP CONSTRAINT ck_camp_employees_terminated;
ALTER TABLE camp_employees ADD CONSTRAINT ck_camp_employees_terminated CHECK (
  (status = 'TERMINATED') = (
    termination_reason IS NOT NULL
    AND (terminated_at IS NOT NULL OR data_issues @> '[{"field": "terminatedAt"}]'::jsonb)
  )
);

-- «Мэдээлэл дутуу» шүүлтүүр
CREATE INDEX idx_camp_employees_data_issues ON camp_employees (tenant_id, camp_id) WHERE data_issues <> '[]'::jsonb;
