---
title: "Багийн гарын авлага — мэргэжлийн хөгжүүлэлтийн баг шиг ажиллах (S Project)"
type: "Guide"
status: "Active"
last_updated: 2026-11-11
tags: [process, team, agents, glossary, ci-cd, release, quality, operations, handbook]
---

# Багийн гарын авлага — мэргэжлийн хөгжүүлэлтийн баг шиг ажиллах

> **Зорилго:** v0.2.5-аар үүлэн хостинг руу шилжсэний дараа S Project-ийг **туршлагатай, олон гишүүнтэй хөгжүүлэлтийн баг** шиг ажиллуулах — гишүүд нь AI агентууд, Product Owner нь хэрэглэгч.
> **Төлөв:** Active — PO 2026-11-11-нд §14-ийн шийдвэрийг гаргасан; гол дүрэм `AGENTS.md` §0, §4, §7-д. **v0.2.5-аас мөрдөнө.**
> **Нотолгоо:** repo-ийн судалгаа 2026-11-11 (git түүх, CI, баримтын нэр томьёоны тоолол). Зөрүүний дэлгэрэнгүй → [[08_Engineering_Practices]]. Хостинг → [[ADR-011_Cloud_Hosting]].

**Унших дараалал (судлахад):** §1 нэр томьёо → §4 багийн бүтэц → §5 ажлын урсгал → §6 Ready/Done → §2–3 (юуг өөрчлөх) → бусад нь лавлах.

---

## 1. Нэр томьёо — буруу эсвэл бүдэг хэрэглэж буй үгс

Баримтад олон давтагдаж буй үгс (тоо = `docs/`-д гарсан тоо, 2026-11-11). Нэг үг олон утгатай байх нь агентуудын алдааны гол эх үүсвэр.

| Бидний хэлдэг | Тоо | Асуудал | Мэргэжлийн нэр (хэрэглэх) |
|---|---|---|---|
| **«Пилот»** (орчин) | 413 | Хөтөлбөр (байгууллагатай туршилт) ба орчин (сервер) хоёрыг нэг үгээр | Орчин → **production (prod)**. Хөтөлбөр → **пилот хөтөлбөр** (Sino Hydro). «Пилот дээр deploy» биш **«prod-д deploy»** |
| **«Upgrade»** (pilot/staging upgrade) | 100 | Upgrade = хэрэглэгч өөрөө суулгасан программыг шинэчлэх | **Deployment (deploy)**: «staging-д v0.2.5-rc.1-ийг deploy хийв» |
| **«Хувилбар»** | — | Дугаар, гаргалт, төлөвлөлтийн мөчлөг гурвыг нэг үгээр | **Version** (`v0.2.5` дугаар) · **Release** (хэрэглэгчид хүргэх үйл явц) · **Iteration / milestone** (төлөвлөлтийн мөчлөг) |
| **«Блок»** | 452 | Ажлын хэмжээ тодорхойгүй (1 цагаас 3 өдөр хүртэл) | **Epic** (том боломж) → **User story** (хэрэглэгчийн үнэ цэнэ, хүлээн авах шалгууртай) → **Task** (техникийн ажил) |
| **«Tech plan»** | — | Явц хянах, дизайн, хүрээ гурвыг нэг файлд | **Iteration backlog** (явц — issue tracker-т) + **Technical design** (дизайн — ADR/RFC) |
| **«Master plan»** | — | Зөв, гэхдээ огноо «блок/өдөр»-өөр | **Product roadmap** — огноо бодит **throughput**-аас (§11) |
| **«Зогссон цэг»** | 9 | Сайн санаа | **Handoff note** / WIP тэмдэглэл — issue-ийн comment-д |
| **«A = B»** | 97 | Сайн дадал, нэр нь ойлгомжгүй | **Data parity check** / **migration verification** (snapshot regression) |
| **«TC-v023»** | 185 | Хэн, хэзээ, юуг баталдаг нь тодорхойгүй | **UAT** (User Acceptance Testing) — Product Owner staging дээр хүлээн авах тест |
| **«Дууссан ✅»** (local шалгагдсан, commit хийгээгүй) | 37 | Local-д ажилласан ≠ дууссан | **Done** = §6-ийн Definition of Done (merge + CI + staging) |
| **«Debug цэс», «унтаа модуль»** | 79 | Онцлог (feature)-ийг асаах/унтраах механизм | **Feature flag** + **admin console** |
| **«Sprint»** | 132 | Хуучин үе шатанд нэр болгон хэрэглэсэн; sprint-ийн дадал (timebox, review, retro) алга | Дадлыг хэрэгжүүлэх (§5.3) эсвэл «шат/iteration» гэх |
| **«Lessons learned»** | — | Алдааны тэмдэглэл, мэдлэг хоёр холилдсон | Осол → **postmortem** (blameless); мэдлэг → **knowledge base** |
| **«P0»** | 24 | Тэргүүлэх зэрэг ба ослын зэрэг холилдсон | Backlog: **Priority P1–P4**. Осол: **Severity SEV1–SEV4** (§10) |
| **«Шалгах»** | — | 4 өөр үйлдэл | **Test** (автомат) · **Verify** (хөгжүүлэгч өөрөө) · **Review** (өөр гишүүн кодыг) · **Approve** (Product Owner шийдвэр) |
| **«Staging clone»** | 4 | — | **Staging refresh** (prod-ийн хуулбараас, PII нууцалж) |
| **«Агент»** | — | Хэрэгсэл гэж харах | **Багийн гишүүн** — тодорхой үүрэгтэй (§4) |
| **«Rollback бэлтгэл»** | — | Зөв | **Rollback rehearsal** / **DR drill** |

