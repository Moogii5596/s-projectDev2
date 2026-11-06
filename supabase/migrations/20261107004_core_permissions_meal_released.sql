-- ============================================================
-- v0.2.3 Блок 6а — хоолны захиалгын эрхүүд гарсан (V2 → v1) (2026-11-07)
-- ============================================================
-- `camp.meal.order`, `camp.meal.accept` — хоолны захиалга v0.2.3-д орсон тул UI-д «удахгүй» биш.
-- Кодын тал: permission-registry.ts V2_CODES-оос хасав. Эрх шалгалт өөрчлөгдөхгүй (зөвхөн харагдац).
-- Rollback: UPDATE core_permissions SET available_in = 'v2' WHERE code IN ('camp.meal.order', 'camp.meal.accept');
-- ============================================================

UPDATE core_permissions SET available_in = 'v1' WHERE code IN ('camp.meal.order', 'camp.meal.accept');
