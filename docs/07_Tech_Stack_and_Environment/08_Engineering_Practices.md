---
title: "Мэргэжлийн хөгжүүлэлтийн стандарт — одоогийн байдал ба шилжилт"
type: "Guide"
status: "Active"
last_updated: 2026-11-11
tags: [process, ci-cd, release, quality, observability, security, v0.2.5]
---

# Мэргэжлийн хөгжүүлэлтийн стандарт — одоогийн байдал ба шилжилт

> 2026-11-11 · **Active** — шийдвэр → [[09_Team_Handbook]] §14 (PO 2026-11-11); дүрэм `AGENTS.md`-д.
> Бүрэн гарын авлага (нэр томьёо, баг, урсгал, Ready/Done) → [[09_Team_Handbook]]. Энэ файл = зөрүүний шинжилгээ.
> Үндэс: repo-ийн бодит судалгаа (git түүх, CI, тест, release, deploy скрипт) 2026-11-11. Холбоотой: [[ADR-011_Cloud_Hosting]] · [[13_v0.2.5_tech_plan]] · [[VERSIONING]]

## 1. Хүчтэй тал (хадгална)
- **CI бүрэн:** push/PR бүрт lint, Prisma drift, docs:check, unit, integration (жинхэнэ Supabase + Redis), build, Playwright e2e.
- **Тест суурь:** ~115 unit spec, ~82 integration, ~19 e2e; coverage threshold тохируулсан; RLS dual-client тест.
- **Өгөгдлийн аюулгүй байдал:** staging дээр бодит өгөгдлөөр урьдчилан шалгах, `camp:snapshot` A = B, rollback-ийн бэлтгэл — мэргэжлийн багуудад ч ховор сайн дадал.
- **Баримт:** ADR, PRD, tech plan, lessons — шийдвэрийн «яагаад» бичигдсэн. Conventional commit.
- **Нууц:** `.env` git-д ороогүй, `.env.example` бий.

## 2. Зөрүү (нотолгоотой)

| # | Талбар | Одоо | Эрсдэл |
|---|---|---|---|
| G1 | **Git урсгал** | Урт насалдаг `feat/v0.2.4`; `main` 29 commit хоцорсон (сүүлд 11/07); tag-ууд (`v0.2.4`…`v0.2.4.5`) `main`-д алга; PR ашиглаагүй — merge local-д; агентын скрипт commit + tag + push-ийг нэг дор хийдэг | «Одоо юу production-д байгаа» тодорхойгүй; шалгалтгүй код push хийгдэх; rollback-ийн цэг бүдэг |
| G2 | **Release** | 4 өдөрт 5 patch tag; сүүлийн 7 хоногийн 74 commit-ийн 22 нь `fix` — алдаа staging-д илэрч байна; 4 оронтой хувилбар (`v0.2.4.5`) SemVer-ээс гадуур | Staging = тестийн орчин болсон; хувилбарын түүх ойлгомжгүй |
| G3 | **Хяналт (observability)** | Зөвхөн `/healthz`; алдааны tracking алга; бүтэцтэй (JSON) лог алга; uptime monitor, alert алга | Пилот унасныг хэрэглэгч эхэлж мэднэ; алдааны шалтгааныг сэргээх боломжгүй |
| G4 | **Аюулгүй байдал** | Dependabot/Renovate алга; secret scanning, CodeQL тохиргоо тодорхойгүй; staging-д пилотын **бодит PII** хуулагддаг | Эмзэг сан анзаарагдахгүй; PII олон газар тархах |
| G5 | **Орчны давхардал** | Пилот PC-ийн өөрийн стек (Supabase CLI, Caddy, PowerShell скрипт) — сүүлийн fix-үүдийн ихэнх нь энэ стекийн асуудал | v0.2.5-аар ихэнх нь арилна (managed үйлчилгээ) |
| G6 | **Ажил хянах** | Backlog, явц markdown-д; commit ↔ ажил ↔ PR холбоосгүй | Олон агенттай үед хэн юу хийснийг мөрдөхөд хэцүү |
| G7 | **Runbook / incident** | Pilot runbook PC-д зориулсан; incident (осол) журам, postmortem загвар алга | Осолд яаж хариу өгөх нь тодорхойгүй |

## 3. Зорилтот стандарт

### 3.1 Git ба review (trunk-based)
- `main` = үргэлж deploy хийж болох төлөв. Ажил бүр **богино branch** (`feat/<блок>`, 1–3 өдөр) → **PR** → CI ногоон → squash merge. Урт насалдаг хувилбарын branch ✖.
- **Branch protection (`main`):** шууд push ✖, CI-ийн шаардлагатай шалгалтууд ногоон байх, branch шинэчлэгдсэн байх. Ганц хүний repo тул «шаардлагатай approve» биш — **PR template-ийн checklist** (`AGENTS.md` §2) + **хоёр дахь агентын review** (өөр загвар/агент PR-ийг шалгаж тайлбар бичнэ).
- Агент commit/push хийж болно (өөрийн branch), **merge, tag, deploy** — хэрэглэгч (GitHub UI / утаснаас).