**Дүрэм:** шинэ баримт, issue, commit-д баруун баганын нэрийг хэрэглэнэ. Хуучин баримтыг бөөнөөр нь засахгүй — хөндөх үедээ засна.

---

## 2. Хэрэглэхгүй байгаа арга барил

| Арга барил | Юу вэ | Яагаад хэрэгтэй |
|---|---|---|
| **Pull Request (PR) + code review** | Өөрчлөлт бүр PR-ээр, өөр гишүүн шалгаж байж merge | Зохиогч өөрийн алдааг хардаггүй — 7 хоногт 22 `fix` |
| **Branch protection** | `main`-д шууд push хориглох, CI ногоон заавал | «Шалгаагүй код» физикийн хувьд орж чадахгүй |
| **Trunk-based development** | `main` үргэлж deploy хийж болох; богино branch | Урт `feat/v0.2.4` ба 29 commit хоцорсон `main`-ийн асуудал |
| **User story + acceptance criteria** | «Кемп менежер ... хийхийг хүсдэг, ингэснээр ...» + шалгуур | «Бүрэн хийх»-ийн хүрээ тодорхой болно |
| **Definition of Ready / Done** | Эхлэх ба дуусах албан шалгуур | §6 |
| **Issue tracker** | Ажил бүр ID-тай, PR-тэй холбоотой | Олон агент зэрэг ажиллахад markdown checkbox мөргөлддөг |
| **Iteration ceremonies** | Planning, daily status, demo, retro | Багийн хэмнэл, сайжруулалт (§5.3) |
| **Feature flags** | Дуусаагүй онцлогийг prod-д нууж deploy хийх | Том release-ийг жижиг болгох |
| **Observability** | Алдааны tracking, бүтэцтэй лог, uptime, alert | Хэрэглэгчээс өмнө мэдэх (§10) |
| **Incident management** | Зэрэглэл, хариу үйлдэл, postmortem | §10 |
| **Dependency management** | Dependabot/Renovate, аюулгүй байдлын alert | Эмзэг сан |
| **Pre-release tag** | `v0.2.5-rc.1` staging-д | Prod-ийн дугаар цэвэр |
| **Separation of duties** | Бичсэн ≠ шалгасан ≠ deploy хийсэн | Хамгийн чухал хамгаалалт |
| **Metrics (DORA)** | Deploy давтамж, lead time, change failure rate, сэргээх хугацаа | Сайжирч байгаа эсэхийг тоогоор (§11) |

