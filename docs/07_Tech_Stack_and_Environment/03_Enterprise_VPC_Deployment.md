# Runbook: Enterprise VPC (Tier 2) байршуулалт — `DEPLOYMENT_MODE=dedicated`

> Шийдвэр: [ADR-001](../02_System_Architecture/ADR-001_Tenant_Isolation.md) · Үүсгэсэн: 2026-10-08
> Нэг харилцагч = нэг тусдаа Supabase (Postgres + Auth) + нэг тусдаа app stack.

## 0. Ерөнхий бүтэц

```
Харилцагчийн VPC
 ├── Supabase (ТУСДАА): Postgres + Auth (+ Realtime)   ← self-hosted эсвэл тусдаа project
 └── docker compose -p s-vpc-<slug>
      ├── shell   (nginx, :80)  → /api → backend
      ├── backend (NestJS, DEPLOYMENT_MODE=dedicated, DEDICATED_TENANT_SLUG=<slug>)
      └── redis   (дотоод, порт нээхгүй)
```

| Горим | Tenant хаанаас | DB |
|---|---|---|
| `shared` (default) | Host subdomain (`acme.app.mn` → `acme`), localhost → `DEV_TENANT_SLUG` | Нэг DB, RLS |
| `dedicated` | `DEDICATED_TENANT_SLUG` (Host-оос үл хамаарна) | Харилцагчийн тусдаа DB (RLS идэвхтэй хэвээр) |

## 1. Урьдчилсан шаардлага

- Docker + Docker Compose v2, `psql`, repo-ийн хуулбар (`pnpm install` хийсэн — Supabase CLI devDependency).
- Харилцагчийн **тусдаа** Supabase instance:
  - self-hosted: Supabase-ийн албан ёсны docker stack, эсвэл
  - тусдаа Supabase Cloud project (харилцагч зөвшөөрсөн бол).
- Тэмдэглэх утгууд: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, Postgres connection string.

> ⚠️ Shared SaaS-ийн DB / Supabase-ийн утгыг VPC env-д **хэзээ ч** бүү хуул.

## 2. Slug сонгох

`DEDICATED_TENANT_SLUG` — жижиг латин үсэг, тоо, зураас (`^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$`).
Жишээ: `acme`, `erdenet-mining`. Буруу хэлбэр → backend эхлэхгүй (`Environment variable validation failed`).

## 3. Migration хэрэглэх

```bash
# repo root-оос — бүх supabase/migrations/*.sql-ийг тусдаа DB-д
pnpm exec supabase db push --db-url "postgresql://postgres:<pw>@<host>:5432/postgres"
```

> `--db-url` дахь нууц үг тусгай тэмдэгттэй бол percent-encode хийнэ (`@` → `%40`).

`20261008001_revert_schema_per_tenant.sql` хүртэлх бүх migration ажиллана. `tenant_*` schema-ийн тухай
NOTICE гарвал (шинэ DB-д гарах ёсгүй) — ADR-001-ийг үз.

## 4. Admin хэрэглэгч (Supabase Auth)

Харилцагчийн Supabase Studio → **Authentication → Add user** (email + password, "Auto confirm"),
эсвэл:

```bash
curl -X POST "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@acme.mn","password":"<strong>","email_confirm":true}'
```

Хариуны `id` (UUID)-г тэмдэглэ → `admin_auth_id`.

## 5. Tenant + owner bootstrap

```bash
psql "postgresql://postgres:<pw>@<host>:5432/postgres" -v ON_ERROR_STOP=1 \
  -v slug=acme -v name='ACME Mining LLC' \
  -v admin_auth_id=<4-р алхмын id> -v admin_email=admin@acme.mn -v admin_full_name='Админ' \
  -f docker/vpc/bootstrap_dedicated_tenant.sql
```

Үүсгэнэ: `tenants` (tier2) + `core_users` (owner, RULE-13) + default advanced workflow.
Idempotent — дахин ажиллуулж болно. Сүүлд `acme | tier2 | t | 1 | 1` гэж харагдана.

## 6. Stack асаах

```bash
cp docker/.env.vpc.example docker/.env.vpc     # утгуудыг бөглөнө (git-д commit хийхгүй)
docker compose -p s-vpc-acme --env-file docker/.env.vpc -f docker/docker-compose.vpc.yml up -d --build
```

- `-p s-vpc-<slug>` → container/volume нэр харилцагч бүрт тусдаа.
- Шаардлагатай env дутуу бол compose `up`-аас өмнө алдаа өгнө.
- `SUPABASE_URL`/`ANON_KEY` нь frontend build-д "шатаагдана" → өөрчлөгдвөл `--build` дахин.

## 7. Шалгах

```bash
docker compose -p s-vpc-acme logs backend | grep "Deployment mode"
#  → Deployment mode: dedicated (tenant=acme)
curl -s http://<host>/api/v1/health
```

Browser-оор `http://<host>` → 4-р алхмын admin-аар нэвтэрнэ → MR үүсгэх.

| Шинж тэмдэг | Шалтгаан |
|---|---|
| Backend эхлэхгүй, `DEDICATED_TENANT_SLUG` алдаа | Slug байхгүй / буруу хэлбэр |
| Нэвтэрсний дараа бүх API **403 "Tenant ... олдсонгүй"** | 5-р алхам хийгдээгүй эсвэл slug зөрсөн |
| **401 Token хүчингүй** | Frontend өөр Supabase-ийн key-тэй build хийгдсэн → `--build` |

## 8. Шинэчлэх (upgrade)

```bash
git pull
pnpm install
pnpm exec supabase db push --db-url "<тусдаа DB>"
docker compose -p s-vpc-acme --env-file docker/.env.vpc -f docker/docker-compose.vpc.yml up -d --build
```

Shared болон бүх VPC deploy нэг migration багцыг ашиглана — migration алгасахгүй.
