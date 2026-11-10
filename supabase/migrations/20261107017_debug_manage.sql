-- ============================================================
-- v0.2.4 Блок 10 (D-1) — Debug цэсний үйлдэлтэй хэрэгсэл (кэш цэвэрлэх, outbox дахин илгээх).
-- OWNER-д runtime-аар (core.debug.view-тэй адил); бусдад tenant даяар шууд олголтоор. Үйлдэл бүр audit-тай.
-- ============================================================
INSERT INTO core_permissions (code, name, sort_order, module, available_in)
VALUES ('core.debug.manage', 'Debug үйлдэл (кэш цэвэрлэх, outbox дахин илгээх)', 901, 'core', 'v1')
ON CONFLICT (code) DO NOTHING;