---

## 3. Буруу хэрэглэж буй арга барил

| # | Одоо | Асуудал | Зөв |
|---|---|---|---|
| M1 | **Staging = тест хийх газар** (4 өдөрт 5 patch tag) | Алдаа CI-д биш staging-д илэрч байна | Staging = **урьдчилсан баталгаажуулалт** (UAT, data parity). Алдаа CI, PR review, preview орчинд илрэх ёстой |
| M2 | **Урт насалдаг хувилбарын branch, tag нь feature branch дээр** | Prod-д юу байгаа тодорхойгүй | Tag зөвхөн `main`-аас |
| M3 | **Агентын скрипт commit + tag + push нэг дор** | Хяналтгүй гаргалт | Агент → PR; merge, tag, deploy → PO-ийн батламжтай pipeline |
| M4 | **Нэг агент бичиж, өөрөө «дууссан» гэж баталгаажуулдаг** | v0.2.4-ийн «5 блок нэг өдөрт» → дараа нь олон засвар | Review өөр гишүүн; Done = §6 |
| M5 | **Том хувилбар (9–22 ажил) нэг дор** | Эрсдэл бөөгнөрнө, rollback хэцүү | Жижиг, ойр ойрхон release; feature flag |
| M6 | **Markdown-ийг явцын tracker болгох** (олон агент нэг файлыг засдаг) | Commit хийгээгүй мөргөлдөөн (11/11-нд ажиглагдсан) | Явц → issue; баримт → зөвхөн шийдвэр, дизайн |
| M7 | **Огноог AI-ийн оргил хурдаар** («5 блок/өдөр») | Төлөвлөгөө бодит бус | Сүүлийн 3 iteration-ий бодит throughput |
| M8 | **Prod-ийн үйлдэл PowerShell скриптээр гараар** | Давтагдашгүй, бичигдэхгүй | Pipeline (v0.2.5) |
| M9 | **Prod-ийн бодит PII staging-д** | Хувийн мэдээлэл тархана | PO шийдвэр (§14 Q3): одоохондоо хэвээр, хандалтыг хязгаарлана; дахин үнэлэх — v0.3 |
| M10 | **Нэг чатад олон сэдэв, олон ажил** (буруу чат руу лог илгээх) | Контекст холилдоно | Нэг ажил = нэг issue = нэг агентын session |
| M11 | **Олон баримт, олон дүрэм** (дүрмийг 2026-11-07-нд аль хэдийн багасгасан) | Хурдыг сааруулна | Дүрэм = `AGENTS.md` + энэ гарын авлага; автомат шалгалтаар (CI) хэрэгжүүлнэ, үгээр биш |

---

## 4. Багийн бүтэц (олон агенттай баг)

> Бодит баг (хэрэгсэл, дамжуулалт, PO-ийн 3 хаалга) → **[[10_Agent_Team_Workflow]]** — энэ хэсэг нь ерөнхий загвар.

