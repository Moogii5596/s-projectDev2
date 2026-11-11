---
title: "Үүлэн deploy — staging, production (Supabase Cloud + Render + Vercel + Upstash)"
type: "Guide"
status: "Active"
last_updated: 2026-11-11
tags: [deploy, hosting, runbook, v0.2.5]
---

# Үүлэн deploy — runbook

> Шийдвэр → [[ADR-011_Cloud_Hosting]] · Хэрэгжүүлэлт → [[13_v0.2.5_tech_plan]] H3/H4/H6 · Хувилбар → [[VERSIONING]] · Env жагсаалт (🤖) → [[06_Config_Env]].
> Нууцын **утга** энэ баримт, git, чатад хэзээ ч орохгүй — зөвхөн Render / Vercel / GitHub Secrets-д.

## 1. Бүтэц

| | staging | production |
|---|---|---|
| DB + Auth | Supabase `s-project-staging` | Supabase `s-project-prod` |
| Backend | Render `s-project-api-staging` — `main` → CI ногоон (checksPass) → автомат | Render `s-project-api-prod` — автомат ✖, зөвхөн «Deploy production» workflow-ийн deploy hook |
| Frontend | Vercel `s-project-staging` (Root `apps/web-shell`, git автомат) → `staging.gobiverse.website` | Vercel `s-project-prod` (**Git холбохгүй**, зөвхөн workflow-оос `vercel deploy --prod`) → `sino.gobiverse.website` |
| Redis | Upstash DB (staging) | Upstash DB (prod) — орчин бүр тусдаа DB (`keyPrefix` ✖: cache-ийн SCAN-тэй таарахгүй) |
| Файл | R2 `s-project-staging` (H2) | R2 `s-project-prod` (H2) |

Тохиргооны файлууд: `render.yaml` (Blueprint, 2 service), `apps/web-shell/vercel.json` (SPA rewrite, аюулгүй байдлын толгой, cache), `.github/workflows/{ci,deploy-staging,deploy-production}.yml`, `.github/actions/supabase-start`.

## 2. Урсгал

```
PR → CI (docs-only бол зөвхөн docs:check) → A0 merge → main
main push → «Deploy staging»: CI (бүтэн) → supabase db push (staging) → [check ногоон] → Render staging deploy; Vercel staging git-ээс
tag vX.Y.Z (A0) → PO: Actions → «Deploy production» → Run workflow (tag) = G3
   → tag шалгах (main дээр, staging ногоон) → шифрлэсэн нөөц (artifact, 30 хоног) → db push (prod)
   → Render deploy hook (?ref=<sha>) → /api/v1/health-ийн commit = sha → Vercel prod → frontend 200
```
- Schema зөвхөн `supabase/migrations/`-аас. Cloud дээр SQL editor-оор schema өөрчлөхгүй.
- Өгөгдөл зөвхөн production → staging (H5 restore). dev-ээс cloud руу ✖.
- Алхам унавал дараагийнх ажиллахгүй; Render өмнөх хувилбараа ажиллуулсаар үлдэнэ.

## 3. Supabase (төсөл бүрт)
1. Төсөл үүсгэх: region Зүүн хойд Ази (Seoul/Tokyo), Free. DB нууц үгийг нууц менежерт.
2. **Холболтын мөр** (Project → Connect). Render IPv4 тул **direct (db.<ref>.supabase.co) ✖ (IPv6)** — pooler:
   - `DATABASE_URL` (апп, RLS) = transaction pooler: `postgresql://app_user.<ref>:<app_user нууц үг>@aws-…pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=5`
   - `SYSTEM_DATABASE_URL` = session pooler, postgres: `postgresql://postgres.<ref>:<DB нууц үг>@aws-…pooler.supabase.com:5432/postgres`
   - `DIRECT_URL` = `SYSTEM_DATABASE_URL`-тэй ижил (Prisma `directUrl`; migrate ашиглахгүй — schema = `supabase db push`)
   - GitHub secret `STAGING_DB_URL` / `PROD_DB_URL` = session pooler (postgres) — `db push`, нөөц
3. Анхны `db push`-ийн дараа (A0, нэг удаа): `app_user`-ийн нууц үгийг солих — migration-ийн анхдагч (`change_in_production`) cloud-д ✖:
   SQL editor → `ALTER ROLE app_user WITH PASSWORD '<шинэ>';` → `DATABASE_URL`-д.
4. Auth → URL Configuration: Site URL = frontend домэйн. Auth hook (password verification) Free-д байхгүй → түгжээ = NestJS (H1).
5. API keys: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (publishable), `SUPABASE_SERVICE_ROLE_KEY` (secret — зөвхөн Render).
6. Free төсөл 7 хоног идэвхгүй бол зогсдог → өдөр тутмын нөөц (H5) холбогдож сэрээнэ.

