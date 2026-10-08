-- ============================================================
-- 0004_add_native_enums.sql
-- Prisma-н native PostgreSQL enum type-уудыг үүсгэх
-- ЗАСВАРЫН ДАРААЛАЛ:
--   1. Partial index (WHERE текст харьцуулалттай) DROP
--   2. CHECK constraint-уудыг DROP
--   3. Enum type-уудыг CREATE
--   4. Column-уудыг тус тусдаа ALTER
--   5. Index-уудыг дахин CREATE
-- ============================================================

-- ── 1. Partial index-уудыг DROP (text WHERE clause-тай тул) ─
-- idx_outbox_events_status: WHERE status IN ('PENDING', 'FAILED') — text харьцуулалт
DROP INDEX IF EXISTS idx_outbox_events_status;
-- idx_mr_headers_status: WHERE clause байхгүй, гэхээд status column-тай тул урьдчилж drop
DROP INDEX IF EXISTS idx_mr_headers_status;

-- ── 2. CHECK constraint-уудыг DROP ──────────────────────────
ALTER TABLE tenants       DROP CONSTRAINT IF EXISTS tenants_tier_check;
ALTER TABLE core_users    DROP CONSTRAINT IF EXISTS core_users_role_check;
ALTER TABLE mr_headers    DROP CONSTRAINT IF EXISTS mr_headers_status_check;
ALTER TABLE outbox_events DROP CONSTRAINT IF EXISTS outbox_events_status_check;

-- ── 3. Native enum type-уудыг CREATE ────────────────────────
CREATE TYPE "TierType" AS ENUM ('tier1', 'tier2', 'tier3');
CREATE TYPE "UserRole" AS ENUM ('requester', 'approver', 'admin', 'viewer');
CREATE TYPE "MrStatus" AS ENUM (
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'PROVISIONALLY_APPROVED'
);
CREATE TYPE "OutboxStatus" AS ENUM (
  'PENDING',
  'PUBLISHED',
  'FAILED',
  'DEAD_LETTERED'
);

-- ── 4a. tenants.tier: TEXT → TierType ───────────────────────
ALTER TABLE tenants ALTER COLUMN tier DROP DEFAULT;
ALTER TABLE tenants ALTER COLUMN tier TYPE "TierType" USING tier::"TierType";
ALTER TABLE tenants ALTER COLUMN tier SET DEFAULT 'tier1'::"TierType";

-- ── 4b. core_users.role: TEXT → UserRole ────────────────────
ALTER TABLE core_users ALTER COLUMN role DROP DEFAULT;
ALTER TABLE core_users ALTER COLUMN role TYPE "UserRole" USING role::"UserRole";
ALTER TABLE core_users ALTER COLUMN role SET DEFAULT 'requester'::"UserRole";

-- ── 4c. mr_headers.status: TEXT → MrStatus ──────────────────
ALTER TABLE mr_headers ALTER COLUMN status DROP DEFAULT;
ALTER TABLE mr_headers ALTER COLUMN status TYPE "MrStatus" USING status::"MrStatus";
ALTER TABLE mr_headers ALTER COLUMN status SET DEFAULT 'DRAFT'::"MrStatus";

-- ── 4d. outbox_events.status: TEXT → OutboxStatus ───────────
ALTER TABLE outbox_events ALTER COLUMN status DROP DEFAULT;
ALTER TABLE outbox_events ALTER COLUMN status TYPE "OutboxStatus" USING status::"OutboxStatus";
ALTER TABLE outbox_events ALTER COLUMN status SET DEFAULT 'PENDING'::"OutboxStatus";

-- ── 5. Index-уудыг enum type-тай дахин CREATE ───────────────
CREATE INDEX IF NOT EXISTS idx_mr_headers_status
  ON mr_headers(tenant_id, status);

-- Partial index: enum value-тай харьцуулалт (implicit cast ажиллана)
CREATE INDEX IF NOT EXISTS idx_outbox_events_status
  ON outbox_events(status, next_retry_at)
  WHERE status IN ('PENDING', 'FAILED');

-- ── 6. Баталгаажуулалт ──────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole') THEN
    RAISE EXCEPTION 'UserRole enum type was not created!';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TierType') THEN
    RAISE EXCEPTION 'TierType enum type was not created!';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MrStatus') THEN
    RAISE EXCEPTION 'MrStatus enum type was not created!';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OutboxStatus') THEN
    RAISE EXCEPTION 'OutboxStatus enum type was not created!';
  END IF;
  RAISE NOTICE '✅ Native enum types created successfully';
END $$;