| Үүрэг | Хэн | Хариуцлага | Хийхгүй |
|---|---|---|---|
| **Product Owner (PO)** | Хэрэглэгч | Юу хийх, тэргүүлэх зэрэг, хүлээн авах (UAT), **merge/prod deploy батлах** | Код бичих, техникийн шийдвэрийг дангаар |
| **Tech Lead / Architect** | Claude (Project-ийн үндсэн чат) | Архитектур, ADR, ажлыг story/task болгох, гэрээ (interface, DTO, schema), агентуудад хуваарилах, PR-ийг эцэслэн review, release бэлтгэх | Өөрийн бичсэн кодоо өөрөө батлах |
| **Developer** | Claude Code / Cursor / Copilot / Devin (worktree тус бүр) | Нэг story/task-ийг бүрэн (DB → API → UI → i18n → тест), PR нээх | Merge, tag, deploy; өөр агентын branch-д бичих |
| **Reviewer** | Өөр агент (зохиогчоос өөр загвар/хэрэгсэл) | PR-ийн код, тест, аюулгүй байдал, дүрмийн нийцлийг шалгаж comment | Ажлыг дахин бичих |
| **QA** | Агент (e2e) + PO (UAT) | E2E тест, regression, staging-ийн UAT checklist | — |
| **Release / DevOps** | Pipeline (GitHub Actions) + Tech Lead | Deploy, нөөц, хяналт, runbook | Батламжгүй prod deploy |
| **Tech Writer** | Developer (өөрийн ажлынх) + Tech Lead (release) | Баримт кодын хамт | — |

**RACI товч:** Story бичих — PO (A), Tech Lead (R) · Хэрэгжүүлэх — Developer (R), Tech Lead (A) · Review — Reviewer (R) · Merge — PO (A) · Prod deploy — PO (A), Pipeline (R) · Осол — Tech Lead (R), PO (A, I).

**Зэрэгцээ ажиллах дүрэм:** нэг task = нэг branch = нэг worktree = нэг агент = нэг PR. Хоорондоо уялдаатай бол **гэрээ эхэлж** (Tech Lead эхний PR-ээр interface/DTO/schema) — дараа нь зэрэг. Хуваалцдаг файлд (i18n, route, эрхийн registry) зөвхөн өөрийн мөр.

---

## 5. Ажлын урсгал

### 5.1 Нэг ажлын амьдралын мөчлөг
1. **Санаа / хүсэлт** (PO, санал хүсэлт, Feed) → **issue** (`type: story|bug|task|chore`, priority).
2. **Refinement** (Tech Lead): user story + acceptance criteria, хэмжээ (S/M/L; L-ийг хуваана), шаардлагатай бол ADR, task-ууд, гэрээ → **Ready** (§6).
3. **Хуваарилах** — iteration planning-д агент бүрт.
4. **Хөгжүүлэх** — worktree `feat/<issue#>-<товч>`; жижиг commit (conventional).
5. **PR** — template бөглөх, `Closes #N`; CI ногоон; Vercel preview.
6. **Review** — Reviewer агент → засвар → Tech Lead approve.
7. **Merge** — PO (GitHub, утаснаас) → squash merge `main`.
8. **Staging** — автоматаар deploy; smoke тест автомат.
9. **Release** — Tech Lead `rc` tag → UAT (PO) → final tag → **prod deploy (PO батлана)**.
10. **Хяналт** — 24 цаг алдаа/uptime ажиглах; асуудал → §10.

### 5.2 Bug-ийн урсгал
Илрэх → issue (давтах алхам, хүлээгдэж буй/бодит үр дүн, орчин, severity) → **эхлээд алдааг давтах тест** → засвар → PR → ердийн урсгал. Prod-ийн SEV1–2 → hotfix (§7.4).

### 5.3 Хэмнэл (1 долоо хоногийн iteration)
| Хэзээ | Юу | Хэн | Хэлбэр |
|---|---|---|---|
| Даваа | **Planning** — iteration-ий зорилго, story-ууд, хуваарилалт | PO + Tech Lead | Чат, 20 мин |
| Өдөр бүр | **Daily status** — өчигдөр / өнөөдөр / саад (агент бүр issue-д) | Developer-ууд → Tech Lead нэгтгэнэ | Async |
| Баасан | **Demo / review** — staging дээр хийгдсэнийг үзүүлэх, UAT | Tech Lead → PO | Чат + staging |
| Баасан | **Retro** — юу сайн, юу муу, нэг сайжруулалт | PO + Tech Lead | 3 мөр, `docs/retro/` эсвэл issue |

---

