# Sprint 6 — Schema-per-Tenant DB Isolation (v0.1.5.1)

> ⛔ **ОРЛОГДСОН (2026-10-08) — ADR-001, шийдвэр B.** Schema-per-tenant цуцлагдаж, хэрэгжүүлсэн код хасагдсан.
> Shared = RLS, Enterprise VPC = тусдаа DB + `DEPLOYMENT_MODE=dedicated`.
> Үз: `docs/02_System_Architecture/ADR-001_Tenant_Isolation.md`, `docs/07_Tech_Stack_and_Environment/03_Enterprise_VPC_Deployment.md`.
> Доорх агуулга зөвхөн түүхэн лавлагаа.

> **Зорилго:** Enterprise tenant бүрт тусдаа PostgreSQL schema үүсгэж, RLS-оос өндөр түвшний тусгаарлалт хангах
> **Working dir:** `apps/core-kernel/` + `supabase/migrations/`
> **Хамаарал:** v0.1.0 бүрэн дууссан байх ёстой

---

## Яагаад Schema Isolation Хэрэгтэй вэ?

| | Shared Schema (v0.1.0) | Schema-per-Tenant (v0.1.5) |
|---|---|---|
| Тусгаарлалт | RLS policy-д тулгуурлана | PostgreSQL schema boundary |
| Алдааны эрсдэл | RLS алдааны үед data leak боломжтой | Schema-ийн хил давахгүй |
| Enterprise шаардлага | ❌ SOC2/ISO27001 хэрэгтэй байгуулагуудад хангалтгүй | ✅ Audit-д тэнцэнэ |
| Tenant тоо | Хязгааргүй | Enterprise tier — цөөн, том tenant |
| Migration | Нэг migration бүгдэд | Tenant тус бүрт тусдаа migration |

**Шийдэл:** Shared tenant-ууд (SMB) → `public` schema (RLS хэвээр)
Enterprise tenant-ууд → `tenant_<uuid_prefix>` schema (dedicated)

---

## Алхам 6.1 — Schema Provisioning SQL Function

- [ ] `supabase/migrations/YYYYMMDD_schema_provisioning.sql`:

```sql
-- Enterprise tenant-д тусдаа schema үүсгэх function
-- RULE-11: uuid_generate_v7() | RULE-12: FORCE + RESTRICTIVE

-- Tenant tier enum нэмэх
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'shared'
  CHECK (tier IN ('shared', 'enterprise'));
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS schema_name TEXT;

-- Schema provisioning function
CREATE OR REPLACE FUNCTION provision_tenant_schema(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schema_name TEXT;
  v_short_id    TEXT;
BEGIN
  -- UUID-н эхний 8 тэмдэгтийг ашиглана (collision маш бага)
  v_short_id    := REPLACE(LEFT(p_tenant_id::TEXT, 8), '-', '');
  v_schema_name := 'tenant_' || v_short_id;

  -- Schema үүсгэх (байгаа бол алгасна)
  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', v_schema_name);

  -- Хэрэглэгчид эрх олгох
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO s_project_app_user', v_schema_name);
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO s_project_app_user', v_schema_name);

  -- tenants хүснэгтэд schema_name хадгалах
  UPDATE tenants SET schema_name = v_schema_name WHERE id = p_tenant_id;

  RETURN v_schema_name;
END;
$$;

-- Schema доторх хүснэгтүүдийг public-оос хуулах function
CREATE OR REPLACE FUNCTION clone_tables_to_schema(
  p_schema_name TEXT,
  p_tenant_id   UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- mr_headers хуулах
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.mr_headers (LIKE public.mr_headers INCLUDING ALL)
  ', p_schema_name);

  -- mr_items хуулах
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.mr_items (LIKE public.mr_items INCLUDING ALL)
  ', p_schema_name);

  -- workflow_instances хуулах
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.workflow_instances (LIKE public.workflow_instances INCLUDING ALL)
  ', p_schema_name);

  -- workflow_step_logs хуулах
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.workflow_step_logs (LIKE public.workflow_step_logs INCLUDING ALL)
  ', p_schema_name);

  -- outbox_events хуулах
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.outbox_events (LIKE public.outbox_events INCLUDING ALL)
  ', p_schema_name);

  -- Schema-д RLS идэвхжүүлэх (extra security layer)
  EXECUTE format('
    ALTER TABLE %I.mr_headers ENABLE ROW LEVEL SECURITY;
    ALTER TABLE %I.mr_headers FORCE ROW LEVEL SECURITY;
    CREATE POLICY rls_mr_headers ON %I.mr_headers
      AS RESTRICTIVE FOR ALL TO s_project_app_user
      USING (tenant_id = %L::UUID)
      WITH CHECK (tenant_id = %L::UUID);
  ', p_schema_name, p_schema_name, p_schema_name, p_tenant_id, p_tenant_id);

END;
$$;

-- Шинэ enterprise tenant бүртгэхэд автоматаар schema үүсгэх trigger
CREATE OR REPLACE FUNCTION trigger_provision_enterprise_schema()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.tier = 'enterprise' AND OLD.tier != 'enterprise' THEN
    PERFORM provision_tenant_schema(NEW.id);
    PERFORM clone_tables_to_schema(
      (SELECT schema_name FROM tenants WHERE id = NEW.id),
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_provision_enterprise_schema
  AFTER UPDATE OF tier ON tenants
  FOR EACH ROW EXECUTE FUNCTION trigger_provision_enterprise_schema();
```

