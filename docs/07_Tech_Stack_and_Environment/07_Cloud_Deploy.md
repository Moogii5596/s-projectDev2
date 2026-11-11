---
title: "Үүлэн deploy — staging, production (Supabase Cloud + Render + Vercel + Upstash)"
type: "Guide"
status: "Active"
last_updated: 2026-11-12
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
| Redis | Render Key Value Free `s-project-kv-staging` (Valkey, санах ойд, Singapore, дотоод URL — `render.yaml`) | Upstash `s-project-prod` (ap-southeast-1, persistent) |
| Файл | R2 `s-project-staging` (H2) | R2 `s-project-prod` (H2) |

Upstash Free = **данс бүрт 1 DB** → production-д л; staging = Render Key Value Free (workspace-д 1; restart-д өгөгдөл алдагдана — staging-д зөвшөөрнө). Орчин бүр тусдаа Redis (`keyPrefix` ✖: cache-ийн SCAN-тэй таарахгүй). Redis-ийн командын тооцоо → §10.

Тохиргооны файлууд: `render.yaml` (Blueprint, 2 web service + staging Key Value), `apps/web-shell/vercel.json` (SPA rewrite, аюулгүй байдлын толгой, cache), `.github/workflows/{ci,deploy-staging,deploy-production}.yml`, `.github/actions/supabase-start`.

## 2. Урсгал

```
PR → CI: lint · unit · integration · build (docs-only бол зөвхөн docs:check; E2E ✖) → A0 merge → main
main push → «Deploy staging»: CI (бүтэн + E2E) → supabase db push (staging) → [check ногоон] → Render staging deploy; Vercel staging git-ээс
tag vX.Y.Z (A0) → PO: Actions → «Deploy production» → Run workflow (tag) = G3
   → tag шалгах (main дээр, staging ногоон) → шифрлэсэн нөөц (artifact, 30 хоног) → db push (prod)
   → Render deploy hook (?ref=<sha>) → /api/v1/health-ийн commit = sha → Vercel prod → frontend 200
```
- Schema зөвхөн `supabase/migrations/`-аас. Cloud дээр SQL editor-оор schema өөрчлөхгүй.
- Өгөгдөл зөвхөн production → staging (H5 restore). dev-ээс cloud руу ✖.
- Алхам унавал дараагийнх ажиллахгүй; Render өмнөх хувилбараа ажиллуулсаар үлдэнэ.

## 3. Supabase (төсөл бүрт)
1. Төсөл үүсгэх: region **Southeast Asia (Singapore, ap-southeast-1)** — Render (singapore), Upstash (ap-southeast-1)-тэй нэг бүс (хүсэлт бүрт олон DB query → апп↔DB latency чухал), Free. DB нууц үгийг нууц менежерт.
   PO 2026-11-11-нд тохируулсан (төсөл бүрт): **Data API унтраалттай** (апп PostgREST ашиглахгүй — DB-д зөвхөн Prisma, Auth нь GoTrue-ээр), **нийтийн бүртгэл хаалттай** (Auth → Sign In / Providers → «Allow new users to sign up» off; хэрэглэгчийг зөвхөн backend `auth.admin.createUser`-ээр үүсгэнэ).
2. **Холболтын мөр** (Project → Connect). Render IPv4 тул **direct (db.<ref>.supabase.co) ✖ (IPv6)** — pooler:
   - `DATABASE_URL` (апп, RLS) = transaction pooler: `postgresql://app_user.<ref>:<app_user нууц үг>@aws-…pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=5`
   - `SYSTEM_DATABASE_URL` = session pooler, postgres: `postgresql://postgres.<ref>:<DB нууц үг>@aws-…pooler.supabase.com:5432/postgres`
   - `DIRECT_URL` = `SYSTEM_DATABASE_URL`-тэй ижил (Prisma `directUrl`; migrate ашиглахгүй — schema = `supabase db push`)
   - GitHub secret `STAGING_DB_URL` / `PROD_DB_URL` = session pooler (postgres) — `db push`, нөөц
3. Анхны `db push`-ийн дараа (A0, нэг удаа): `app_user`-ийн нууц үгийг солих — migration-ийн анхдагч (`change_in_production`) cloud-д ✖:
   SQL editor → `ALTER ROLE app_user WITH PASSWORD '<шинэ>';` → `DATABASE_URL`-д.