## 6. Definition of Ready / Definition of Done

**Ready** (ажил эхлэхэд):
- [ ] User story + **acceptance criteria** (Given / When / Then)
- [ ] Хүрээ ба **хүрээнд үл орох** зүйл бичигдсэн
- [ ] Хэмжээ ≤ M (≤ 1 өдөр нэг агентад); их бол хуваасан
- [ ] Хамаарал, гэрээ (interface/schema) тодорхой; ADR хэрэгтэй бол батлагдсан
- [ ] Эрх, tenant, PII, 3 хэлний шаардлага тэмдэглэгдсэн

**Done** (бүгд биелсэн үед л «дууссан»):
- [ ] Acceptance criteria бүгд хангагдсан
- [ ] Тест: unit + (backend бол) integration + (шинэ дэлгэц бол) e2e; алдааны засварт давтах тест
- [ ] CI ногоон (lint, type, unit, integration, e2e, build, drift, docs)
- [ ] **Review approve** (зохиогчоос өөр гишүүн)
- [ ] mn / en / zh; hardcode текст алга
- [ ] Баримт: ADR/PRD өөрчлөгдсөн бол; API/DB каталог автомат
- [ ] **`main`-д merge хийгдсэн, staging-д deploy болж smoke ногоон**
- [ ] Issue хаагдсан

> «Local-д ажиллаж байна», «commit хийгээгүй ч дууссан» = **In progress**.

---

## 7. Git ба release-ийн дүрэм

### 7.1 Branch
| Branch | Зорилго | Нас |
|---|---|---|
| `main` | Үргэлж deploy хийж болох; хамгаалалттай | Байнга |
| `feat/<#>-<товч>` · `fix/<#>-…` · `chore/<#>-…` · `docs/<#>-…` | Нэг issue | ≤ 3 өдөр |
| `hotfix/<version>` | Prod-ийн яаралтай засвар (§7.4) | Цаг–өдөр |
`release/*`, урт насалдаг хувилбарын branch ✖.

### 7.2 Commit ба PR
- Conventional Commits (`feat(camp): …`, `fix(auth): …`, `!` = breaking) — англиар.
- PR: жижиг (≤ ~400 мөр өөрчлөлт, migration тусдаа PR байж болно), squash merge.
- **PR template:** Юу / яагаад (`Closes #N`) · Хэрхэн шалгасан · Screenshot (UI) · Migration (expand/contract, буцаах боломж) · Эрх/tenant/PII нөлөө · DoD checklist.

### 7.3 Version ба tag
- `vMAJOR.MINOR.PATCH` ([[VERSIONING]]). Staging: **`-rc.N`**. Prod: final tag. Tag зөвхөн `main`-аас, release workflow-оор.
- CHANGELOG — conventional commit-оос автоматаар (release-please).

### 7.4 Hotfix
`main`-аас эсвэл prod-ийн tag-аас `hotfix/*` → PR (review хурдан, гэхдээ алгасахгүй) → staging smoke → PO батлах → prod → `main`-д буцааж merge. Дугаарлалт → §14 Q2.

---

## 8. Орчин ба өгөгдөл

| Орчин | Хэн ашиглана | Өгөгдөл | Deploy |
|---|---|---|---|
| **local (dev)** | Developer агент | Fixture / seed | Гараар |
| **preview** (PR бүр, frontend) | Reviewer, PO | Staging API | Автомат |
| **staging** | QA, PO (UAT) | Production-ий хуулбар (PII нууцлахгүй — §14 Q3; хандалт зөвхөн багт) | `main` merge → автомат |
| **production** | Байгууллага (Sino Hydro) | Бодит | Tag + PO батламж |

- Код: local → staging → prod. Өгөгдөл: **prod → staging** л. Эсрэг чиглэл ✖.
- Migration: **expand → contract** (жнь багана нэр солих = (1) шинэ багана нэмж хоёуланд бичих → (2) кодыг шилжүүлэх → (3) хуучныг дараагийн release-д устгах).
- Нууц: зөвхөн Secrets-д; local `.env` — dev-ийн утга л.

