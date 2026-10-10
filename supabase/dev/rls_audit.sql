-- ============================================================
-- Phase 4.8.1 — RLS аудит (ЗӨВХӨН УНШИНА, юу ч өөрчлөхгүй) — 2026-10-10
-- ============================================================
-- Ажиллуулах (PowerShell, [ENV-009] — pipe ХЭРЭГЛЭХГҮЙ):
--   $db = docker ps --filter "name=supabase_db" --format "{{.Names}}"
--   docker cp supabase/dev/rls_audit.sql "${db}:/tmp/rls_audit.sql"
--   docker exec -e PGPASSWORD=postgres $db psql -h 127.0.0.1 -U supabase_admin -d postgres -f /tmp/rls_audit.sql > rls_audit.txt
-- Үр дүнгийн rls_audit.txt файлыг илгээнэ үү.
-- ============================================================
\pset pager off
\pset footer off

\echo '=== 1. Role-ууд (BYPASSRLS = RLS-ийг алгасна) ==='
SELECT rolname, rolsuper AS super, rolbypassrls AS bypassrls, rolcanlogin AS login, rolinherit AS inherit
FROM pg_roles
WHERE rolname IN ('postgres', 'app_user', 'supabase_admin', 'authenticated', 'anon', 'service_role', 'authenticator')
ORDER BY rolname;

\echo '=== 2. app_user-ийн гишүүнчлэл (хэн SET ROLE app_user хийж чадах) ==='
SELECT r.rolname AS role, m.rolname AS member
FROM pg_auth_members am
JOIN pg_roles r ON r.oid = am.roleid
JOIN pg_roles m ON m.oid = am.member
WHERE r.rolname = 'app_user' OR m.rolname = 'app_user'
ORDER BY 1, 2;

\echo '=== 3. public хүснэгт бүр: RLS, policy (app_user-д хамаарах), app_user-ийн эрх, дүгнэлт ==='
WITH t AS (
  SELECT c.oid, c.relname,
         c.relrowsecurity AS rls,
         c.relforcerowsecurity AS force,
         EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped) AS has_tenant
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
),
p AS (
  SELECT pol.polrelid AS oid,
         count(*) FILTER (WHERE pol.polpermissive) AS permissive,
         count(*) FILTER (WHERE NOT pol.polpermissive) AS restrictive,
         string_agg(pol.polname || CASE WHEN pol.polpermissive THEN '(P)' ELSE '(R)' END, ', ' ORDER BY pol.polname) AS names
  FROM pg_policy pol
  WHERE pol.polroles = '{0}'::oid[]                                   -- PUBLIC
     OR (SELECT oid FROM pg_roles WHERE rolname = 'app_user') = ANY (pol.polroles)
  GROUP BY pol.polrelid
)
SELECT t.relname AS table_name,
       t.has_tenant AS tenant_id,
       t.rls, t.force,
       coalesce(p.permissive, 0) AS perm,
       coalesce(p.restrictive, 0) AS restr,
       has_table_privilege('app_user', t.oid, 'SELECT') AS sel,
       has_table_privilege('app_user', t.oid, 'INSERT') AS ins,
       has_table_privilege('app_user', t.oid, 'UPDATE') AS upd,
       has_table_privilege('app_user', t.oid, 'DELETE') AS del,
       CASE
         WHEN NOT has_table_privilege('app_user', t.oid, 'SELECT') THEN 'NO_GRANT'
         WHEN t.has_tenant AND NOT t.rls THEN 'NO_RLS'
         WHEN t.has_tenant AND coalesce(p.permissive, 0) = 0 THEN 'ZERO_ROWS(no permissive)'
         WHEN t.has_tenant AND NOT t.force THEN 'OK(no FORCE)'
         WHEN t.has_tenant THEN 'OK'
         ELSE 'GLOBAL(tenant_id-gui)'
       END AS verdict,
       coalesce(p.names, '') AS policies
FROM t LEFT JOIN p ON p.oid = t.oid
ORDER BY verdict, t.relname;

\echo '=== 4. app_user-ийн sequence эрх (serial/identity багана) ==='
SELECT c.relname AS sequence_name,
       has_sequence_privilege('app_user', c.oid, 'USAGE') AS usage
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'S'
ORDER BY 1;

\echo '=== 5. app_user-ийн function EXECUTE эрх (default / trigger-т ашиглагддаг) ==='
SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS func,
       p.prosecdef AS security_definer,
       has_function_privilege('app_user', p.oid, 'EXECUTE') AS exec
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')  -- extension-ий функц биш
ORDER BY exec, 1;

\echo '=== 6. Schema USAGE ==='
SELECT nspname AS schema_name, has_schema_privilege('app_user', oid, 'USAGE') AS usage
FROM pg_namespace WHERE nspname IN ('public', 'extensions', 'auth') ORDER BY 1;

\echo '=== 7. Policy-ийн нөхцөл (tenant_id-тай, app_user/PUBLIC-д хамаарах) ==='
SELECT c.relname AS table_name, pol.polname, CASE WHEN pol.polpermissive THEN 'P' ELSE 'R' END AS kind,
       pol.polcmd AS cmd,
       pg_get_expr(pol.polqual, pol.polrelid) AS using_expr,
       pg_get_expr(pol.polwithcheck, pol.polrelid) AS check_expr
FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND (pol.polroles = '{0}'::oid[] OR (SELECT oid FROM pg_roles WHERE rolname = 'app_user') = ANY (pol.polroles))
ORDER BY 1, 2;

\echo '=== 8. Хураангуй ==='
WITH t AS (
  SELECT c.oid, c.relrowsecurity AS rls,
         EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped) AS has_tenant,
         EXISTS (SELECT 1 FROM pg_policy pol WHERE pol.polrelid = c.oid AND pol.polpermissive
                   AND (pol.polroles = '{0}'::oid[] OR (SELECT oid FROM pg_roles WHERE rolname = 'app_user') = ANY (pol.polroles))) AS has_perm
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
)
SELECT count(*) AS tables,
       count(*) FILTER (WHERE has_tenant) AS tenant_tables,
       count(*) FILTER (WHERE has_tenant AND rls AND has_perm AND has_table_privilege('app_user', oid, 'SELECT')) AS tenant_ok,
       count(*) FILTER (WHERE NOT has_table_privilege('app_user', oid, 'SELECT')) AS no_grant,
       count(*) FILTER (WHERE has_tenant AND NOT has_perm) AS no_permissive
FROM t;
