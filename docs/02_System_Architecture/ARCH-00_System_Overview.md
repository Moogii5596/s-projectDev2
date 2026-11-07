---
title: "ARCH-00 — Системийн архитектурын тойм (одоо ба зорилт)"
type: "Architecture"
status: "Active"
last_updated: 2026-11-07
tags: [architecture, overview, core]
---

# ARCH-00 — Системийн архитектурын тойм (одоо ба зорилт)

> **Энэ бол архитектурын ганц тойм баримт.** Хэсэг бүрт: ✅ хэрэгжсэн · 🔄 хэсэгчлэн · 🧭 зорилт (одоогийн код биш) · ✖ татгалзсан.
> Нарийвчлал: код → [[00_Codebase_Map]] · шийдвэр → ADR-001…006 · бүтээгдэхүүн → [[PRD-01_Core_Vision]], [[PRD-06_Vision_Business_Model]]. Анхны концепц (2026-09, Kubernetes/gRPC/микросервис): [[ARCH-00_Original_Concept.v1]] — архив.

## 1. Нэг өгүүлбэрээр
**Модульчлагдсан монолит** (NestJS `core-kernel` + React `web-shell`), **нэг PostgreSQL** (Supabase) дээр **RLS-ээр tenant тусгаарлалт**, том байгууллагад **тусдаа deploy** (dedicated) — гаднаа нийгмийн сүлжээ, цаанаа ERP болох зорилготой ([[PRD-06_Vision_Business_Model]]).

## 2. Одоогийн бүтэц (✅)

```
Хэрэглэгч (утас / PC)
  └─ https://<байгууллага>.gobiverse.website ── Cloudflare (DNS, TLS, Tunnel) ── ADR-005
       └─ Caddy (static web-shell + /api/* + /auth/v1 {token,user,logout}; бусад Supabase зам 404)
            ├─ web-shell (React SPA, build-ийн VITE_MODULES)
            └─ core-kernel (NestJS + Fastify, /api/v1)
                 ├─ Guard/Interceptor: TenantAuthGuard → RateLimit → TenantContext → Draining → I18n
                 ├─ Модулиуд: auth · MR + workflow · budget/inventory/vendor/report (lite) · camp (11 дэд модуль) · event-bus
                 ├─ PostgreSQL (Supabase) — app_user (RLS) / postgres (систем)
                 ├─ Supabase Auth (GoTrue) — JWT, нууц үгийн түгжээ (hook)
                 └─ Redis — cache, rate limit, outbox publish
```

| Сэдэв | Одоогийн шийдэл | Баримт |
|---|---|---|
| Tenant тусгаарлалт | ✅ Shared DB + RLS (`app_user` NOBYPASSRLS, FORCE, `set_config` tx дотор); ✅ dedicated deploy (`DEPLOYMENT_MODE=dedicated`) | [[ADR-001_Tenant_Isolation]], [[01_PostgreSQL_MultiTenant_RLS_Spec]] |
| Нэвтрэлт | ✅ Supabase Auth + server sign-in (утас/username/имэйл), урилга, нууц үг сэргээх | [[ADR-003_Users_Login_Permissions]] |
| Эрх | ✅ core role (OWNER…VIEWER) + Кемп RBAC (`camp_user_permissions`, роль-загвар) | [[05_Permissions_Catalog]] |
| Модуль хоорондын холбоо | ✅ **нэг transaction дотор шууд дуудлага** (MR → Budget/Inventory, 2026-10-08); ✅ transactional outbox → Redis (+ DLQ) зөвхөн мэдэгдэл/интеграцид | [[01_Backend_Modules]] |
| Realtime | ✅ Supabase Realtime (MR) — тусдаа WebSocket gateway ✖ | [[01_Core_API_Gateway_ReverseProxy_Spec]] |
| Олон хэл | ✅ mn (анхдагч) / en / zh — frontend json + backend messages + байгууллагын засвар | [[04_Frontend_Map]] |
| Байгууллага холбох | ✅ `<байгууллага>.gobiverse.website`, Cloudflare Tunnel (5 төрөл) | [[ADR-005_Org_Connectivity_Domains]] |
| Пилот / ops | ✅ нэг Windows машин, `pilot.ps1` (upgrade, backup/restore, status), staging | [[04_Pilot_Camp_Windows]] |

## 3. Анхны концепцийн санаа бүрийн төлөв