4. Auth → URL Configuration: Site URL = frontend домэйн. Auth hook (password verification) Free-д байхгүй → түгжээ = NestJS (H1).
5. API keys (Settings → API Keys): **шинэ key ашиглана** — `SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY` = `sb_publishable_…`, `SUPABASE_SERVICE_ROLE_KEY` = `sb_secret_…` (зөвхөн Render; browser-ээс secret key-г Supabase татгалзана). Хувьсагчийн нэр хэвээр.
   Шалгасан (2026-11-12, supabase-js 2.119.0, Supabase CLI 2.122.1 local gateway): `auth.admin.createUser/updateUserById/listUsers/deleteUser`, `signInWithPassword`, `auth.getUser(token)`, `refreshSession`, raw `PUT /auth/v1/user`, `GET /auth/v1/health` (`apikey` толгой) — бүгд ногоон. Backend JWT-г өөрөө шалгадаггүй (`auth.getUser` → GoTrue) тул JWT signing key (ES256) өөрчлөлт нөлөөлөхгүй.
   Cloud дээр 401 гарвал (нөөц арга): API Keys → **Legacy API Keys** таб → `anon` → `SUPABASE_ANON_KEY`, `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (legacy key-г унтраасан бол эхлээд «Re-enable»).
6. **Bot protection (Turnstile, #27)** — шууд `/auth/v1/token?grant_type=password` замыг хаана (NestJS-ийн түгжээг тойрохгүй):
   Cloudflare → Turnstile → Add widget (орчин бүрт: hostname `staging.gobiverse.website` / `sino.gobiverse.website`, mode = Managed) → **Site key** → Vercel `VITE_TURNSTILE_SITE_KEY`; **Secret key** → Supabase → Authentication → Attack Protection → Enable CAPTCHA → Turnstile.
   Дараа нь шалгах: `curl -X POST <SUPABASE_URL>/auth/v1/token?grant_type=password -H "apikey: <anon>" -d '{"email":"x@x","password":"x"}'` → `captcha_failed` (400) байх ёстой; апп-аар нэвтрэлт ажиллана.
   Анхаар: legacy `POST /api/v1/auth/register` (UI ашигладаггүй) нь password grant-аар токен авдаг тул captcha асаалттай орчинд ажиллахгүй.
7. Free төсөл 7 хоног идэвхгүй бол зогсдог → өдөр тутмын нөөц (H5) холбогдож сэрээнэ.

## 4. Render
1. New → Blueprint → энэ repo → `render.yaml` → 2 service үүснэ. `sync: false` хувьсагчдыг гараар (§5).
2. staging: Settings → Auto-Deploy = **After CI checks pass** (`checksPass`). production: Auto-Deploy **Off**; Settings → Deploy Hook → URL-ийг GitHub secret `RENDER_DEPLOY_HOOK_PROD`.
3. Health check: `/api/v1/health` (`{ status, version, commit }`). Free: 15 мин идэвхгүй → унтана (cold start 30–60 с), workspace-д 750 цаг/сар.
4. Лог: `LOG_FORMAT=json` → Render Logs-д `requestId`, `tenantId`-аар хайна (хариуны `x-request-id` толгой = requestId).

## 5. Нууц ба хувьсагчийн жагсаалт (утгагүй)

**Render (service бүрт):** `DEDICATED_TENANT_SLUG`, `CORS_ORIGINS` (frontend домэйн, таслалаар), `PUBLIC_APP_URL`, `DATABASE_URL`, `SYSTEM_DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `REDIS_URL` (зөвхөн production: Upstash `rediss://default:<token>@<host>:6379` — TLS; staging-д blueprint `fromService`-ээр Key Value-ийн дотоод URL автомат), `JWT_SECRET` (≥32), `FILE_ENCRYPTION_KEY`, `MEDIA_URL_SECRET` (пилотынхтой ИЖИЛ — шифрлэсэн файл, зургийн линк), `SENTRY_DSN`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. H2-оос: `STORAGE_DRIVER`, `R2_*`.
Тогтмол (blueprint-д): `NODE_VERSION=22`, `NODE_ENV=production`, `LOG_FORMAT=json`, `TRUST_PROXY=1`, `DEPLOYMENT_MODE=dedicated`, `SENTRY_ENVIRONMENT`, `DEBUG_MENU_ENABLED` (staging true, production false — H1-ийн «түгжээ тайлах» Debug-д байгаа тул production-д асаах эсэхийг PO шийднэ).