---

## Алхам 6.2 — Prisma Multi-Schema Support

- [ ] `apps/core-kernel/prisma/schema.prisma` шинэчлэх:

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["multiSchema"]   // ← НЭМЭХ
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
  schemas  = ["public", "tenant_schema_placeholder"]  // dynamic-аар орлуулагдана
}

// Tenant model-д schema_name нэмэх
model Tenant {
  id          String   @id @default(uuid()) @db.Uuid
  name        String
  slug        String   @unique
  tier        String   @default("shared")
  schemaName  String?
  // ... бусад талбар
  @@map("tenants")
  @@schema("public")
}
```

> **Тэмдэглэл:** Prisma multi-schema нь static schema нэрийг `schema.prisma`-д шаарддаг.
> Dynamic schema routing-г **runtime** дээр `SET search_path` ашиглан хийнэ.

---

## Алхам 6.3 — Dynamic Schema Router Service

- [ ] `apps/core-kernel/src/tenant/schema-router.service.ts` үүсгэх:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SchemaRouterService {
  private readonly logger = new Logger(SchemaRouterService.name);
  private readonly schemaCache = new Map<string, string>(); // tenantId → schemaName

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tenant-н schema нэрийг буцаана (cache → DB)
   */
  async getSchemaName(tenantId: string): Promise<string> {
    // Cache шалгах
    if (this.schemaCache.has(tenantId)) {
      return this.schemaCache.get(tenantId)!;
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { tier: true, schemaName: true },
    });

    if (!tenant) throw new Error(`Tenant not found: ${tenantId}`);

    // shared tier → public schema
    const schemaName = tenant.tier === 'enterprise' && tenant.schemaName
      ? tenant.schemaName
      : 'public';

    this.schemaCache.set(tenantId, schemaName);
    return schemaName;
  }

  /**
   * Schema-тай transaction дотор query ажиллуулах
   * RULE-04: SET CONFIG + QUERY нэгдсэн $transaction() дотор байна
   */
  async withSchema<T>(
    tenantId: string,
    callback: (tx: any) => Promise<T>,
  ): Promise<T> {
    const schemaName = await this.getSchemaName(tenantId);

    return this.prisma.$transaction(async (tx) => {
      // search_path + app.tenant_id хоёуланг нэгэн зэрэг тохируулна
      await tx.$executeRaw`
        SELECT set_config('search_path', ${schemaName + ',public'}, true),
               set_config('app.tenant_id', ${tenantId}, true)
      `;
      return callback(tx);
    });
  }

  /**
   * Cache invalidate (tenant tier өөрчлөгдөхөд дуудна)
   */
  invalidateCache(tenantId: string): void {
    this.schemaCache.delete(tenantId);
    this.logger.log(`Schema cache invalidated for tenant: ${tenantId}`);
  }
}
```

---

## Алхам 6.4 — TenantContextInterceptor Шинэчлэх

- [ ] `apps/core-kernel/src/auth/tenant-context.interceptor.ts` — `SchemaRouterService` нэгтгэх:

