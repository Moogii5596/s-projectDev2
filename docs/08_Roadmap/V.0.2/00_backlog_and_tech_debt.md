# v0.2 — Үлдсэн ажил ба техникийн өрийн нэгдсэн бүртгэл

> Үүсгэсэн: 2026-10-11 (v0.1 хаагдах үед) · Эх сурвалж: `V.0.1.5/01_analysis_and_plan_2026-10-08.md` (Backlog), `camp_module/01_plan_and_erd.md` (V2, D8),
> `docs/lessons_learned.md` §19–20, `docs/project-status.md`, v0.1.6 пилотын суулгалт · Төлөвлөгөө: `01_plan_draft.md`
> Пилотын санал: `docs/pilot-feedback.md` (FB-xx) → энд ID-тай мөр болж орно.

**Ач холбогдол** (pilot-feedback.md-ийн дүрэмтэй ижил): **P0** — систем/өгөгдөл/аюулгүй байдал → v0.1.x hotfix (`release/v0.1`) · **P1** — ажлыг саатуулж байгаа → v0.2 · **P2** — сайжруулалт → v0.2 эсвэл дараа.
**Хэмжээ:** S ≤ 1 өдөр · M 2–4 өдөр · L 1 долоо хоног+. Ач холбогдлыг пилотын дараа эцэслэнэ (одоо — урьдчилсан).

---

## 1. Кемп модуль V2 (D8 — DB, Prisma, эрхийн код бэлэн)

| ID | Ажил | Эх сурвалж | Урьдч. | Хэмжээ |
|---|---|---|---|---|
| V2-01 | Гэрээ + үнэ (Шат 5): гэрээ ACTIVE + үнэтэй эсэх, нэгж (TRIP/M3/TON) ↔ volume_unit, `ContractPricingService`, эрх `camp.contract.manage` | camp plan Шат 5 | P1 | L |
| V2-02 | Бохир ус / хог тээвэр + батлах дараалал (Шат 6): `camp.haul.create`, `camp.haul.approve` | Шат 6 | P1 | L |
| V2-03 | Маргаашийн хоолны захиалга (хоол × байршил) / хүлээн авах (Шат 6): `camp.meal.order`, `camp.meal.accept`, `mealOrderCutoffTime` (тохиргоонд аль хэдийн бий) | Шат 6 | P1 | L |
| V2-04 | Зардлын тайлан + Excel (Шат 7): `camp_cost_entries`, `camp.report.view` | Шат 7 | P1 | M |
| V2-05 | Эрхийн матрицад V2 эрхийг харуулах (`availableIn: 'v2'` нууцлалыг авах) | 8.V2.5 | P1 | S |
| V2-06 | Зардлын сторно мөр (буцаалт) | migration `20261009006` тайлбар | P2 | M |

## 2. Пилотыг бодит хэрэглээнд бэхжүүлэх

| ID | Ажил | Эх сурвалж | Урьдч. | Хэмжээ |
|---|---|---|---|---|
| PIL-01 | **Хэрэглэгч удирдах UI** (нэмэх, role/кемпийн роль, нууц үг сэргээх, идэвхгүй болгох) — одоо зөвхөн `pilot.ps1 user`. SEC-005-ийн `POST /auth/register`-ийг үүнтэй нэгтгэх | runbook §10 | P1 | M |
| PIL-02 | "Нууц үг мартсан" / хэрэглэгч өөрийн нууц үгийг солих (SMTP тохиргоо шаардана) | runbook §16 | P1 | M |
| PIL-03 | Хувийн мэдээллийн аудит лог — ажилтны мэдээллийг хэн, хэзээ үзсэн/өөрчилсөн | пилот: хувийн мэдээлэл | P1 | M |
| PIL-04 | Мониторинг: гаднаас uptime шалгалт, нөөцлөлт/backend унавал утсанд мэдэгдэл | runbook §16 | P1 | S |
| PIL-05 | Нөөцийг өөр газар (OneDrive / USB / object storage) автоматаар хуулах | runbook §12 | P1 | S |
| PIL-06 | **Хостингийн шийдвэр (ADR-002):** local Supabase-ийг production-д ашиглаж байна (DB `postgres`/`supabase_admin` нууц үг анхдагч, портууд 0.0.0.0 — firewall-аар хамгаалсан, нэг машин, CLI нь production-д зориулагдаагүй) → VPS / cloud / self-hosted Supabase (docker compose, өөрийн нууц үгтэй) / Supabase Cloud | v0.1.6 суулгалт | P1 | L |
| PIL-07 | Auth-ийн нэвтрэлтийн хязгаар Caddy-ийн ард бүх хэрэглэгчид нэг IP-ээр хуваалцагддаг → бодит IP (X-Forwarded-For) | runbook §15 | P2 | S |
| PIL-08 | Excel export: ажилтан, ирц, өрөөний самбар, хоолны тоо (V1-д ирцийн загвараас өөр export алга) | Explore 2026-10-11 | P1? | M |
| PIL-09 | Анхдагч "Кемп админ" рольд засвар эхлүүлэх/хаах эрх алга (`maintenance.parts` = Катеринг админ, `maintenance.close` = Кемп менежер) — санаатай хуваарилалт уу, өөрчлөх үү (бизнес шийдвэр) | Explore 2026-10-11 | P2 | S |
| PIL-10 | Web bundle 509 kB (gzip 140) → code-split; утас + Funnel-ээр анхны ачаалал | build анхааруулга | P2 | S |
| PIL-11 | Пилотын хавтсыг `pilot.ps1 upgrade` (backup → stop → checkout → init → build → start) нэг командаар | runbook §13 | P2 | S |