---

## 9. Чанар ба тест
- **Тестийн пирамид:** олон unit (бизнесийн дүрэм) → integration (API + DB + RLS) → цөөн e2e (гол урсгал). Төгсгөлийн шатанд PO-ийн UAT.
- Bug засвар бүр **эхлээд давтах тест**.
- **Flaky** (заримдаа унадаг) тест → issue, 1 iteration-д засна; `skip` хийж мартахгүй.
- Coverage: шинэ/өөрчилсөн кодод босго (одоогийн threshold-ыг хадгална); нийт хувиар бус.
- **Data parity (A = B)** — өгөгдлийн загвар өөрчлөгдөх бүр staging-д (одоогийн сайн дадал).

---

## 10. Үйл ажиллагаа (operations)

### 10.1 Хяналт
Алдааны tracking (Sentry, PII-гүй) · JSON лог (`requestId`, `tenantId`) · uptime monitor (`/health`, 5 мин) · сарын шалгалт (restore, хамаарал, алдааны top-10).

### 10.2 Ослын зэрэглэл
| SEV | Тодорхойлолт | Хариу |
|---|---|---|
| **SEV1** | Prod ажиллахгүй / өгөгдөл алдагдах, PII задрах | Шууд; PO-д мэдэгдэх; hotfix эсвэл rollback; postmortem заавал |
| **SEV2** | Гол урсгал (нэвтрэлт, хоолны захиалга, өрөө) эвдэрсэн | 24 цагт; hotfix |
| **SEV3** | Хэсэгчилсэн, тойрох арга бий | Дараагийн iteration |
| **SEV4** | Гоо зүй, жижиг | Backlog |

### 10.3 Осол гарвал
Илрүүлэх → зэрэглэл тогтоох → PO-д мэдэгдэх (SEV1–2) → **эхлээд сэргээх** (rollback / feature flag унтраах), дараа нь шалтгаан → засвар → **blameless postmortem** (юу болсон, цаг хугацаа, үндсэн шалтгаан, яаж илрүүлсэн, давтагдахгүйн тулд 1–3 үйлдэл → issue).

### 10.4 Runbook (v0.2.5-д бичнэ)
Deploy · rollback · нөөцөөс сэргээх · нууц солих · хэрэглэгчийн түгжээ тайлах · Free-ийн хязгаарт ойртох.

---

## 11. Хэмжүүр (DORA + чанар)
| Хэмжүүр | Яаж | Зорилт (v0.2.x) |
|---|---|---|
| Deploy давтамж (prod) | Tag тоо / долоо хоног | ≥ 1 |
| Lead time | Issue Ready → prod | ≤ 1 долоо хоног (M хэмжээ) |
| Change failure rate | Prod deploy-оос hotfix шаардсан хувь | < 15% |
| Сэргээх хугацаа (MTTR) | SEV1–2 илэрсэнээс сэргэх | < 4 цаг |
| Throughput | Iteration-д Done story | Төлөвлөгөөний огноонд ашиглана |
Retro-д сар бүр харна.

---

## 12. Баримт — юу хаана
| Мэдээлэл | Хаана |
|---|---|
| Ажил, явц, хэлэлцүүлэг, handoff | **Issue** (+ PR comment) |
| Кодын өөрчлөлтийн «юу, яагаад» | **PR тайлбар** |
| Архитектурын шийдвэр | **ADR** |
| Бүтээгдэхүүний шаардлага | **PRD** |
| Хэрэглэгчид мэдэгдэх өөрчлөлт | **CHANGELOG** (автомат) |
| Үйл ажиллагааны заавар | **Runbook** |
| Осол | **Postmortem** |
| Дүрэм | `AGENTS.md` + энэ гарын авлага |
| Roadmap | [[11_v0.2_completion_master_plan]] (огноо throughput-аас) |
Tech plan-ийн checkbox-ыг issue-ээр орлуулах эсэх → §14 Q4.

