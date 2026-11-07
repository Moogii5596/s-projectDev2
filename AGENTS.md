# S Project — агентын дүрэм (Claude, Cursor, Copilot, Devin — бүгдэд нэг)

> Энэ файл = ажлын дүрмийн **ганц эх сурвалж** (2026-11-07). Бусад заавар (CLAUDE.md, .cursor, .github, .devin) зөвхөн энд заана.
> Юу хаана байгаа → `docs/CONTEXT.md`. Кодын дүрмийн бүтэн тайлбар, жишээ → `docs/08_Roadmap/00_rules_and_context.md`, `docs/09_Codebase/08_Patterns.md`.

S Project — гаднаа нийгмийн сүлжээ, цаанаа ERP. NestJS 11 + Fastify 5 / Prisma 5 / PostgreSQL (Supabase, RLS) / React + Vite, pnpm + Turborepo. Пилот: Sino Hydro (Кемп), `sino.gobiverse.website`.
Хариулт **монголоор, товч**. Код, identifier, commit — англи.

## 1. Ажлын урсгал
1. **Эхлэх:** `docs/CONTEXT.md` → одоогийн хувилбарын tech plan (одоо юу хийгдэж байгаа) → зөвхөн засах файлууд. Бүх баримт, бүх кодыг уншихгүй.
2. **Батлуулахгүй, шууд хий** — ажил үндсэн баримттай (PRD, ADR, master plan, tech plan, энэ файл) нийцэж байвал төлөвлөгөө гаргаж батлуулахгүй, шууд эхнээс нь дуустал хийнэ. Алхам бүрийг батлуулахгүй; ажил бүрт шинэ баримт үүсгэхгүй.
   Зөвхөн дараах үед зогсоож **тухайн зүйлийг л** асууна:
   - үндсэн баримттай зөрж байна, эсвэл баримтад шийдэгдээгүй (бизнесийн дүрэм, хүрээ);
   - **эрсдэлтэй үйлдэл** (§4).
3. **Нэг блок = нэг агент, бүрэн.** DB → API → UI → орчуулга → тест — нэг агент дуусгана. Backend, UI-г хоёр агентад хуваахгүй.
4. **Зэрэгцээ:** өөр блокийг өөр агент, тусдаа worktree + branch-д (`git worktree add ..\s-project-<блок> -b feat/<блок>`). Нэг блок / нэг migration дээр хоёр агент ✖. Хуваалцдаг файлд (`packages/i18n/*.json`, route, цэс, эрхийн registry) зөвхөн өөрийн мөрийг нэмнэ.
5. **«Хөнгөн» хувилбар ✖.** Модуль бүр эхнээсээ production-д бэлэн: эрх, tenant тусгаарлалт, алдааны мессеж 3 хэлээр, хоосон/ачаалж буй/алдааны төлөв, тохиргоогоор (байгууллага бүрийн утгыг кодод хатуу бичихгүй).

## 1б. Архитектур: цөм = модуль ажиллуулах хөдөлгүүр
- **Нэг удаа, цөмд.** Олон модульд хэрэгтэй боломжийг (календарь/амралтын өдөр, нэгж, валют/ханш, тохиргоо, орчуулга/нэр томьёо, эрх/роль, батлах урсгал, мэдэгдэл, файл/хавсралт, audit, импорт/экспорт (Excel), дугаарлалт, байгууллага/ажлын байр, Feed) **зөвхөн цөмд** нэг удаа хийнэ; модуль бүр түүнийг ашиглана. Модуль дотор давтаж хийхгүй.
- **Модуль = зөвхөн бизнесийн логик.** Модуль өөрийн өгөгдөл, дүрэм, дэлгэцтэйгээ ирж цөмд бүртгэгдэнэ (эрх, цэс, route, тохиргооны хэсэг, орчуулга, батлах урсгалын төрөл, мэдэгдлийн төрөл) — цөмийн кодыг өөрчлөхгүйгээр суух/унтрах ёстой.
- **Цөмд байхгүй бол эхлээд цөмд.** Хэрэгтэй нийтлэг боломж цөмд алга бол модульд түр шийдэл бичихгүй — цөмд ерөнхий байдлаар нэмээд модульд ашиглана. Модуль дотор аль хэдийн давхардсан нийтлэг код олдвол цөм рүү зөөх ажлыг tech plan-д бүртгэнэ.
- Модуль хооронд шууд import ✖ — цөмд тодорхойлсон интерфейсээр (нэг transaction-д дуудаж болно) эсвэл outbox event-ээр. Цөм модулиас хамаарахгүй. Бүтэн шийдвэр, manifest, цөмийн боломжийн каталог → `docs/02_System_Architecture/ADR-009_Module_Engine.md`.