### 3.2 Хувилбар ба release
- Staging-д **pre-release tag** (`v0.2.5-rc.1`, `-rc.2`…); пилотод батлагдсаны дараа л **`v0.2.5`**. Ингэвэл staging-д олдсон алдаа шинэ rc болж, пилотын хувилбарын дугаар цэвэр үлдэнэ.
- Пилотын яаралтай засвар: одоо v0.2.x-ийн PATCH талбарыг feature хувилбарт ашиглаж байгаа тул ([[VERSIONING]]) засварт сул талбар алга → 4 оронтой tag гарсан. Шийдэл → §5 Q2.
- Tag зөвхөн `main`-аас, **release workflow**-оор (CHANGELOG-ийг conventional commit-оос автоматаар — release-please).
- Release бүр: staging (rc) → TC → хэрэглэгч батлах → pilot. Алдаа rc-д олдвол rc+1 — пилотод хүрэхээс өмнө.

### 3.3 CI/CD ба орчин ([[ADR-011_Cloud_Hosting]])
- PR бүрт Vercel **preview** орчин (frontend) автоматаар.
- `main` → staging автоматаар; tag → GitHub Environment `pilot` (хэрэглэгч батална) → нөөц → migration → deploy → health → алдаатай бол автоматаар зогсох.
- Migration: **expand → contract** (багана устгах/нэр солихыг хоёр хувилбарт хувааж, хуучин код шинэ schema-тай ажиллах) — rollback-д код буцаахад DB эвдрэхгүй.
- Staging-ийн өгөгдөл: production-ий хуулбар (PII нууцлал — PO-ийн шийдвэрээр одоохондоо үгүй; хандалтыг багаар хязгаарлана).

### 3.4 Хяналт
- **Алдааны tracking:** Sentry (үнэгүй багц) — backend + frontend, release-ээр бүлэглэнэ, **PII-г илгээхгүй** (scrub).
- **Лог:** JSON бүтэцтэй, `requestId`, `tenantId` (хувийн мэдээлэлгүй); Render-ийн лог.
- **Uptime:** гаднын monitor (үнэгүй) `/health` — pilot, staging; унавал имэйл.
- Сарын шалгалт: нөөцийн restore, хамаарлын шинэчлэл, алдааны top-10.

### 3.5 Аюулгүй байдал
- Dependabot (долоо хоног бүр, бүлэглэсэн PR) + security alert; GitHub secret scanning; `pnpm audit` CI-д (high+ → анхааруулга).
- Нууц: зөвхөн GitHub/Render/Vercel Secrets; сэргээх (rotation) журам runbook-д.
- Нэвтрэлт: NestJS түгжээ + GoTrue-г тойрох эрсдэлийн шийдэл ([[13_v0.2.5_tech_plan]] H1).

### 3.6 Ажил ба баримт
- Ажил = **GitHub Issue** (ID-тай, PR `Closes #N`) — эсвэл одоогийн markdown backlog хэвээр, PR тайлбарт ажлын ID заавал (§5 Q4).
- Runbook: deploy, restore, нууц сэргээх, incident (илрүүлэх → мэдэгдэх → засах → postmortem загвар).

## 4. Хэрэгжүүлэх дараалал

| Хэзээ | Ажил |
|---|---|
| **v0.2.5** (CI/CD-тэй хамт, ~1 өдөр нэмэлт) | Branch protection + PR урсгал; PR template; `main` = trunk (feat/v0.2.4-ийг merge); rc tag; GitHub Environment `pilot`; Sentry + JSON лог + uptime; Dependabot + secret scanning; deploy/restore/incident runbook |
| **v0.2.6** | release-please (CHANGELOG автомат); PR preview; expand/contract дүрэм `08_Patterns`-д |
| **v0.2.7+** | Ачааллын тест, DR дадлага (бүтэн сэргээлт), SLO (жнь 99% сарын uptime), аюулгүй байдлын шалгалт (OWASP checklist) |

## 5. Шийдвэр
PO 2026-11-11 → [[09_Team_Handbook]] §14: PR + branch protection ✅ (merge = Tech Lead), rc + 4 оронтой hotfix ✅, staging PII нууцлал ❌ (одоохондоо), GitHub Issues + Projects ✅, Sentry ✅, 1 долоо хоногийн iteration ✅, Copilot review ✅.
