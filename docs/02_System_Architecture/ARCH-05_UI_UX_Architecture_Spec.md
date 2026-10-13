---
title: "ARCH-05 — Frontend архитектур (шийдвэр ба зорилт)"
type: "Architecture"
status: "Active"
last_updated: 2026-10-13
tags: [architecture, frontend, mfe]
---

# ARCH-05 — Frontend архитектур (шийдвэр ба зорилт)

> Хувилбар 2.0 (2026-10-13, бүрэн шинэчилсэн). **Файл, хавтас, хэрхэн нэмэх** → [[04_Frontend_Map]] (энэ баримт зөвхөн шийдвэр/зорилт) · UX зарчим → [[PRD-04_UI_UX_Architecture_Spec]] · анхны хувилбар (Module Federation slot, IndexedDB): [[ARCH-05_UI_UX_Architecture_Spec.v1]] — архив.

## 1. Одоогийн шийдвэрүүд (✅)

| Шийдвэр | Сонголт | Шалтгаан |
|---|---|---|
| Апп | Нэг SPA — `apps/web-shell` (React 18, Vite 6) | Жижиг баг, нэг deploy, хурдан хөгжүүлэлт |
| Модуль асаах | Build-ийн `VITE_MODULES` (`all` / `camp` / жагсаалт) → цэс, route, нүүр | Байгууллага бүр өөр модультай (пилот = Кемп) |
| Micro-frontend | Зөвхөн `apps/mfe-requisitions` (`/mfe/*`, `@module-federation/vite`) — туршилт | Runtime залгах архитектурыг баталгаажуулах; бусад модуль shell дотор |
| Server state | TanStack Query v5 (`campKeys` — key-ийн ганц эх) + axios `api/client.ts` | Cache, invalidate, retry стандарт |
| Client state | React state + localStorage (хэл, сүүлийн кемп) | Глобал store (Zustand/Redux) **ашиглаагүй** — хэрэггүй |
| Нэвтрэлт | Supabase JS session (пилотод same-origin `/auth/v1`) + server sign-in | Caddy зөвхөн token/user/logout-ийг нээнэ |
| Realtime | Supabase Realtime (MR) — амжилтгүй бол чимээгүй | Тусдаа WebSocket gateway хэрэггүй |
| Олон хэл | i18next, хавтгай түлхүүр `packages/i18n/web.{mn,en,zh}.json` + байгууллагын засвар API | Backend-тэй ижил `{param}` хэлбэр |
| Загвар | Tailwind 3, `modules/camp/components/ui.tsx` | Шинэ UI сан нэмэхгүй |
| Dev | Vite proxy `/api` → `:3000` (RULE-19) | CORS-гүй |

## 2. Дүрэм
- Frontend type = backend DTO **ТАМ АДИЛ** нэртэй (RULE-20); алдааг `code`-оор орчуулна.
- Цэвэр логик `lib/`-д (unit тест), хуудас нимгэн.
- Эрхийн шалгалт UI-д зөвхөн **нуух** зориулалттай — жинхэнэ хамгаалалт backend-д.

## 3. Зорилт (🧭 — хэрэгцээ гарвал)
- **Модулийн UI гэрээ** (manifest: sidebar / dashboard widget / route slot, lifecycle `ACTIVE/DRAINING/SUSPENDED`) — backend-ийн `installed_modules` + `tenant_routes`-тай холбох. Анхны тодорхойлолт: [[ARCH-05_UI_UX_Architecture_Spec.v1]] §1.
- **Feed shell** — v0.3-д нүүр нь feed ([[ADR-004_Feed_Architecture]]).
- **Offline / PWA** (Tier 3) — Service Worker + локал кэш, sync — v0.4+.
