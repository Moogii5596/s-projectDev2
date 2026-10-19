-- ============================================================
-- DEV ONLY — Phase 3.3: cursor pagination хэмжилтэд 10,000 MR үүсгэх
-- ⚠️ Migration БИШ, `supabase db reset`-д автоматаар ажиллахгүй. Production-д ХЭЗЭЭ Ч бүү ажиллуул.
-- ============================================================
-- Ажиллуулах (repo root, local Supabase):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/dev/seed_perf_10k_mr.sql
-- psql байхгүй бол (PowerShell):
--   $db = docker ps --filter "name=^supabase_db_s-project$" --format "{{.Names}}"
--   Get-Content supabase/dev/seed_perf_10k_mr.sql -Raw | docker exec -i $db psql -U postgres -d postgres -v ON_ERROR_STOP=1
-- Устгах:
--   DELETE FROM mr_headers WHERE mr_number LIKE 'PERF-%';
-- Idempotent: дахин ажиллуулахад давхар үүсгэхгүй (tenant_id, mr_number unique).
-- ============================================================

BEGIN;

INSERT INTO mr_headers (tenant_id, mr_number, title, status, requester_id, total_amount, created_at, updated_at)
SELECT
  t.id,
  'PERF-' || lpad(g::text, 5, '0'),
  'Perf test MR #' || g,
  (ARRAY['DRAFT','PENDING_APPROVAL','APPROVED','REJECTED']::"MrStatus"[])[1 + g % 4],
  u.id,
  (g % 50 + 1) * 100000,
  -- 1 жилийн дотор тархсан, мөн ижил created_at-тай мөрүүд (cursor tie-break шалгах)
  now() - make_interval(mins => (g / 2) * 50),
  now()
FROM generate_series(1, 10000) AS g
CROSS JOIN LATERAL (SELECT id FROM tenants WHERE slug = 'test-tenant') t
CROSS JOIN LATERAL (
  SELECT id FROM core_users WHERE tenant_id = t.id ORDER BY created_at LIMIT 1
) u
ON CONFLICT (tenant_id, mr_number) DO NOTHING;

ANALYZE mr_headers;

SELECT count(*) AS perf_rows FROM mr_headers WHERE mr_number LIKE 'PERF-%';

COMMIT;