**Vercel (project бүрт, Environment Variables → Production):** `VITE_SUPABASE_URL` (cloud URL — `same-origin` ✖), `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL` (Render URL, жишээ `https://s-project-api-prod.onrender.com`), `VITE_MODULES` (пилот: `camp`), `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT`, `VITE_TURNSTILE_SITE_KEY` (#27). Project Settings: Root Directory = `apps/web-shell`, Framework = Vite (бусдыг `vercel.json` тодорхойлно).

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
- CI зөвхөн `pull_request` + `workflow_call` + `workflow_dispatch` (branch push-д ✖ — нэг commit = нэг run; Actions минут 2,000/сар).
- **E2E PR-д ✖** (PO 2026-11-11): «Deploy staging» (`main` merge) ба гараар (Actions → CI → Run workflow) л. «Deploy production» staging ногоон шаарддаг → production = E2E-ээр шалгагдсан commit. E2E `main`-д унавал тэр commit-ийн staging migration/deploy алгасна; засах PR = P1. Developer шинэ дэлгэцийн spec-ийг PR нээхээс өмнө local-д ажиллуулж PR-д бичнэ.
- E2E runner = `ubuntu-24.04`, Playwright браузер cache (`~/.cache/ms-playwright`, key = `@playwright/test` хувилбар), apt-гүй суулгалт (Chromium асахгүй бол л `install-deps`). 2026-11-11 ~14:00 UTC-аас `ubuntu-latest` (26.04) дээр apt `*.ubuntu.com` DNS алдаагаар бүх E2E унасан.

## 10. Redis командын тооцоо (Upstash Free = 500K команд/сар, production)

Тооцоолсон 2026-11-12 (кодоос). **Backend-ийн үечилсэн ажил Redis ашигладаггүй** — outbox poller (5 с), мэдэгдлийн имэйл (1 мин), батлах SLA (15 мин), cron lease heartbeat (30 с) бүгд Postgres. Redis = хүсэлтийн замд л.

| Хэрэглэгч | Команд |
|---|---|
| Сул үе (Render 24/7 сэрүүн, хэрэглэгчгүй) | ≈ 0 (ioredis-ийн reconnect-ийн `INFO` л) |
| Outbox → `PUBLISH` | event бүрт 1 |
| Нэвтэрсэн API хүсэлт бүр (cache hit) | ≈ 10: rate limit 3 × `INCR` (+ шинэ цонхонд `PEXPIRE`) + auth guard 5 × `GET` (token, tenant slug, гишүүнчлэл, аюулгүй байдлын бодлого, нууц үг солих) |
| Frontend-ийн нээлттэй (идэвхтэй) таб | ≈ 4 хүсэлт/мин (мэдэгдлийн хонх 30 с, батлах inbox 60 с, i18n 60 с) → ≈ 2,400 команд/цаг |

| Хувилбар | Команд/сар |
|---|---|
| 1 хэрэглэгч, 1 таб, 8 ц × 22 өдөр (зөвхөн poll) | ≈ 420K |
| Пилот: 15 хэрэглэгч × 2 ц идэвхтэй таб × 22 өдөр + 200 бусад хүсэлт/өдөр | ≈ 1.6M (poll) + 0.66M = **≈ 2.2M** |

**Дүгнэлт: Upstash Free (500K) production-д хүрэлцэхгүй** (> 300K босго). Шалтгаан нь backend-ийн polling биш, хүсэлт бүрийн Redis дуудлага × frontend-ийн poll. Сонголт (A0/PO шийдвэр — мөнгө бол PO):
1. Код (тусдаа issue): auth guard-ийн 5 `GET`-ийг процесс доторх L1 cache (TTL ≤ 30 с; Render 1 instance) + rate limit-ийг нэг Lua `EVAL` → хүсэлт бүрт ≈ 1–2 команд; хонх 30 с → 120 с, i18n 60 с → 10 мин. Тооцоо: ≈ 0.3M/сар.
2. Upstash pay-as-you-go ($0.2 / 100K команд → ≈ $4–5/сар) — мөнгө → PO.
3. Production-д мөн Render Key Value (Free нь workspace-д 1 — staging эзэлсэн; Starter төлбөртэй) — мөнгө → PO.

