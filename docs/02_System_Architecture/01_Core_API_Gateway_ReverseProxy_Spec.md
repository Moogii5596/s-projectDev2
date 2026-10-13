---
title: "Gateway ба хүсэлтийн зам (edge → API)"
type: "Architecture"
status: "Active"
last_updated: 2026-10-13
tags: [architecture, gateway, api, security]
---

# Gateway ба хүсэлтийн зам (edge → API)

> Хувилбар 2.0 (2026-10-13, бүрэн шинэчилсэн). Тусдаа API Gateway / reverse proxy **сервис байхгүй** — edge (Cloudflare + Caddy) ба NestJS-ийн guard/interceptor гинж тэр үүргийг гүйцэтгэнэ. Endpoint жагсаалт: [[02_API_Catalog]] · урсгалын диаграм: [[00_Codebase_Map]] §3 · анхны хувилбар (manifest proxy, Dual-Protocol, Express): [[01_Core_API_Gateway_ReverseProxy_Spec.v1]] — архив.

## 1. Давхаргууд

| Давхарга | Юу хийдэг | Хаана |
|---|---|---|
| Cloudflare | DNS, TLS, Tunnel (нээлттэй порт хэрэггүй); `CF-Connecting-IP` | [[ADR-005_Org_Connectivity_Domains]], [[05_Cloudflare_Tunnel]] |
| Caddy (пилот) | `127.0.0.1:8088`; `/api/*` → backend (`X-Real-IP` дамжуулна); `/auth/v1/{token,user,logout}` → Supabase Auth; **бусад Supabase зам** (`/auth/*`, `/rest/*`, `/storage/*`, `/realtime/*`, `/graphql/*`…) → 404; static web-shell (SPA fallback); body ≤ 20 MB; аюулгүй байдлын header (CSP, HSTS, X-Frame-Options DENY) | `deploy/pilot/Caddyfile` |
| NestJS (Fastify) | `/api/v1` угтвар, JSON body ≤ 4 MB, файл ≤ 2 MB (multipart, 1 файл) | `common/http/configure-app.ts`, `multipart.ts` |
| Guard / Interceptor (глобал) | `TenantAuthGuard` → `TenantRateLimitGuard` → `TenantContextInterceptor` → `DrainingInterceptor` → `I18nInterceptor` | `app/app.module.ts` |

> Docker / VPC deploy: backend image (Node 22) + shell image (nginx) — урд талын proxy-ийн тохиргоо [[03_Enterprise_VPC_Deployment]]-д; Caddy-ийн дээрх хаалтын дүрмийг (Supabase-ийн зам 404) тэнд ч хангах ёстой.

## 2. Tenant тодорхойлох ба нэвтрэлт
1. JWT (Supabase) шалгана; `@SkipAuth()` route (health, sign-in, урилга, нууц үг мартсан) алгасна.
2. Tenant: **shared** горимд Host-ийн дэд домэйн → slug (`auth/tenant-slug.ts`); **dedicated** горимд `.env`-ийн `DEDICATED_TENANT_SLUG` (домэйноос үл хамаарна).
3. Membership (хэрэглэгч тухайн tenant-д идэвхтэй эсэх) — Redis cache (эерэг 5 мин, сөрөг 30 сек).
4. `must_change_password` хэрэглэгч зөвхөн `@AllowPasswordChangeRequired()` route-д.
5. Supabase Auth унавал 503 (401 биш) — PERF-003 / AUTH-003.

## 3. Хязгаарлалт ба хамгаалалт
- **Tenant rate limit** (Redis) — `config/rate-limit.ts`.
- **Нэвтрэлт:** backend sign-in хязгаар (бодит IP = `X-Real-IP`, Caddy `trusted_proxies 127.0.0.1`) + Supabase `password_verification_attempt` hook (бүртгэлийн түгжээ 5 / 15 мин).
- **Cookie** `.gobiverse.website` түвшинд хэзээ ч тавихгүй (байгууллага хооронд session холилдохгүй).
- Алдааны хариу: `{ statusCode, code, params, message }` — `code` тогтвортой, `message` хэрэглэгчийн хэлээр.

## 4. Модулийн route бүртгэл ба draining (🔄)
- `tenant_routes` (`POST/DELETE /api/v1/routes`) + `DynamicIngressRouterService`: route төлөв `ACTIVE / DRAINING / OFFLINE`.
- `DrainingInterceptor`: route `DRAINING` үед **бичих** хүсэлтэд 503 `SERVICE_DRAINING`, нээлттэй хүсэлт дуусахыг хүлээнэ.
- Downstream сервис рүү proxy хийх (модуль бүр тусдаа порт) — ✖ (бүх модуль нэг процесс). Модулийн lifecycle-ийн зорилт: [[ARCH-00_System_Overview]] §3.

## 5. Realtime
Supabase Realtime (WebSocket) — frontend шууд; Caddy-д `/realtime/*` хаалттай тул пилотод realtime **ажиллахгүй**, UI чимээгүй алгасна (MR хуудас). Тусдаа WebSocket gateway ✖.
