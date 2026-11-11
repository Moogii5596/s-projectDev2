---
title: "Тохиргоо, env, script"
type: "Guide"
status: "Active"
last_updated: 2026-11-11
tags: [codebase, config, generated]
---

# Тохиргоо, env, script

> 🤖 **AUTO-GENERATED** — `pnpm docs:gen` (`scripts/docs/gen-codebase-docs.mjs`). Гараар бүү зас: кодыг засаад дахин үүсгэ. Зураглал: [[00_Codebase_Map]] · Дүрэм: RULE-21 ([[00_rules_and_context]]).

Утга нь `*.env.example`-ийн жишээ (нууц шинжтэй түлхүүрийн утгыг `***` болгосон). Жинхэнэ `.env`-ийг хэзээ ч баримтад хуулахгүй. Орчин асаах: [[02_Local_Supabase_Docker_Windows]] · пилот: [[04_Pilot_Camp_Windows]].

## `.env.example`

| Хувьсагч | Жишээ | Тайлбар |
|---|---|---|
| `NODE_ENV` | `development` | Server |
| `PORT` | `3000` |  |
| `DATABASE_URL` | `postgresql://app_user:change_in_production@127.0.0.1:54322/postgres?sc` | Supabase Local (pnpm supabase:start үед автоматаар үүснэ) DATABASE_URL = апп-ын холболт → app_user (NOBYPASSRLS) — RLS бодитоор идэвхтэй (production-тэй ижил).   Апп асахад: `DB role "app_user" — RLS идэвхтэй`. postgres-оор бол RLS алгасагдана (WARN лог).   app_user нууц үг (migration 0002_rls_polic |
| `SYSTEM_DATABASE_URL` | `postgresql://postgres:postgres@127.0.0.1:54322/postgres?schema=public` | SYSTEM_DATABASE_URL = системийн холболт (BYPASSRLS): tenant lookup, login, super-admin, onboarding, outbox, DLQ, escalation,   integration тестийн бэлтгэл, `pnpm dev:test-user`, e2e fixture. Заавал тохируулна. |
| `DIRECT_URL` | `postgresql://postgres:postgres@127.0.0.1:54322/postgres?schema=public` | Prisma migrate/introspect (superuser шаардлагатай) |
| `SUPABASE_URL` | `http://127.0.0.1:54321` |  |
| `SUPABASE_SERVICE_ROLE_KEY` | `***` |  |
| `SUPABASE_ANON_KEY` | `***` |  |
| `REDIS_URL` | `redis://localhost:6379` | Redis |
| `JWT_SECRET` | `***` | JWT (32+ тэмдэгт — production-д аюулгүй random string ашиглана) |
| `DEV_TENANT_SLUG` | `test-tenant` | Development |
| `DEPLOYMENT_MODE` | `shared` | Deployment mode (ADR-001): shared = SaaS, олон tenant + RLS (default)                             dedicated = Enterprise VPC, нэг deploy = нэг tenant |
| `DEBUG_MENU_ENABLED` | `false` | Debug-only модулиудыг зөвшөөрөх (production/pilot анхдагчаар унтраалттай) |
| `AUTH_LOCK_MAX_FAILURES` | `5` | v0.2.5 H1 (#16): бүртгэлийн нэвтрэлтийн түгжээ (NestJS, auth_guard.password_failures) — WINDOW мин-д MAX буруу → DURATION мин |
| `AUTH_LOCK_WINDOW_MINUTES` | `15` |  |
| `AUTH_LOCK_DURATION_MINUTES` | `15` |  |
| `AUTH_LOCK_GOTRUE_HOOK` | `false` | true = self-hosted GoTrue-ийн password hook (deploy/*/supabase/config.toml) асаалттай → буруу оролдлогыг hook тоолно (давхар тоолохгүй). Supabase Cloud (Free) дээр hook байхгүй → false. |
| `LOG_FORMAT` |  | ── v0.2.5 H3 (#18): үүлэн орчин (Render + Vercel) — dev-д хоосон. Runbook: docs/07_Tech_Stack_and_Environment/07_Cloud_Deploy.md json = нэг мөр JSON лог (requestId, tenantId; нууцлалтай). Хоосон = энгийн өнгөт лог |
| `TRUST_PROXY` |  | Render-ийн proxy-ийн ард бодит IP: 1 (hop). Хоосон = итгэхгүй (dev, пилот Caddy X-Real-IP) |
| `CORS_ORIGINS` |  | Frontend өөр домэйнд (Vercel) бол таслалаар: https://staging.gobiverse.website. Хоосон = CORS унтраалттай (same-origin) |
| `SENTRY_DSN` |  | Sentry (PII-гүй). Хоосон = унтраалттай |
| `SENTRY_ENVIRONMENT` | `development` |  |
| `SENTRY_TRACES_SAMPLE_RATE` | `0` |  |
| `RATE_LIMIT_SHORT` | `100` | Tenant rate limit (Phase 3.1) — 1с / 10с / 60с цонх тус бүрийн хүсэлтийн тоо Load test-д: RATE_LIMIT_SHORT=1000000 RATE_LIMIT_MEDIUM=1000000 RATE_LIMIT_LONG=1000000 |
| `RATE_LIMIT_MEDIUM` | `500` |  |
| `RATE_LIMIT_LONG` | `2000` |  |
| `NODE_CLUSTER_WORKERS` | `1` | Cluster (main.ts, production `pnpm start`): worker тоо, унасан worker-ийг дахин асаах backoff (Phase 3.6.4) |
| `PRISMA_LOG_LEVELS` | `warn,error` | Prisma лог (Phase 3.6.6) — анхдагч: query биш warn,error; integration тест = warn |
| `STORAGE_DIR` |  | v0.2.3 Блок 5 (FEED-01): Feed-ийн зургийн хавтас — хоосон бол <repo root>\storage (.gitignore). Пилот: pilot.ps1 PILOT_STORAGE_DIR-ээс дамжуулна; нөөцлөлтөд орно |
| `MEDIA_URL_SECRET` | `***` | Зургийн гарын үсэгтэй URL-ийн нууц (заавал биш) — хоосон бол JWT_SECRET-ээс гарган авна. Солиход өмнөх зургийн URL хүчингүй (7–14 хоног) |
| `FILE_ENCRYPTION_KEY` | `***` | v0.2.4 FILE-01 (M-7): хавсралтын AES-256-GCM түлхүүр — base64, 32 байт (openssl rand -base64 32). Хоосон бол JWT_SECRET-ээс гаргана (dev/staging). Production-д заавал тусдаа; солиход хуучин файл уншигдахгүй — нөөцөлж хадгална. |
| `PILOT_STORAGE_DB_WARN_GB` | `10` | v0.2.4 DBG-01: Debug → Систем-д харагдах build мэдээлэл (CI/pilot.ps1 build-ийн үед) GIT_COMMIT= BUILD_DATE= Пилотын статусын анхааруулах босго (PostgreSQL DB + Feed storage нийлбэр) |

## `deploy/pilot/.env.pilot.example`

| Хувьсагч | Жишээ | Тайлбар |
|---|---|---|
| `NODE_ENV` | `production` |  |
| `PORT` | `3100` |  |
| `DEPLOYMENT_MODE` | `dedicated` | ADR-001: нэг байгууллага = нэг deploy |
| `DEDICATED_TENANT_SLUG` | `sinohydro` |  |
| `DATABASE_URL` | `postgresql://app_user:<APP_USER_PASSWORD>@127.0.0.1:55322/postgres?sch` | ── Өгөгдлийн сан (пилотын Supabase, порт 55322) ───────────── app_user нууц үг: ЗӨВХӨН латин үсэг + тоо, 24+ тэмдэгт. pilot.ps1 init/restore нь DB-д тохируулна. |
| `SYSTEM_DATABASE_URL` | `postgresql://postgres:postgres@127.0.0.1:55322/postgres?schema=public` |  |
| `DIRECT_URL` | `postgresql://postgres:postgres@127.0.0.1:55322/postgres?schema=public` |  |
| `SUPABASE_URL` | `http://127.0.0.1:55321` | ── Supabase Auth ──────────────────────────────────────────── |
| `SUPABASE_AUTH_JWT_SECRET` | `***` | Supabase-ийн JWT нууц (40+ тэмдэгт). СОЛИВОЛ: бүх хэрэглэгч дахин нэвтэрнэ + pilot.ps1 build (anon key өөрчлөгдөнө) |
| `JWT_SECRET` | `***` | Апп-ын дотоод нууц (40+ тэмдэгт) |
| `REDIS_URL` | `redis://127.0.0.1:56379` | ── Redis (пилотын тусдаа контейнер, docker-compose.redis.yml) ── |
| `ESCALATION_CRON` | `off` | ── Пилотын тохиргоо ───────────────────────────────────────── Автомат escalation унтраалттай (алхам алгасах асуудал backlog-д) |
| `NODE_CLUSTER_WORKERS` | `1` |  |
| `PRISMA_LOG_LEVELS` | `warn,error` |  |
| `RATE_LIMIT_SHORT` | `100` |  |
| `RATE_LIMIT_MEDIUM` | `500` |  |
| `RATE_LIMIT_LONG` | `2000` |  |
| `AUTH_LOCK_MAX_FAILURES` | `5` | v0.2.5 H1 (#16): нэвтрэлтийн түгжээ (15 мин-д 5 буруу → 15 мин). Энэ орчинд GoTrue hook (supabase/config.toml) асаалттай → hook тоолно |
| `AUTH_LOCK_WINDOW_MINUTES` | `15` |  |
| `AUTH_LOCK_DURATION_MINUTES` | `15` |  |
| `AUTH_LOCK_GOTRUE_HOOK` | `true` |  |
| `PILOT_MODULES` | `camp` | Web: идэвхтэй модулиуд (camp \| all \| таслалаар). Солибол pilot.ps1 build |
| `PILOT_HTTP_PORT` | `8088` | Caddy (Funnel → энэ порт, 127.0.0.1) |
| `PILOT_BACKUP_DIR` | `E:\MoogiiDev\Pilot\backups` | ── Нөөцлөлт (pilot.ps1 backup, өдөр бүр 02:00) ────────────── Өөр диск/USB/OneDrive хавтас байвал илүү. Нууц үгийг нууц үгийн менежерт ХАДГАЛ — алдвал нөөцийг сэргээх боломжгүй. |
| `PILOT_BACKUP_PASSWORD` | `***` |  |
| `PILOT_BACKUP_KEEP_DAYS` | `14` |  |
| `PILOT_BACKUP_COPY_DIR` |  | 7z.exe PATH-д байхгүй бол: PILOT_7Z=C:\Program Files\7-Zip\7z.exe 2 дахь хуулбар (PIL-05; заавал биш): OneDrive/USB хавтас — PILOT_BACKUP_DIR-ээс ӨӨР. Хадгалах хугацаа = PILOT_BACKUP_KEEP_DAYS |
| `PILOT_STORAGE_DIR` |  | Feed-ийн зургийн хавтас (анхдагч <root>\storage; backend-ийн STORAGE_DIR-тэй ЯГ ИЖИЛ байх). backup/restore-д орно |
| `PILOT_STORAGE_DB_WARN_GB` | `10` | status/watchdog анхааруулга: PostgreSQL DB + storage нийлбэр хэмжээний босго (GB) |
| `PILOT_HEALTHCHECK_URL` |  | ── Мониторинг (PIL-04; заавал биш) ─────────────────────────── healthchecks.io → 2 check үүсгэ: (1) пилот — Period 10 мин, Grace 10 мин; (2) нөөц — Period 1 өдөр, Grace 2 цаг. Ping URL нь нууц үг биш (зөвхөн ping хүлээн авна), гэхдээ нийтэд бүү тавь. |
| `PILOT_HEALTHCHECK_BACKUP_URL` |  |  |
| `PILOT_HEALTHCHECK_INTERVAL_SEC` | `300` | watchdog-ийн ping давтамж (сек). Асуудал гарвал шууд /fail |
| `PUBLIC_APP_URL` | `https://sino.gobiverse.website` | ── Нийтийн хаяг (v0.2.2 D-14, ADR-005; 05_Cloudflare_Tunnel.md) ── Хэрэглэгчийн нээдэг хаяг. Урилгын линк (Блок 3) энэ хаягаар үүснэ; `pilot.ps1 status` харуулна. Cloudflare Tunnel-ийн токен ЭНД БИШ — cloudflared Windows service-д л (чат/git-ээр дамжуулахгүй). |
| `SMTP_HOST` |  | ── Системийн имэйл (v0.2.2 Блок 3 — урилга, нууц үг сэргээх; заавал биш) ── Хоосон бол имэйл суваг идэвхгүй: урилгыг "Линк хуулах"-аар л. Нууц үгийг (SMTP_PASS) чат/git-ээр ДАМЖУУЛАХГҮЙ. Gmail: 2FA асаалттай бүртгэл + App password, SMTP_HOST=smtp.gmail.com, SMTP_PORT=587 (өдөрт ~500 хязгаар). |
| `SMTP_PORT` | `587` |  |
| `SMTP_USER` |  |  |
| `SMTP_PASS` | `***` |  |
| `SMTP_FROM` |  | Илгээгч (хоосон бол SMTP_USER), жнь: S Project <noreply@gobiverse.website> |
| `FILE_ENCRYPTION_KEY` | `***` | v0.2.4 FILE-01 (M-7): хавсралтын AES-256-GCM түлхүүр — base64, 32 байт (openssl rand -base64 32). ЗААВАЛ: хоосон бол JWT_SECRET-ээс гарна → JWT солиход бүх хавсралт уншигдахгүй. Солихгүй; нөөцөөс ТУСАД нь нууц үгийн менежерт хадгална (ADR-002). |
| `MEDIA_URL_SECRET` | `***` | Зургийн гарын үсэгтэй URL-ийн нууц (заавал биш) — хоосон бол JWT_SECRET-ээс. Солиход өмнөх зургийн URL хүчингүй |
| `DEBUG_MENU_ENABLED` | `false` | v0.2.4 Debug цэс (DBG-01) — pilot/staging-д анхдагчаар унтраалттай |

## `apps/web-shell/.env.example`

| Хувьсагч | Жишээ | Тайлбар |
|---|---|---|
| `VITE_SUPABASE_URL` | `http://localhost:54321` |  |
| `VITE_SUPABASE_ANON_KEY` | `***` |  |
| `VITE_API_BASE_URL` |  |  |
| `VITE_FEED` |  | v0.2.3 Блок 5 (M-0): Feed — хоосон = асаалттай («/» болон нэвтэрсний дараа /feed); off = унтраана (модулийн нүүр) |
| `VITE_SENTRY_DSN` |  | v0.2.5 H3 (#18): Sentry (PII-гүй). Хоосон = ачаалахгүй. Release = Vercel commit (VERCEL_GIT_COMMIT_SHA) эсвэл VITE_APP_RELEASE |
| `VITE_SENTRY_ENVIRONMENT` |  |  |
| `VITE_TURNSTILE_SITE_KEY` | `***` | v0.2.5 #27 — Cloudflare Turnstile site key (staging/production). Хоосон = widget-гүй (dev, local, CI). Secret key = Supabase → Auth → Bot protection (энд ✖). Runbook 07_Cloud_Deploy.md §3. |

## pnpm script-үүд

### `package.json` — s-project

| Script | Команд |
|---|---|
| `prepare` | `node -e "try{require('./scripts/git-hooks/install.cjs')}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e}"` |
| `build` | `turbo run build` |
| `dev` | `turbo run dev` |
| `test` | `turbo run test` |
| `test:integration` | `turbo run test:integration` |
| `test:e2e` | `turbo run test:e2e` |
| `lint` | `turbo run lint` |
| `type-check` | `turbo run type-check` |
| `verify:changed` | `node scripts/agent/verify-changed.mjs` |
| `test:agent` | `node --test scripts/agent/*.test.mjs` |
| `docs:gen` | `node scripts/docs/gen-codebase-docs.mjs` |
| `docs:check` | `node scripts/docs/gen-codebase-docs.mjs --check` |
| `clean` | `turbo run clean && rm -rf node_modules` |
| `db:generate` | `cd apps/core-kernel && npx prisma generate` |
| `dev:test-user` | `pnpm --filter @s-project/core-kernel dev:test-user` |
| `pilot:onboard` | `pnpm --silent --filter @s-project/core-kernel pilot onboard` |
| `pilot:user` | `pnpm --silent --filter @s-project/core-kernel pilot user` |
| `camp:snapshot` | `pnpm --silent --filter @s-project/core-kernel camp:snapshot` |
| `camp:login-report` | `pnpm --silent --filter @s-project/core-kernel camp:login-report` |
| `db:migrate` | `supabase migration up` |
| `supabase:start` | `supabase start` |
| `supabase:stop` | `supabase stop` |
| `supabase:status` | `supabase status` |
| `supabase:reset` | `supabase db reset` |
| `playwright:install` | `node node_modules/@playwright/test/cli.js install chromium` |
| `e2e` | `pnpm --filter e2e test:e2e` |
| `e2e:ui` | `pnpm --filter e2e test:ui` |

### `apps/core-kernel/package.json` — @s-project/core-kernel

| Script | Команд |
|---|---|
| `build` | `nest build` |
| `dev` | `nest start --watch` |
| `start` | `node dist/src/main` |
| `test` | `vitest run` |
| `test:unit` | `vitest run` |
| `test:watch` | `vitest` |
| `test:integration` | `prisma generate && vitest run --config vitest.integration.config.ts` |
| `test:coverage` | `vitest run --coverage` |
| `lint` | `eslint src --ext .ts` |
| `type-check` | `tsc --noEmit` |
| `test:load` | `pnpm --filter e2e exec tsx tests/load-test.ts` |
| `dev:test-user` | `tsx src/scripts/dev-test-user.cli.ts` |
| `e2e:fixture` | `tsx src/scripts/e2e-fixture.cli.ts` |
| `pilot` | `tsx src/scripts/pilot-admin.cli.ts` |
| `camp:snapshot` | `tsx src/scripts/camp-snapshot.cli.ts` |
| `camp:login-report` | `tsx src/scripts/camp-login-report.cli.ts` |
| `clean` | `rm -rf dist coverage` |

### `apps/e2e/package.json` — e2e

| Script | Команд |
|---|---|
| `test:e2e` | `playwright test` |
| `test:ui` | `playwright test --ui` |
| `test:headed` | `playwright test --headed` |

### `apps/mfe-requisitions/package.json` — @s-project/mfe-requisitions

| Script | Команд |
|---|---|
| `dev` | `vite` |
| `build` | `tsc --noEmit && vite build` |
| `preview` | `vite preview` |
| `type-check` | `tsc --noEmit` |
| `clean` | `rm -rf dist` |

### `apps/web-shell/package.json` — @s-project/web-shell

| Script | Команд |
|---|---|
| `dev` | `vite` |
| `build` | `tsc --noEmit && vite build` |
| `preview` | `vite preview` |
| `type-check` | `tsc --noEmit` |
| `lint` | `eslint src --ext .ts,.tsx --rulesdir eslint-rules` |
| `clean` | `rm -rf dist` |
| `test` | `vitest run` |

### `packages/i18n/package.json` — @s-project/i18n

| Script | Команд |
|---|---|
| `terms:convert` | `node scripts/convert-exact-term-references.mjs` |

### `packages/prisma-rls-extension/package.json` — @s-project/prisma-rls-extension

| Script | Команд |
|---|---|

### `packages/shared-types/package.json` — @s-project/shared-types

| Script | Команд |
|---|---|
| `type-check` | `tsc --noEmit` |
