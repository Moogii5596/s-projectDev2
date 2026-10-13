---
title: "Хөгжүүлэлтийн Roadmap (хувилбарын ганц эх сурвалж)"
type: "Roadmap"
status: "Active"
last_updated: 2026-10-13
tags: [roadmap]
---

# Хөгжүүлэлтийн Roadmap

> **Хувилбарын жагсаалтын ганц эх сурвалж** — бусад баримт энд линк хийнэ (хүснэгт хуулахгүй). Одоогийн ажил → [[project-status]] · v0.2 нарийвчилсан → [[03_v0.2_full_plan]] · бүтээгдэхүүн → [[PRD-01_Core_Vision]] · хуучин бүтэн roadmap (MVP–v0.1.x, Air-Gapped дэд төлөвлөгөө): [[01_Development_Roadmap_v1]] — архив. Дугаарлалт: [[VERSIONING]].

## 1. Хувилбарууд

| Хувилбар | Агуулга | Төлөв | Огноо |
|---|---|---|---|
| `v0.1.0` | Tier 1 core: MR, workflow, outbox, RLS, frontend MVP, E2E + CI | ✅ | 2026-09-21 |
| `v0.1.5` | Tier 2 (dedicated), RLS runtime (`app_user`), advanced workflow, Redis, Budget/Inventory/Vendor/Report lite, **Кемп V1** | ✅ | 2026-10-10 |
| `v0.1.6` / `v0.1.6.1` | Кемп пилот (Sino Hydro, нэг Windows машин) — v0.1-ийн сүүлийн | ✅ | 2026-10-10 |
| `v0.2.0` | Пилотын санал, олон хэл (mn/en/zh), бөөнөөр оруулах, upgrade/staging | ✅ | 2026-10-11 |
| `v0.2.1` | Хоолны тооцоо албан тушаалаар, мониторинг, нөөц, нэвтрэлтийн түгжээ | ✅ | 2026-10-12 |
| **`v0.2.2`** | **Хэрэглэгч ба ажилтан** (ADR-003) + **HR модуль** (ADR-006) | 🔄 | ~11-р сарын 22 |
| `v0.2.3` | Хөрөнгө ажилтанд (C-10), ээлжийн календарь (C-13), гэрээ + үнэ (V2-01), V2-05 | 📋 | ~12-р сарын 10 |
| `v0.2.4` | Кемп V2 (хоолны захиалга, тээвэр/хог, зардлын тайлан), I18N, хостинг (PIL-06) — v0.2-ийн эцсийн release | 📋 | ~12-р сарын 31 |
| `v0.3.0` | Байгууллагын дотоод Feed ([[PRD-05_Internal_Social_Feed]], [[ADR-004_Feed_Architecture]]) | 📝 | — |
| `v0.4.0+` | Нийтийн сүлжээ + худалдаа ([[PRD-06_Vision_Business_Model]]), чат, Tier 3 Air-gapped (хэрэгтэй эсэх шийдэгдээгүй) | 🧭 | — |
| `v1.0.0` | Олон нийтэд нээлттэй production | 🎯 | — |

Тэмдэглэгээ: ✅ гарсан · 🔄 хөгжүүлэлт · 📋 төлөвлөсөн · 📝 урьдчилсан · 🧭 алсын.

## 2. Шийдвэрийн бүртгэл (roadmap-д нөлөөлсөн)

| Огноо | Шийдвэр | Баримт |
|---|---|---|
| 2026-10-08 | Schema-per-tenant → RLS + dedicated deploy | [[ADR-001_Tenant_Isolation]] |
| 2026-10-08 | Модулиуд нэг transaction дотор шууд холбогдоно (MR → Budget/Inventory) | [[01_Backend_Modules]] |
| 2026-10-09 | Кемп модуль: V1 (шат 1–4, 8, 9), V2 (шат 5–7) хойшлуулсан (D8) | [[01_plan_and_erd]] |
| 2026-10-10 | Пилот v0.1.6 (Sino Hydro) эхэлсэн | [[04_Pilot_Camp_Windows]] |
| 2026-10-11 | v0.1 хаагдсан; v0.2 = пилот + Кемп V2 + өр; v0.3 = дотоод Feed; Air-Gapped → v0.4+ | [[01_plan_draft]], [[03_v0.2_full_plan]] |
| 2026-10-11 | Хэрэглэгч = ажилтны бүртгэлээс; эрх загвар → хэрэглэгч | [[ADR-003_Users_Login_Permissions]] |
| 2026-10-12 | Байгууллага бүр `<байгууллага>.gobiverse.website`, Cloudflare Tunnel (Oracle — Out of Capacity) | [[ADR-005_Org_Connectivity_Domains]] |
| 2026-10-13 | Систем бүх салбарт; 2 төрлийн сүлжээ; сурталчилгаа/худалдаа нийтийн сүлжээнд | [[PRD-06_Vision_Business_Model]] |
| 2026-10-13 | Ажилтан/хэлтэс/ээлж/ирц → HR модуль (v0.2.2) | [[ADR-006_HR_Core_Module]] |

## 3. Хувилбар гаргах нөхцөл (бүх хувилбарт)
1. Блок бүр: type-check, lint, холбогдох тест ногоон; `pnpm docs:check` ✓ (RULE-21).
2. Staging дээр upgrade → `camp:snapshot` A = B (өгөгдөл өөрчлөгдөхгүй бол) — [[04_Pilot_Camp_Windows]].
3. [[CHANGELOG]] (⚠️ зан төлөвийн өөрчлөлт тусад нь), tag, пилот шинэчлэх.
4. [[project-status]] ба энэ хүснэгтийн төлөв.

## 4. Алсын (🧭) — нарийвчлалгүй
- Модулийн бүтэн lifecycle (суулгах / түдгэлзүүлэх), runtime UI залгах — [[ARCH-00_System_Overview]] §3.
- Tier 3 offline-first — анхны төлөвлөгөө [[01_Development_Roadmap_v1]] («v0.4.0+ Air-Gapped»), [[PRD-02_Tenant_Tiers]] §3.
- Байгууллага хоорондын худалдаа, глобал каталог — [[PRD-06_Vision_Business_Model]] §6.
