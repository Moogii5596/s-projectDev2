# ADR-001: Tenant Isolation стратеги (v0.1.5 Tier 2)

| | |
|---|---|
| **Төлөв** | ✅ Батлагдсан |
| **Огноо** | 2026-10-08 |
| **Шийдвэр гаргагч** | Төслийн эзэн (Сайна) · Lead Developer (Claude) |
| **Орлох** | Sprint 6 "Schema-per-Tenant DB Isolation" (`V.0.1.5/sprint_6_schema_isolation.md`) |

---

## 1. Нөхцөл байдал

v0.1.5 (Tier 2 Enterprise VPC)-ийн Sprint 6-д enterprise tenant бүрт `tenant_<id>` PostgreSQL schema үүсгэж,
request бүрт `SET search_path` хийх замаар тусгаарлахаар төлөвлөж хэрэгжүүлсэн
(`SchemaRouterService`, `TenantProvisioningService`, migration `20260921004_schema_isolation.sql`).

2026-10-08-ны шинжилгээгээр:

1. **Request урсгалд холбогдоогүй** — `SchemaRouterService.withSchema()`-г interceptor болон аль ч бизнес
   service дууддаггүй байсан. Enterprise tenant-ийн өгөгдөл бодитоор `public`-д бичигдэж байсан.
2. **`search_path` нь Prisma-тай нийцэхгүй** — Prisma query engine хүснэгтийн нэрийг datasource-ийн schema-тай
   нь бүрэн бичдэг (`"public"."mr_headers"`), тиймээс `SET search_path` query-д нөлөөлөхгүй.
   Unit тест mock ашигладаг тул үүнийг барьж чадаагүй.
3. Зөв хэрэгжүүлэхэд tenant бүрт тусдаа `PrismaClient` (`?schema=tenant_x`) + connection pool удирдлага,
   эсвэл raw SQL руу шилжих шаардлагатай — хоёулаа их зардалтай, эрсдэлтэй.

## 2. Сонголтууд

| | Арга | Давуу | Сул |
|---|---|---|---|
| A | Tenant бүрт тусдаа PrismaClient (`?schema=`), LRU pool | Нэг instance дотор жинхэнэ тусгаарлалт | Connection тоо tenant-тай пропорциональ өснө; migration-ыг schema бүрт давтах |
| **B** | **Shared = RLS хэвээр; Enterprise VPC = тусдаа DB + тусдаа deploy** | **Хамгийн энгийн; одоогийн RLS код, тест хэвээр; VPC-ийн жинхэнэ утга (физик тусгаарлалт)** | Нэг instance доторх "schema тусгаарлалт" байхгүй |
| C | Raw SQL / view + search_path | Нэг client | Prisma type safety алдагдана; бүх service дахин бичигдэнэ |

## 3. Шийдвэр — **B**

- **Shared (SaaS) tenant-ууд:** нэг DB, `app.tenant_id` + RLS (FORCE) — v0.1.0-ийн загвар өөрчлөгдөхгүй.
- **Enterprise VPC tenant:** харилцагч бүрт **тусдаа Supabase (Postgres + Auth) + тусдаа app deploy**.
  App-ийг `DEPLOYMENT_MODE=dedicated` + `DEDICATED_TENANT_SLUG=<slug>`-ээр ажиллуулна.
  - Tenant нь Host header-ээс биш тохиргооноос тодорхойлогдоно (харилцагч өөрийн домэйн ашиглаж болно).
  - RLS dedicated DB дотор ч идэвхтэй хэвээр (defense in depth).
- "Tier 2 = Enterprise VPC" гэдэг нь угаасаа тусдаа орчинд байршуулах утгатай тул B нь бизнесийн шаардлагыг
  илүү шууд хангана.

## 4. Үр дагавар / Хэрэгжүүлэлт (2026-10-08)

| Өөрчлөлт | Файл |
|---|---|
| Schema-per-tenant код хасагдсан | `SchemaRouterService`, `TenantProvisioningService/Controller` (3 endpoint), `schema-isolation.spec.ts` |
| Migration-аар буцаасан (өгөгдөл устгахгүй, NOTICE) | `supabase/migrations/20261008001_revert_schema_per_tenant.sql` |
| Prisma `Tenant.schemaName` хасагдсан | `apps/core-kernel/prisma/schema.prisma` |
| Deployment mode (ганц эх сурвалж) | `apps/core-kernel/src/config/deployment-mode.ts` |
| Startup validation | `EnvConfig` — dedicated + slug байхгүй/буруу → app эхлэхгүй |
| Guard | `TenantAuthGuard` — dedicated үед tenant = `DEDICATED_TENANT_SLUG` |
| VPC stack | `docker/docker-compose.vpc.yml`, `docker/.env.vpc.example`, `docker/vpc/bootstrap_dedicated_tenant.sql` |
| Runbook | `docs/07_Tech_Stack_and_Environment/03_Enterprise_VPC_Deployment.md` |

**Устгагдсан API:** `POST /api/v1/admin/tenants/:id/upgrade-enterprise`,
`DELETE /api/v1/admin/tenants/:id/enterprise-schema`, `GET /api/v1/admin/tenants/:id/schema-health`
(frontend/E2E-д ашиглагдаагүй байсан).

## 5. Эрсдэл ба дараагийн алхам

- Enterprise харилцагч олшрох тусам deploy-ийн тоо өснө → v0.2.0+ дээр deploy automation (IaC) хэрэгтэй.
- Shared/dedicated хоёр горимд migration ижил байх ёстой — CI нь нэг migration багцыг хоёуланд хэрэглэнэ.
- ✅ Тусдаа илэрсэн membership асуудал (guard хэрэглэгч Host-ийн tenant-д харьяалагдах эсэхийг шалгадаггүй байсан)
  Phase 2.8-д засагдсан — `TenantCacheService.isMember()`, lessons_learned [SEC-001]. Shared + dedicated хоёуланд үйлчилнэ.