---

## 13. Шилжилтийн дараалал
| Хэзээ | Юу |
|---|---|
| **Одоо → 11/16** | ✅ §14 шийдвэр (11/11). GitHub repo тохиргоо — [[13_v0.2.5_tech_plan]] H8 |
| **v0.2.5** (11/17 хүртэл) | Хостинг + CI/CD + PR template + branch protection + rc tag + Sentry/uptime + Dependabot + runbook. `feat/v0.2.4`-ийг `main`-д нэгтгэх (сүүлчийн урт branch) |
| **v0.2.5-аас** | Бүрэн багийн урсгал: issue → PR → review → merge → staging → release; 1 долоо хоногийн iteration ([[10_Agent_Team_Workflow]]) |
| **v0.2.6** | release-please; PR preview; DORA хэмжүүр; expand/contract дүрэм |
| **Сар бүр** | Retro-гоор энэ гарын авлагыг шинэчилнэ |

---

## 14. PO-ийн шийдвэр (2026-11-11)
| # | Асуулт | Шийдвэр |
|---|---|---|
| Q1 | PR + branch protection, merge | ✅ v0.2.5-аас. **Merge = Tech Lead** (CI + review ногоон); production deploy = PO (G3) |
| Q2 | Version | ✅ Staging `-rc.N`; production-ийн яаралтай засварт 4 оронтой (`v0.2.5.1`) — [[VERSIONING]]-д үл хамаарал |
| Q3 | Staging-д PII нууцлах | ❌ Одоогоор үгүй — staging-д production-ий хуулбар хэвээр; хандалт зөвхөн багт, Secrets-ээр. Эрсдэлийг [[ADR-011_Cloud_Hosting]] §3-т бүртгэв |
| Q4 | Ажил хянах | ✅ **GitHub Issues + Projects** |
| Q5 | Sentry | ✅ v0.2.5-д, PII-гүй |
| Q6 | Iteration | ✅ 1 долоо хоног (Даваа planning, өдөр бүр тайлан, Баасан demo + retro) |
| Q7 | Reviewer | ✅ GitHub Copilot PR review + зохиогчоос өөр агент |

## 15. Сурах материал (PO-д)
- **Trunk-based development** — trunkbaseddevelopment.com
- **Semantic Versioning** — semver.org · **Conventional Commits** — conventionalcommits.org
- **Google SRE Book** (үнэгүй, онлайн) — «Monitoring», «Postmortem Culture», «Managing Incidents» бүлгүүд
- **DORA / «Accelerate»** (Forsgren, Humble, Kim) — 4 хэмжүүр
- **Atlassian** — Agile coach (user story, sprint, retro), Incident Management handbook
- **GitHub Docs** — protected branches, environments (required reviewers), Dependabot

## 16. Толь (MN ↔ EN)
| Монгол | English |
|---|---|
| Өөрчлөлтийн хүсэлт | Pull Request (PR) |
| Кодын хяналт | Code review |
| Гол салбар | Trunk / `main` |
| Нэвтрүүлэлт | Deployment |
| Гаргалт | Release |
| Урьдчилсан хувилбар | Release candidate (rc) |
| Хүлээн авах тест | UAT |
| Хүлээн авах шалгуур | Acceptance criteria |
| Бэлэн / Дууссаны тодорхойлолт | Definition of Ready / Done |
| Онцлогийн унтраалга | Feature flag |
| Буцаалт | Rollback |
| Яаралтай засвар | Hotfix |
| Осол / зэрэглэл | Incident / severity |
| Буруутгалгүй дүгнэлт | Blameless postmortem |
| Хяналт-ажиглалт | Observability |
| Ажлын урсгал | Pipeline / workflow |
| Мөчлөг | Iteration / sprint |
| Нэвтрүүлэх хугацаа | Lead time |