| Санаа (2026-09 концепц) | Төлөв | Тайлбар |
|---|---|---|
| Microkernel — "Zero business logic core" | 🔄 | Core (auth, tenant, i18n, event bus) тусдаа хавтсанд; гэхдээ нэг NestJS процесс, модулиуд нэг DB |
| Module registry, `manifest.json`, install/activate/suspend | 🔄 | `installed_modules` (manifest_snapshot), `tenant_routes` (ACTIVE/DRAINING/OFFLINE), `DrainingInterceptor` бий; бүтэн lifecycle UI/API байхгүй. Frontend модуль = build-ийн `VITE_MODULES` |
| Модуль бүр тусдаа DB / микросервис, gRPC, mTLS, service mesh, Kubernetes | ✖ | Хэмжээнд тохирохгүй — монолит + RLS (ADR-001). Хэрэгцээ гарвал дахин авч үзнэ |
| Event-driven, outbox, DLQ | ✅ | `outbox_events` → poller → Redis, retry → `dlq_events` |
| Saga / event sourcing | ✖ | Нэг DB-д transaction хангалттай |
| Micro-frontend (Module Federation) | 🔄 | `mfe-requisitions` нэг remote (`/mfe/*`); бусад модуль web-shell дотор |
| Tier 1/2/3 | 🔄 | Tier 1 = shared, Tier 2 = dedicated ✅; Tier 3 air-gapped 🧭 v0.4+ ([[PRD-02_Tenant_Tiers]]) |
| Offline-first, Ed25519 гарын үсэг, sync conflict | 🧭 | v0.4+ (хэрэгтэй эсэх шийдэгдээгүй). DB-д `PROVISIONALLY_APPROVED` төлөв л бий |
| Master data / глобал каталог, байгууллага хоорондын худалдаа | 🧭 | [[PRD-06_Vision_Business_Model]] §6 |
| Нийгмийн сүлжээ (дотоод + нийтийн feed) | 🧭 | v0.3 дотоод Feed ([[PRD-05_Internal_Social_Feed]], [[ADR-004_Feed_Architecture]]) |
| HR суурь модуль | 🔄 | v0.2.2 — [[ADR-006_HR_Core_Module]] |
| Geospatial engine | 🧭 | Тодорхой төлөвлөгөөгүй |
| Distributed tracing, circuit breaker | ✖ / 🔄 | Tracing алга; Supabase унавал 503 (PERF-003), rate limit, cluster backoff бий |
| Secret manager | 🔄 | `.env` (git-гүй); VPC runbook-т нууц үг солих журам ([[03_Enterprise_VPC_Deployment]]) |
| API versioning | ✅ | `/api/v1` угтвар |
| Backup / DR | 🔄 | Пилотод `pilot.ps1` backup/restore; хостингийн шийдвэр (PIL-06, ADR-002) хүлээгдэж байна |
| Feature flag | 🔄 | `VITE_MODULES`, `DEPLOYMENT_MODE` (build/deploy түвшинд) |

## 4. Эрсдэлийн бүртгэл (2026-09-ийн аудитаас + одоо)

| Эрсдэл | Хамгаалалт | Төлөв |
|---|---|---|
| RLS алгасах (superuser холболт, pooler-т context алдагдах, cron/worker-т tenant алга) | `app_user` NOBYPASSRLS + FORCE, `set_config(…, true)` зөвхөн `inTenantTx` дотор, системийн ажил `SYSTEM_DATABASE_URL`, `rls_audit.sql`, тест `rls-leakage` / `rls-app-user` / `tenant-isolation-http` | ✅ |
| Давхар батлалт, race condition | `pessimistic-lock.service`, `idempotency_keys`, advisory lock / `FOR SHARE` (CONC-001/002) | ✅ |
| Event алдагдах (dual write) | Transactional outbox + retry + DLQ | ✅ |
| Нууц үг таах | Supabase `password_verification_attempt` hook (дансны түгжээ) + backend sign-in хязгаар | ✅ |
| Хувийн мэдээлэл бүхий пилот нэг машин дээр | Cloudflare Tunnel, Caddy (зөвхөн шаардлагатай зам), backup; хостингийн шийдвэр | 🔄 PIL-06 |
| Offline sync зөрчил (Tier 3) | — | 🧭 v0.4+ |
| Баримт кодоос хоцрох | RULE-21, `pnpm docs:check` | ✅ |

## 5. Зарчим (шинэ шийдэл гаргахдаа)
1. Энгийн нь эхэлж: монолит + RLS хангалттай бол тусдаа сервис үүсгэхгүй.
2. Tenant өгөгдөл үргэлж RLS-ийн дор (`inTenantTx`); системийн холболт зөвхөн tenant-аас гадуурх ажилд.
3. **Цөм = модуль ажиллуулах хөдөлгүүр, модуль = зөвхөн бизнесийн логик** ([[ADR-009_Module_Engine]], 2026-11-07): нийтлэг боломж цөмд нэг удаа; модуль manifest-ээр бүртгэгдэнэ; цөм → модуль, модуль ↔ модуль import ✖ — цөмд тодорхойлсон интерфейсээр (нэг transaction-д дуудаж болно) эсвэл outbox event; хүснэгтийн угтвар (`core_*`, `camp_*`, `hr_*`, `feed_*`).
4. Шийдвэр бүр ADR болж, энэ хүснэгтийн төлөвийг шинэчилнэ.