## 3. Workflow / MR (пилотод нуусан модулиуд)

| ID | Ажил | Эх сурвалж | Урьдч. | Хэмжээ |
|---|---|---|---|---|
| WF-01 | Escalation: `escalationEnabled`-ийг шалгадаггүй, `currentStep = order - 1`, escalate = алхам алгасах → бизнесийн дүрэм тодорхойлж засаад `ESCALATION_CRON`-ийг асаах | v0.1.5 backlog | P1* | M |
| WF-02 | Delegation ↔ MR батлалт (орлон гүйцэтгэгч алхмыг батлах — шийдвэр Б) | v0.1.5 backlog | P2 | M |
| WF-03 | `WorkflowService.approveStep/rejectStep` (controller-гүй, role шалгалтгүй) — устгах эсвэл нэгтгэх | SEC-004 | P2 | S |
| WF-04 | MR үүсгэх UI-д нэгж үнэ (одоо UI-ийн MR 0₮ → үргэлж 1 алхам) | v0.1.5 backlog | P2* | S |
| WF-05 | MR / Бараа / Нийлүүлэгч / Тайланг пилотод нээх эсэх (`PILOT_MODULES`) | v0.1.6 | — | S |

\* MR модулийг пилотод нээх (WF-05) шийдвэр гарвал P1 болно.

## 4. Чанар / тест

| ID | Ажил | Эх сурвалж | Урьдч. | Хэмжээ |
|---|---|---|---|---|
| QA-01 | **GitHub Actions ногоон эсэх v0.1.5-аас хойш шалгагдаагүй** (CI-004) — эхний ажил | lessons CI-004 | P1 | S |
| QA-02 | E2E: "серверт session хүчингүй" (FE-007), бодит Supabase-ийн auth тохиргоо (OPS-003 — CI-д бодит Supabase бий) | lessons §20 | P1 | S |
| QA-03 | Frontend component тест (одоо зөвхөн цэвэр `lib/*`) | v0.1.5 backlog | P2 | M |
| QA-04 | Integration Redis mock-ийг санах ойн болгох (бичсэнээ уншдаг) — CACHE-001 | v0.1.5 backlog | P2 | S |
| QA-05 | Давхар RESTRICTIVE policy цэвэрлэх (PERMISSIVE-тэй ижил нөхцөл) | v0.1.5 backlog | P2 | S |
| QA-06 | ESLint анхааруулга 70 (`no-explicit-any`) | lint | P2 | S |
| QA-07 | `pilot.ps1`-ийн автомат тест (pwsh + shim, PS-001) CI-д; Task Scheduler/Firewall хэсгийг гараар шалгах жагсаалт | lessons PS-001 | P2 | M |
| QA-08 | `mfe-requisitions` (15 мөр stub) + Module Federation-ийг хадгалах уу, хасах уу | v0.1.5 | P2 | S |

## 5. Баримт

| ID | Ажил | Урьдч. |
|---|---|---|
| DOC-01 | ADR-002 Хостинг (PIL-06-ийн шийдвэр) | P1 |
| DOC-02 | Хэрэглэгчийн гарын авлага (Кемп) — `docs/pilot-test-guide.md`-ээс үүсгэх | P2 |

## 6. v0.3 руу шилжүүлсэн (2026-10-11 шийдвэр)

| ID | Ажил |
|---|---|
| T3-01 | Tier 3 Air-Gapped / Offline-First (edge node, cryptographic sync, 3-way diff, PROVISIONALLY_APPROVED) — `01_Development_Roadmap.md` «v0.3.0» |

---

## Пилотын санал (FB-xx → ID)

| FB | Огноо | Товч | Ач холбогдол | → ID / шийдэл |
|---|---|---|---|---|
| — | — | (пилотын явцад нэмэгдэнэ) | — | — |