```typescript
// Одоогийн: RLS SET CONFIG
// Шинэ: SchemaRouterService.withSchema() ашиглана

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(
    private readonly schemaRouter: SchemaRouterService,
    private readonly als: AsyncLocalStorage<TenantContext>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { tenantId } = request.user;

    // AsyncLocalStorage-д schema нэрийг хадгалах
    const ctx: TenantContext = { tenantId };
    return new Observable((observer) => {
      this.als.run(ctx, () => {
        next.handle().subscribe(observer);
      });
    });
  }
}
```

---

## Алхам 6.5 — Enterprise Tenant Provisioning API

- [ ] `apps/core-kernel/src/tenant/tenant-provisioning.controller.ts`:

```typescript
@Controller('admin/tenants')
@UseGuards(TenantAuthGuard, RolesGuard)
export class TenantProvisioningController {

  // Enterprise tier-д шилжүүлэх
  @Post(':id/upgrade-enterprise')
  @Roles('SUPER_ADMIN')
  async upgradeToEnterprise(@Param('id') tenantId: string) {
    // 1. tenants.tier = 'enterprise' болгох → trigger ажиллана
    // 2. provision_tenant_schema() дуудагдана
    // 3. clone_tables_to_schema() дуудагдана
    // 4. SchemaRouterService cache invalidate
  }

  // Enterprise tenant-н schema health шалгах
  @Get(':id/schema-health')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async checkSchemaHealth(@Param('id') tenantId: string) {
    // Schema байгаа эсэх, хүснэгтүүд зөв байгаа эсэх
  }
}
```

- [ ] `apps/core-kernel/src/tenant/tenant-provisioning.service.ts` — бизнес логик

---

## Алхам 6.6 — Schema Isolation Тест

- [ ] `apps/core-kernel/src/tenant/tests/schema-isolation.test.ts`:

```typescript
describe('Schema Isolation Tests', () => {

  describe('6.6.1 — Schema provisioning', () => {
    it('should create schema when tenant upgraded to enterprise')
    it('should clone all required tables to new schema')
    it('should return "public" schema for shared tier tenant')
    it('should cache schema name after first lookup')
    it('should invalidate cache on tier change')
  });

  describe('6.6.2 — Cross-schema leakage тест (КРИТИК)', () => {
    it('enterprise tenant A data should NOT be visible in enterprise tenant B schema')
    it('enterprise tenant data should NOT be visible in public schema')
    it('shared tenant data should NOT be visible in enterprise schema')
    it('concurrent requests to different schemas should not cross-contaminate')
  });

  describe('6.6.3 — SchemaRouterService', () => {
    it('withSchema() should set correct search_path before query')
    it('withSchema() should reset search_path after transaction')
    it('withSchema() should throw if tenant not found')
  });

  describe('6.6.4 — Migration rollback', () => {
    it('should drop schema on tenant downgrade from enterprise')
    it('should preserve public schema data on enterprise schema drop')
  });
});
```

- [ ] `apps/core-kernel/src/tenant/tests/schema-rls-leakage.test.ts` — dual Prisma client pattern (RULE-16):

```typescript
// Enterprise A Prisma + Enterprise B Prisma — хоорондоо харагдахгүй
// Enterprise Prisma + Shared Prisma — хоорондоо харагдахгүй
```

---

## Шалгуур (Definition of Done)

- [ ] `pnpm test` бүх schema isolation тест давна
- [ ] Enterprise tenant upgrade → schema автоматаар үүснэ
- [ ] Tenant A-н enterprise schema → Tenant B-д харагдахгүй (leakage = 0)
- [ ] `public` schema-н shared tenant өгөгдөл enterprise schema-д харагдахгүй
- [ ] `SchemaRouterService.withSchema()` нь `set_config` + query нэгдсэн transaction дотор
- [ ] `pnpm --filter core-kernel exec prisma db push` амжилттай

---

## Алдааны Урьдчилсан Сэрэмжлүүлэг

> ⚠️ **АНХААР:** Prisma multi-schema нь `previewFeatures = ["multiSchema"]` шаарддаг — байхгүй бол `@@schema()` annotation compile error гарна.

> ⚠️ **АНХААР:** `search_path` тохируулах нь `SET search_path = tenant_xxx, public` гэж public-г заавал оруулах — байхгүй бол `pg_catalog` функцууд олдохгүй болно.

> ⚠️ **АНХААР:** `clone_tables_to_schema()` нь FK constraint-уудыг `LIKE ... INCLUDING ALL` копилохдоо эцэг хүснэгтийг (`tenants`) public schema-д заавал байлгана.