## 4. Render
1. New → Blueprint → энэ repo → `render.yaml` → 2 service үүснэ. `sync: false` хувьсагчдыг гараар (§5).
2. staging: Settings → Auto-Deploy = **After CI checks pass** (`checksPass`). production: Auto-Deploy **Off**; Settings → Deploy Hook → URL-ийг GitHub secret `RENDER_DEPLOY_HOOK_PROD`.
3. Health check: `/api/v1/health` (`{ status, version, commit }`). Free: 15 мин идэвхгүй → унтана (cold start 30–60 с), workspace-д 750 цаг/сар.
4. Лог: `LOG_FORMAT=json` → Render Logs-д `requestId`, `tenantId`-аар хайна (хариуны `x-request-id` толгой = requestId).

## 5. Нууц ба хувьсагчийн жагсаалт (утгагүй)

**Render (service бүрт):** `DEDICATED_TENANT_SLUG`, `CORS_ORIGINS` (frontend домэйн, таслалаар), `PUBLIC_APP_URL`, `DATABASE_URL`, `SYSTEM_DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `REDIS_URL` (`rediss://default:<token>@<host>:6379` — TLS), `JWT_SECRET` (≥32), `FILE_ENCRYPTION_KEY`, `MEDIA_URL_SECRET` (пилотынхтой ИЖИЛ — шифрлэсэн файл, зургийн линк), `SENTRY_DSN`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. H2-оос: `STORAGE_DRIVER`, `R2_*`.
Тогтмол (blueprint-д): `NODE_VERSION=22`, `NODE_ENV=production`, `LOG_FORMAT=json`, `TRUST_PROXY=1`, `DEPLOYMENT_MODE=dedicated`, `SENTRY_ENVIRONMENT`, `DEBUG_MENU_ENABLED` (staging true, production false — H1-ийн «түгжээ тайлах» Debug-д байгаа тул production-д асаах эсэхийг PO шийднэ).

**Vercel (project бүрт, Environment Variables → Production):** `VITE_SUPABASE_URL` (cloud URL — `same-origin` ✖), `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL` (Render URL, жишээ `https://s-project-api-prod.onrender.com`), `VITE_MODULES` (пилот: `camp`), `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT`. Project Settings: Root Directory = `apps/web-shell`, Framework = Vite (бусдыг `vercel.json` тодорхойлно).

**GitHub → Settings → Secrets (repo; Free private-д environment secret ✖):** `STAGING_DB_URL`, `PROD_DB_URL`, `BACKUP_AGE_RECIPIENT` (age нийтийн түлхүүр; хувийн түлхүүр PO-д, repo-д ✖), `RENDER_DEPLOY_HOOK_PROD`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_PROD`.
**GitHub → Variables:** `STAGING_ENABLED=true` (staging бэлэн болсны дараа — тэр хүртэл staging migration алгасна), `PROD_API_URL`, `PROD_WEB_URL`.

## 6. Production deploy (PO, G3)
1. A0: release PR merge → staging ногоон + UAT (G2) → tag `vX.Y.Z` push.
2. PO: GitHub → Actions → **Deploy production** → Run workflow → `tag` = `vX.Y.Z`.
3. Ногоон = нөөц artifact (`prod-predeploy-<tag>-<run>`), migration, backend health (commit = tag), frontend 200.
4. Улаан бол: алхмын лог → A0. Migration-оос өмнө унасан бол өгөгдөл хөндөгдөөгүй.

## 7. Rollback
- **Код:** өмнөх tag-аар «Deploy production»-г дахин (migration нь зөвхөн шинэ файлыг хэрэглэнэ — хуучин код шинэ schema-тай ажиллах ёстой: expand → contract).
- **Өгөгдөл (хамгийн сүүлчийн арга, PO-ийн зөвшөөрөлтэй — AGENTS.md §4):** artifact татах → `age -d -i <хувийн түлхүүр> … | pg_restore` — H5-ийн restore runbook.

## 8. Хяналт
- **Sentry** (backend + frontend, PII-гүй: толгой/body/cookie/query, имэйл/утас/токен нууцлагдана; хэрэглэгч = зөвхөн id). Release = `s-project-api@<version>+<sha>` / `s-project-web@<sha>`. Alert → имэйл.
- **Uptime** (UptimeRobot эсвэл ижил үнэгүй): frontend `https://<домэйн>/` 5 мин; backend `/api/v1/health` **60 мин** — ойр ойрхон ping нь Render Free-г унтуулахгүй, 2 service × 24 ц > 750 цаг/сар хязгаарыг давна. Алдаа → имэйл.
- Debug → Систем: `commit`, тохиргоо (нууц нь зөвхөн «тохируулсан»).

## 9. CI
- Тест үргэлж GitHub runner дээрх **local Supabase**-д (cloud DB-д тест ✖). Docker image-ууд cache-д (`.github/actions/supabase-start`), тестэд хэрэггүй сервис (studio, realtime, storage, …) асаахгүй.
- Зөвхөн `docs/**` / `*.md` өөрчлөгдсөн PR → зөвхөн `docs:check`.