## 2. Дууссан гэх шалгуур (блок бүр)
- [ ] Функц бүрэн: backend-ийн endpoint бүр UI-д ашиглагдсан, UI-ийн үйлдэл бүр backend-тэй; эрхгүй хэрэглэгчид цэс/товч харагдахгүй
- [ ] mn / en / zh орчуулга бүрэн, hardcode текст алга
- [ ] tsc + eslint (хөндсөн файл) + unit (хөндсөн) ногоон
- [ ] Backend өөрчлөгдсөн бол тухайн блокийн integration spec (tenant тусгаарлалт, эрх, гол урсгал); шинэ дэлгэц бол e2e гол урсгал
- [ ] Migration бол: local `pnpm supabase:reset` → `pnpm db:generate` → `node scripts/ci/prisma-drift.mjs --update` (шинэ мөр бүр санаатай)
- [ ] `pnpm docs:gen` (CI `docs:check`-ээр шалгана)
- [ ] Tech plan-д блокийн мөрийг `[x]` + нэг мөр үр дүн (тест тоо, commit)
- [ ] Commit (өөрийн branch-д) + санал болгох merge команд

Шалгаагүй кодыг «дууссан» гэж хэлэхгүй, хэрэглэгчээр туршуулахгүй. Ажиллуулж чадаагүй тестийг яг нэрлэж хэлнэ.

## 3. Баримт — бага, нэг газар
- **Явц** → зөвхөн одоогийн хувилбарын tech plan (checkbox + нэг мөр). Блок дуусаагүй бол тэнд «Зогссон цэг» (1–3 мөр).
- **Release-д нэг удаа:** CHANGELOG, `docs/project-status.md`, roadmap, backlog, `09_Codebase` гар хэсэг (`01_Backend_Modules`, `04_Frontend_Map`).
- **Алдааны сургамж** (`docs/lessons/LL-*.md`) — зөвхөн давтагдах магадлалтай эсвэл 30+ мин зарцуулсан алдаа. Бичихээс өмнө байгаа эсэхийг хайна.
- `docs/` = Obsidian vault: frontmatter (title, type, status, last_updated, tags), `[[линк]]`, шинэ файл `docs/INDEX.md`-д. `docs:check` алдааг заана.

## 4. Эрсдэлтэй үйлдэл — хэрэглэгчийн шууд зөвшөөрөлтэй л
- Өгөгдөл / хүснэгт / багана / хуулбар устгах migration (жнь `legacy_*`), өгөгдлийн утга өөрчлөх
- `main`-д merge, tag, push; pilot / staging upgrade; `supabase db reset` (local-аас бусад)
- `.env*` унших/засах (`.env.example`-ээс бусад); нууц үг, түлхүүр
- Pilot-д суулгахаас өмнө: нөөц → staging upgrade → `camp:snapshot` A = B

## 5. Кодын хатуу дүрэм (тайлбар, жишээ → `00_rules_and_context.md`)
- **DB:** schema = `supabase/migrations/*.sql` (`prisma db push` ✖); migration дугаарыг хэрэгжүүлэх үед; ID `uuid_generate_v7()`; Prisma model → `prisma/schema/<модуль>.prisma`; UUID бүрт `@db.Uuid`; enum өөрчлөх дараалал (R15).
- **RLS:** шинэ tenant хүснэгт → `SELECT camp_apply_tenant_rls('<t>')`; tenant өгөгдөл үргэлж `inTenantTx(prisma, tenantId, tx => …)` (`SET LOCAL` ✖); `SYSTEM_DATABASE_URL` зөвхөн системийн ажилд.
- **NestJS:** глобал guard → `APP_GUARD` + `useExisting`; Prisma enum `@prisma/client`-ээс; `import type`; FK → `core_users.id` (`req.user.id` = authId).
- **API:** frontend төрөл backend DTO-тай ТАМ АДИЛ (хуулбар файлыг хамт засна); алдаа = `code` + `params`, мессеж `messages.ts`-д mn/en/zh; эрх = ADR-007 (`core_*`, `permission-registry.ts`).
- **Тест:** vitest + unplugin-swc; `overrideProvider` зөвхөн байгаа provider-т; prototype patch ✖ (`app.get(X).m = mock`); `await app?.close()`; RLS тест dual client; integration `pool: 'forks'`.
- **Frontend:** `modules/camp/components/ui.tsx`, шинэ UI сан ✖; бүх текст i18n; Vite proxy (`VITE_API_BASE_URL` хоосон).

## 6. Орчин
- Хэрэглэгчийн машин: Windows, **PowerShell 5.1** (`&&` ✖ → `;`), Docker дээр Supabase (DB 54322), pnpm only. Төсөл: `E:\MoogiiDev\Dev\s-project`.
- Commit хийгээгүй өөрчлөлт байвал (`git status`) — өөр агентын ажил байж болно: хөндөхгүй, тусдаа worktree-д ажилла.
- CI (`.github/workflows/ci.yml`): `main`, `feat/**`, `chore/**`, `fix/**` push болон PR бүрт lint, unit, integration, build, docs:check, e2e.
