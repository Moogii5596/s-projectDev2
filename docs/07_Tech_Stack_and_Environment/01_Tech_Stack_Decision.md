---
title: "Технологийн стек (одоогийн, шалтгаантай)"
type: "Architecture"
status: "Active"
last_updated: 2026-10-13
tags: [stack, architecture]
---

# Технологийн стек (одоогийн, шалтгаантай)

> Хувилбар 2.0 (2026-10-13, бүрэн шинэчилсэн; хувилбарын дугаар `package.json`-ээс). Орчин асаах: [[02_Local_Supabase_Docker_Windows]] · env / script: [[06_Config_Env]] · анхны хувилбар (Vite 5, MR тусдаа сервис, `.env.local`): [[01_Tech_Stack_Decision.v1]] — архив.

## 1. Стек

| Давхарга | Технологи (хувилбар) | Шалтгаан / тэмдэглэл |
|---|---|---|
| Хэл | TypeScript ^5.4 | Backend + frontend нэг хэл |
| Runtime | Node ≥ 20 (Docker image Node 22) | — |
| Monorepo | pnpm 9.12 workspaces + Turborepo ^2.3 | `apps/*`, `packages/*`; pnpm strict (RULE-09) |
| Backend | NestJS ^11.2 + **Fastify 5** (`@nestjs/platform-fastify`) | DI, guard/interceptor; Fastify — хурд, multipart |
| Validation | class-validator ^0.14 (DTO), zod ^3.23 (env) | — |
| ORM | Prisma ^5.22 (**client л**; schema = SQL migration, MIG-001; `prisma/schema/*.prisma` модулиар, R22) | `@db.Uuid` бүрт (RULE-05) |
| DB | PostgreSQL (Supabase local / self-hosted, Docker) | RLS ([[01_PostgreSQL_MultiTenant_RLS_Spec]]) |
| Auth | Supabase Auth (GoTrue) + `@supabase/supabase-js` ^2.46 | JWT, нууц үгийн hook |
| Cache / queue | Redis + ioredis ^5.4 | Membership cache, rate limit, outbox publish |
| Cron | `@nestjs/schedule` ^4.1 | Outbox poller (5 сек), escalation (15 мин) |
| Excel | exceljs 4.4.0 | Импорт/экспорт (ирц, ажилтан, хэлтэс, орчуулга) |
| Имэйл | nodemailer 10.1.7 | SMTP (урилга, нууц үг) |
| Frontend | React ^18.3 + Vite ^6.0 | SPA `web-shell` ([[ARCH-05_UI_UX_Architecture_Spec]]) |
| Server state | TanStack Query ^5.62 (+ react-virtual) · axios ^1.7 | Глобал store алга |
| Routing | react-router-dom ^6.28 | — |
| i18n | i18next 23.16 + react-i18next 15.1 | mn / en / zh |
| CSS | Tailwind ^3.4 | — |
| Micro-frontend | `@module-federation/vite` ^1.0 | Зөвхөн `mfe-requisitions` |
| Тест | Vitest ^1.6 (+ unplugin-swc, RULE-08) · Playwright ^1.48 | Unit / integration (бодит PG) / e2e — [[07_Test_Map]] |
| Lint | ESLint ^8.57 + @typescript-eslint ^7.18 | `.eslintrc.cjs` |
| Edge | Cloudflare (DNS, Tunnel) · Caddy (пилот) · nginx (Docker shell) | [[01_Core_API_Gateway_ReverseProxy_Spec]] |
| Ops | Docker Desktop (Windows), PowerShell 5.1 (`pilot.ps1`) | [[04_Pilot_Camp_Windows]] |

## 2. Хэрэглэхгүй гэж шийдсэн / хасагдсан
| Зүйл | Шалтгаан |
|---|---|
| Express | Fastify-д шилжсэн (NestJS adapter) |
| Schema-per-tenant | RLS + dedicated deploy (ADR-001) |
| Модуль бүр тусдаа сервис / порт, gRPC, Kubernetes | Монолит хангалттай ([[ARCH-00_System_Overview]]) |
| `prisma db push` | Migration файл л (MIG-001) |
| Zustand / Redux | Хэрэггүй — React Query + local state |
| Supabase REST/Storage/GraphQL-ийг интернэтэд | Caddy-д хаалттай; бүх өгөгдөл NestJS API-аар |

## 3. Шинэ хамаарал нэмэх дүрэм
1. Одоо байгаагаар шийдэгдэх эсэхийг эхлээд шалга (жнь UI — `ui.tsx`, Excel — exceljs).
2. Хувилбарыг тогтмол (exact) эсвэл `^` — lockfile commit (`pnpm-lock.yaml`).
3. Энэ хүснэгт ба [[CHANGELOG]]-д нэм; Docker image-д орох эсэхийг шалга.
