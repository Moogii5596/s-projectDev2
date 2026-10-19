---
title: "Lessons — Орчин, шинэ машин, пилот / deploy"
type: "Log"
status: "Active"
last_updated: 2026-10-13
tags: [lessons]
---

# Lessons — Орчин, шинэ машин, пилот / deploy

> Индекс (ID → дүрэм): [[lessons_learned]]. Дэлгэрэнгүйг зөвхөн индексээс ID-гаа олсны дараа унш. Хэсгийн дугаар (§N) анхны нэгтгэсэн файлынхтай ижил.

## 12. Local орчин / Шинэ машин тохиргоо (2026-10-08)

> Төслийг GitHub-аас шинэ Windows машин дээр clone хийж Supabase-г Docker дээр асаах явцад гарсан. Бүрэн заавар: [[02_Local_Supabase_Docker_Windows]]

### [SEED-001] Enum migration-ий дараа `seed.sql` хуучин утгатай үлдсэн → `supabase start` унав
**Алдаа:** `failed to send batch: ERROR: invalid input value for enum "TierType": "starter" (SQLSTATE 22P02)` — 15 migration амжилттай, seed дээр унаж контейнерүүд зогссон.
**Шалтгаан:** `0004_add_native_enums.sql` нь `tenants.tier`-ийг TEXT → `TierType ('tier1','tier2','tier3')` болгосон, гэтэл `seed.sql` `'starter'` хэвээр. Хуучин машинд DB 0004-өөс өмнө үүссэн тул seed дахин ажиллаагүй — алдаа **нуугдмал** байсан.
**Шийдэл:** `seed.sql`: `'starter'` → `'tier1'` (Prisma `@default(TIER1)`-тэй таарна).
**Урьдчилан сэргийлэх:** TEXT→enum эсвэл CHECK constraint өөрчлөх migration бүрт `grep -n "<багана>" supabase/seed.sql` хийж хуучин утгыг шинэчилнэ. Migration нэмсний дараа **цэвэр DB дээр** `pnpm supabase:reset`-ээр бүх migration + seed-ийг туршина.

### [ENV-001] `docker` / `node` / `pnpm` — `is not recognized` (суусан байхад)
**Шалтгаан:** Терминал програм суулгахаас өмнө нээгдсэн → хуучин PATH. Docker Desktop **per-user** суувал `%LOCALAPPDATA%\Programs\DockerDesktop`-д байдаг (`C:\Program Files` биш) — буруу замаар шалгаж "суугаагүй" гэж андуурсан.
**Шийдэл:** Терминал (VS Code бол бүхэлд нь) дахин нээх, эсвэл:
`$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")`
**Дүрэм:** Суулгасан эсэхийг замаар биш registry-ээр шалгана: `HKLM` **болон** `HKCU` `...\Uninstall\*`.

### [ENV-002] `npm.ps1 cannot be loaded because running scripts is disabled`
**Шалтгаан:** Windows PowerShell-ийн анхдагч ExecutionPolicy `.ps1` хориглодог.
**Шийдэл:** `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` (admin шаардахгүй).

### [ENV-003] Supabase CLI-г `npm install -g supabase`-ээр суулгах — дэмжигдэхгүй
**Шалтгаан:** README-д `npm install -g supabase@latest` гэж буруу заасан байсан. Supabase CLI npm global суулгалтыг дэмждэггүй.
**Шийдэл:** Root devDependency: `pnpm add -D supabase -w` (одоо `package.json`-д орсон → `pnpm install` хангалттай). Баг бүхэлдээ ижил хувилбар, `pnpm supabase:*` script-ууд ажиллана.
**Тэмдэглэл:** `pnpm add` дээр `Packages: +25 -147` гарсан ч lockfile-д зөвхөн нэмэлт орсон (`git diff pnpm-lock.yaml`-аар шалгасан) — `-147` нь `node_modules` бүтэц.

### [ENV-004] Шинэ CLI `sb_publishable_…` / `sb_secret_…` key харуулдаг — код JWT key хүлээдэг
**Шалтгаан:** Supabase CLI v2.1xx+ `supabase status`-д шинэ форматын API key харуулдаг. Манай код `@supabase/supabase-js ^2.46` + `auth.getUser(token)` нь хуучин JWT `anon` / `service_role` key-тэй ажилладаг.
**Шийдэл:** `pnpm supabase status -o env` → `ANON_KEY`, `SERVICE_ROLE_KEY` (`eyJ…`-ээр эхэлнэ).
**Дүрэм:** `.env`-д `sb_` угтвартай key оруулахгүй (supabase-js шинэчлэх хүртэл).

### [ENV-005] Шинэ машинд 3 `.env` файл хэрэгтэй — GitHub-д байдаггүй
**Шалтгаан:** `.env` нь `.gitignore`-д. Prisma (`apps/core-kernel`) root `.env`-г уншдаггүй, frontend `apps/web-shell/.env`-ээс `VITE_*` уншина.
**Шийдэл:** `.env`, `apps/core-kernel/.env`, `apps/web-shell/.env` — `.env.example`-уудаас автоматаар үүсгэх скрипт баримтын §1.5-д.
**Анхаар:** PowerShell 5.1 `Set-Content -Encoding utf8` BOM нэмдэг → `[IO.File]::WriteAllText(..., (New-Object System.Text.UTF8Encoding $false))` ашиглана.

---

### [ENV-006] `prisma generate` → `EPERM: operation not permitted, rename ...query_engine-windows.dll.node.tmp...`
**Шалтгаан:** Windows дээр ажиллаж буй Node процесс (`pnpm dev`) Prisma query engine DLL-ийг ачаалсан → файл түгжигдсэн, солих боломжгүй.
**Шийдэл:** `pnpm dev`-г зогсоох (Ctrl+C) → `pnpm db:generate` → дахин `pnpm dev`. Давтагдвал `Get-Process node`, VS Code Prisma extension-ийг хаах.
**Анхаар:** Prisma schema өөрчлөгдсөн бол generate **заавал** — хуучин client устгагдсан багана (жнь `schema_name`) руу query хийж runtime алдаа өгнө; unit тест (mock) үүнийг барихгүй.

### [ENV-007] Шинэ машин дээр `pnpm e2e` → 8 тест 3–5ms-д унана: `browserType.launch: Executable doesn't exist ... chromium-1140\chrome-win\chrome.exe`
**Шалтгаан:** Playwright-ийн Chromium нь `pnpm install`-ээр суудаггүй (хэрэглэгчийн `AppData\Local\ms-playwright`-д тусад нь татагдана). Зөвхөн API тест (`health endpoint`) давна.
**Шийдэл:** `pnpm playwright:install` (root script — [S5-E3]-ыг үз; `pnpm --filter e2e exec playwright install` ажиллахгүй).
**Дүрэм:** Шинэ машины шалгах жагсаалтад `pnpm playwright:install` заавал.

### [ENV-008] E2E: login амжилттай ч "MR жагсаалт татахад алдаа гарлаа" — CORS
**Алдаа:** `requisition-flow`, `workflow-multistep` 4 тест "Шинэ MR" товч / хүснэгт олдохгүй timeout. DB-ийн `auth_id` зөв, membership асуудалгүй байсан.
**Шалтгаан:** `apps/web-shell/.env.example`-д `VITE_API_BASE_URL=http://localhost:3000` → хөтөч `:5173`-аас `:3000` руу шууд (cross-origin) хандана. `core-kernel` (`main.ts`) CORS идэвхжүүлээгүй тул хөтөч хүсэлтийг хаадаг. Supabase Auth (54321) өөрөө CORS зөвшөөрдөг тул login ажилласан нь асуудлыг нуусан.
**Шийдэл:** `VITE_API_BASE_URL=` (хоосон) → `client.ts` same-origin `/api` → Vite proxy → `:3000`. `.env` болон `.env.example` хоёуланг засав. Vite-г дахин асаах (`.env`-г зөвхөн эхлэхдээ уншдаг).
**Дүрэм:** `.env.example`-ийн утга кодын тайлбартай (`client.ts`) зөрчилдөж болохгүй. Frontend API алдаа гарвал эхлээд DevTools → Network (CORS / status)-ийг шалгаж, дараа нь DB-г сэжиглэ.

## 20. v0.1.6 — Кемп пилот (2026-10-10)

### [SEC-005] 🔴 `POST /api/v1/auth/register`: нэвтэрсэн ДУРЫН хэрэглэгч (VIEWER ч) шинэ бүртгэл үүсгэдэг байсан
**Тохиолдсон (пилот бэлтгэхэд илэрсэн):** Endpoint нь global `TenantAuthGuard`-аар зөвхөн "нэвтэрсэн гишүүн" эсэхийг шалгаад, tenant-ийг **Host header**-ээс (localhost → `DEV_TENANT_SLUG`) авч `auth.admin.createUser` (service key — `enable_signup=false`-ийг тойрно) + `core_users` REQUESTER үүсгэдэг. Үр дагавар: VIEWER өөртөө REQUESTER бүртгэл үүсгэж эрхээ нэмнэ; пилотод нээлттэй бүртгэлийг хаасан ч арын хаалга үлдэнэ. UI ашигладаггүй тул анзаарагдаагүй.
**Шийдэл:** дуудагч OWNER/ADMIN (идэвхтэй) байх ёстой, tenant = `req.user.tenantId`. Тест: unit 6 + integration 4 (VIEWER/REQUESTER/APPROVER → 403, бүртгэл үүсэхгүй; ADMIN → 201 өөрийн tenant-д; өөр Host → 403). Хуучин код дээр unit 6/6, integration 3/4 унасан.
**Дүрэм:** Release/байршуулалтын өмнө бүх controller-ийн endpoint-уудыг "хэн дуудаж чадах вэ" гэж жагсааж шалгана; service key ашигладаг endpoint бүр role шалгалт + тест-тэй. Tenant-ийг Host-оос дахин тооцоолохгүй — guard-ийн `req.user.tenantId`.

### [SEC-006] Supabase CLI: `auth.jwt_secret = "env(X)"` — X хоосон бол алдаагүйгээр **demo нууцаар** асдаг
**Тохиолдсон (cloud-д CLI 2.120-оор туршихад):** `X=short` → "Must be at least 16 characters" алдаа; харин X огт байхгүй → алдаагүй үргэлжилнэ (анхдагч demo нууц). Demo нууц олон нийтэд ил → хэн ч service_role JWT үүсгэж бүх өгөгдлийг уншина.
**Шийдэл:** `pilot.ps1` Supabase-ийг өөрөө `.env`-ийн нууцтай асаана; асаасны дараа `supabase status`-ийн ANON/SERVICE key-ийн HS256 гарын үсгийг demo нууцаар шалгаж таарвал **зогсооно**, `.env`-ийн нууцаар таарахгүй бол анхааруулна. Web build-д шингэсэн anon key одоогийнхтой таарахгүй бол (нууц солигдсон) асахгүй.
**Дүрэм:** Аюулгүй байдлын тохиргоог "тохируулсан" гэж бүү итгэ — үр дүнг (гарсан түлхүүр, header, хариу) шалгадаг автомат шалгалт бичнэ.

### [FE-006] Module Federation remote нь route идэвхгүй байсан ч апп эхлэхэд ачаалагдана
**Тохиолдсон:** `VITE_MODULES=camp` build-д `/mfe` route-гүй ч `@module-federation/vite` runtime эхлэхдээ `http://localhost:5174/assets/remoteEntry.js`-ийг татах гэж оролдсон (CSP хааж консолд 6 алдаа; хэрэглэгчийн төхөөрөмж localhost руу хүсэлт илгээнэ). Headless браузерын тестээр (хүсэлтийн host-уудыг бүртгэж) илэрсэн.
**Шийдэл:** `vite.config.ts` — `mfe` идэвхгүй бол `remotes: {}` + `mfe_requisitions/RequisitionApp` → `MfeDisabled.tsx` alias. Дараа нь хүсэлт зөвхөн same-origin, консол цэвэр.
**Дүрэм:** Production build-ийг браузераар нээж **гарч буй бүх хүсэлтийн host** ба консолын алдааг шалгана (зөвхөн хуудас харагдах нь хангалтгүй).

### [OPS-001] SPA fallback `/assets/*`-д ч index.html буцаадаг
**Тохиолдсон:** Caddy `try_files {path} /index.html` бүх замд → байхгүй `/assets/x.js` → 200 text/html. Шинэ build-ийн дараа хуучин tab хуучин chunk-ийг дуудахад "MIME type" алдаа, оношлоход хэцүү.
**Шийдэл:** `/assets/*` — зөвхөн `file_server` (байхгүй → 404, байвал `immutable` cache); бусад зам → index.html (`no-cache`).

### [PS-001] Windows PowerShell 5.1-д ажиллах скрипт бичих
**Тохиолдсон / урьдчилан сэргийлсэн (`pilot.ps1`):**
1. BOM-гүй UTF-8 `.ps1`-ийг 5.1 ANSI гэж уншина → кирилл мөр эвдэрч parse алдаа → файл **UTF-8 BOM**-той.
2. `$ErrorActionPreference='Stop'` + native командын stderr (`2>&1`/`2>$null`) → 5.1 terminating error → native дуудлагын үед түр `Continue`, амжилтыг `$LASTEXITCODE`-оор.
3. Native гаралт функцийн буцаах утгад холилдоно → харуулах гаралтыг `| Out-Host`.
4. `Start-Process -ArgumentList` зайтай замыг хашилтгүй нийлүүлнэ → гараар хашилт; `-WindowStyle` зөвхөн Windows-д.
5. `Join-Path a b c` (3 аргумент), `??`, `&&`, `$IsWindows` — PS7-д л байна.
6. `pnpm.cmd` → cmd.exe давхарга (кирилл/`=` эрсдэл) → админ CLI-г `node …/tsx/dist/cli.mjs`-ээр шууд.
7. Олдсон алдаа: `check` нь `.env`-ийг (PILOT_CADDY/PILOT_7Z) уншихаас ӨМНӨ програм хайсан.
**Тест:** cloud-д pwsh 7.4 + docker/supabase/pnpm **shim** + бодит PG/Caddy/7-Zip/backend-ээр бүх командыг (check/init/build/start/run/status/user/onboard/backup/restore/stop, demo нууц, нууц солигдсон, анхдагч app_user нууц үг) ажиллуулав; restore-ийн дараа 54 хүснэгтийн md5 ижил. 5.1-ийг шууд ажиллуулах боломжгүй тул дээрх дүрмийг grep-ээр шалгав; Task Scheduler/Firewall командыг таны машин дээр шалгана.

### [OPS-002] `supabase stop --no-backup` = бүх өгөгдөл устна; `db reset` = migration-оос шинээр
**Дүрэм:** Пилот/production-д `stop` (data volume хадгална) л; `--no-backup`, `db reset`-ийг зөвхөн restore урсгал (нөөцийг тулгасны дараа) ашиглана. Нөөц = өгөгдөл (`--data-only`), schema = ижил tag-ийн migration — restore эхлэхээс өмнө migration жагсаалтыг тулгаж, зөрвөл юу ч устгахгүй.

### [TEST-016] Redis mock coverage тест CLI script-ийн `redis.connect()`-ийг барьсан
**Тохиолдсон:** TEST-003-ын scan нь `src/**`-ийг бүхэлд нь уншдаг → `src/scripts/pilot-admin.cli.ts` (апп-д ачаалагддаггүй) → `connect` mock-д алга гэж унав.
**Шийдэл:** scan-аас `src/scripts`-ийг тодорхой (тайлбартай) хасав — хувьсагчийн нэр сольж тойрохгүй.

### [PROC-008] `pkill -f "[x]yz"` ч өөрийн shell-ийг алав (cloud harness)
**Тохиолдсон:** Нэг Bash дуудлагад script-ийг heredoc-оор бичээд (дотор нь `dist/src/main.js`, `caddy run` бичвэр) дараа нь `pkill -f "[d]ist/src/main.js"` → bracket pattern өөрийгөө таарахгүй ч **командын бусад хэсэг** таарсан → exit 144.
**Дүрэм:** pkill-ийг бусад бичвэргүй тусдаа дуудлагаар; урт скриптийг файлд бичээд тусад нь ажиллуулна. Cloud tool дуудлага дуусахад энгийн child процессыг устгадаг → урт ажиллах зүйлийг `setsid` + үр дүнг файлд.

### [PROC-009] Пилот `init` шинэ clone дээр унав: `'supabase' is not recognized`
**Тохиолдсон (таны машин, 2026-10-10 22:55):** Runbook-ийн дараалал `init` → `build` байсан ч `pnpm install` зөвхөн `build`-д. Шинэ clone-д `node_modules` алга → `pnpm exec supabase` олдсонгүй. Cloud тестийн test root-д `node_modules`-ийг symlink-ээр бэлэн холбосон тул илрээгүй.
**Шийдэл:** `init` нь `node_modules/.bin/supabase(.cmd)` алга бол `pnpm install --frozen-lockfile` хийнэ; `Invoke-Supabase` CLI алга бол ойлгомжтой алдаа. Runbook §4-д `pnpm install`.
**Дүрэм:** Суулгах/байршуулах скриптийг **хоосон (шинэ clone)** төлөвөөс эхлэн туршина — тестийн орчинд "бэлэн" зүйл (node_modules, build, .env) байвал тэмдэглэж, тэдгүйгээр нэг удаа ажиллуулна.

### [PROC-010] 🔴 `pilot.ps1` `.env`-ийг таны PowerShell цонхны орчинд үлдээсэн
**Тохиолдсон (таны машин, 22:56):** `.\pilot.ps1 check` → `Set-Item env:` нь процессын орчныг өөрчилдөг тул скрипт дууссаны дараа ч цонхонд `NODE_ENV=production`, пилотын `DATABASE_URL` г.м. үлдсэн. Дараагийн `pnpm install` → "devDependencies: skipped because NODE_ENV is set to production" → Supabase CLI алга. Илүү аюултай нь: тэр цонхонд dev-ийн `pnpm test:integration`/`pnpm dev` ажиллуулбал **пилотын DB** руу холбогдоно. Cloud тест скрипт бүрийг тусдаа `pwsh -File` процессоор ажиллуулдаг байсан тул илрээгүй.
**Шийдэл:** Main эхлэхэд орчны snapshot → дуусахад (алдаатай ч) буцаана (`Restore-Environment`); `Install-NodeDeps` нь `NODE_ENV`-гүй ажиллана. Тест: нэг pwsh session-д check (амжилт) / init (алдаа)-ын дараа `NODE_ENV`, `DATABASE_URL` хоосон, өмнөх хувьсагч хэвээр; install үед `NODE_ENV=[]`.
**Дүрэм:** Хэрэглэгчийн shell-д `.\script.ps1`-ээр ажиллах скрипт орчныг өөрчилбөл заавал буцаана; тестийг хэрэглэгчийн ажиллуулах хэлбэрээр (нэг session-д дараалан) хийнэ.

### [OPS-003] 🔴 Пилотод нэвтрэх боломжгүй: "Email logins are disabled"
**Тохиолдсон (таны машин, 23:09):** `deploy/pilot/supabase/config.toml`-д бүртгэл хаах гэж `[auth] enable_signup = false` дээр нэмж `[auth.email] enable_signup = false` тавьсан. Supabase CLI-д сүүлийнх нь имэйл provider-ийг бүхэлд нь (`GOTRUE_EXTERNAL_EMAIL_ENABLED=false`) унтраадаг → admin API-аар үүссэн хэрэглэгч ч нэвтэрч чадахгүй. Cloud-д fake GoTrue ашигласан (бодит Supabase image татах боломжгүй) тул илрээгүй.
**Шийдэл:** `[auth.email] enable_signup = true` (тайлбартай); бүртгэлийг `[auth] enable_signup = false` (`GOTRUE_DISABLE_SIGNUP`) + Caddy `/auth/v1/signup` 404 хаана.
**Дүрэм:** Тохиргооны түлхүүрийн нэрээр утгыг нь бүү таамагла — баримтаас (эсвэл бодит орчинд нэвтэрч) шалгана. Mock/fake-аар туршсан тохиргоо бүрийг "бодит орчинд шалгаагүй" гэж тэмдэглэж, бодит орчны эхний алхамд шалгах жагсаалтад оруулна.

### [FE-007] 🔴 Пилот: `/camp` ↔ `/login` хооронд төгсгөлгүй шилжилт (интернэт тасарч сэргэсний дараа)
**Тохиолдсон (таны утас/компьютер, 23:34):** Серверт session хүчингүй болсон (сүлжээ тасрахад refresh амжаагүй, өөр төхөөрөмжөөс logout — анхдагч `signOut()` = **global** бүх төхөөрөмжийг цуцална, эсвэл restore-ийн дараа `auth.sessions` цэвэрлэгдсэн) ч браузерийн localStorage-д session үлдсэн. API 401 → axios interceptor `window.location.href = '/login'` (session-ийг устгахгүй) → LoginPage локал session-оор "нэвтэрсэн" гэж үзэж `/camp` → 401 → … Cloud-д хуучин кодоор давтахад 6 сек-д **295** шилжилт.
**Яагаад тестэд илрээгүй:** e2e нь нэвтэрсэн session-ийг серверт хүчингүй болгодог кейсгүй байсан.
**Шийдэл:** `lib/unauthorized.ts` — 401 → `supabase.auth.signOut({ scope: 'local' })` → `/login` (аль хэдийн тэнд бол шилжихгүй); "Гарах" товч `scope: 'local'` (бусад төхөөрөмжийг гаргахгүй). Unit 3 + браузерын давталтын тест (шинэ код: 4 шилжилт, `/login`, localStorage цэвэр).
**Дүрэм:** Auth-ийн урсгалд "серверт session хүчингүй, клиентэд хүчинтэй" кейсийг заавал шалгана; redirect хийхээс өмнө тухайн шалтгааныг (локал төлөв) цэвэрлэнэ, redirect бүрт "аль хэдийн тэнд бол" хамгаалалт.

### [PROC-011] 🔴 Таны commit хийгээгүй [[pilot-feedback]]-ийг дарж бичсэн
**Тохиолдсон (2026-10-11 11:16):** Баримт хуулах скрипт эхэндээ `git status` ба одоогийн hash-ийг **хэвлэсэн** ч шалгаагүй — [[pilot-feedback]] нь таны засвартай (M, hash `35134bab…`, HEAD = миний өмнөх `42bf98a1…`) байсан ч tar-аар дарж бичив. Дарагдсан агуулга нь таны надад илгээсэн 14 саналын текст байсан гэж үзэж, түүнийг файлын хавсралтад үгчлэн сэргээв.
**Шалтгаан:** PROC-005/006-ийн pre-hash шалгалтыг "харах" алхам болгосон (нөхцөлгүй үргэлжилсэн); өмнөх v0.1.6 bundle-д л automated (`bad=1 → зогсох`) байсан.
**Шийдэл/Дүрэм:** Төхөөрөмж рүү хуулах **бүрт** check файлд `өмнөх hash` заавал, скрипт тулгаад таарахгүй бол **юу ч бичихгүй зогсоно** (NEW файл аль хэдийн байвал ч зогсоно). Хэвлэх ≠ шалгах. Хэрэглэгчийн засаж байж болох файл (feedback, .env, тэмдэглэл) → дарж бичихээс өмнө заавал татаж нэгтгэнэ.

### [OPS-010] `docker ps --filter "name=supabase_db"` пилотын DB контейнерийг ч барьсан (dev скриптийн заавар)
- **Тохиолдсон (таны машин, 2026-10-19):** e2e-ийн өмнө `camp_e2e_grant.sql`-ийг зааврын дагуу ажиллуулахад `$db` = `supabase_db_s-project supabase_db_s-project-pilot` (2 нэр) → `docker cp`/`exec` алдаа өгч зогссон (пилотод юу ч хийгдээгүй).
- **Шалтгаан:** Docker-ийн `name=` шүүлтүүр хэсэгчилсэн тааруулалт; dev ба пилот нэг машинд.
- **Шийдэл:** `supabase/dev/*.sql`-ийн зааврыг `--filter "name=^supabase_db_s-project$"` болгов.
- **Дүрэм:** Нэг машинд dev/staging/пилот зэрэгцэх тул контейнерийг **яг нэрээр** (`^…$`) сонгоно; DB-д бичих dev команд бүр контейнерийн нэрийг хэвлэж шалгана.

### [OPS-011] `camp:snapshot --like` кемпгүй байгууллагыг B-ээс хассан → «perms.<slug>: B-д алга» хуурамч зөрүү
- **Тохиолдсон (staging, 2026-10-19, v0.2.2 → v0.2.2.1):** `--compare` → 3 зөрүү: `perms.tenant-a / tenant-b / test-tenant: B-д алга`. Бодит өгөгдөл (sinohydro кемп, эрх) ижил.
- **Шалтгаан:** `--like` нь A-гийн slug-ийг зөвхөн **кемпүүдээс** авдаг → нэг slug (sinohydro) → B зөвхөн тэр байгууллагыг авав; A-д кемпгүй 3 байгууллагын (0 мөр) `perms` байсан.
- **Шийдэл:** `camp-snapshot.cli.ts` — slug-ийг кемп + `perms`-ийн түлхүүрээс.
- **Дүрэм:** A/B харьцуулах хэрэгслийн хүрээг (slug, муж) A-гийн **бүх** хэсгээс гаргана; зөрүү гарвал эхлээд бодит өгөгдөл эсвэл хэрэгслийн хүрээ эсэхийг ялгана.

### [OPS-012] Cloud: `binaries.prisma.sh` хаалттай → `prisma generate` / Prisma engine татагдахгүй (integration тест ажиллахгүй)
- **Тохиолдсон (cloud, 2026-10-19, v0.2.3 Блок F):** `prisma generate` → `403 Forbidden … schema-engine.sha256`; GitHub-д repo хандалт алга, Supabase Docker image татах боломжгүй.
- **Шийдэл (зөвхөн cloud, repo-д commit хийхгүй):** (1) `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1` + `PRISMA_{SCHEMA_ENGINE_BINARY,QUERY_ENGINE_LIBRARY}=<хоосон файл>` + `prisma generate --no-engine` → tsc / unit; (2) integration: schema-ийн хуулбарт `previewFeatures = ["driverAdapters"]` + тусдаа `output` → `@prisma/client`-д багтсан `query_engine_bg.postgresql.wasm` + `@prisma/adapter-pg` shim (`datasources.db.url` → `PrismaPg(Pool)`), vitest `resolve.alias['@prisma/client']` → shim; (3) PG 16 + `auth` схемийн stub + бүх migration; (4) GoTrue-г жижиг Node mock-оор (admin users, token, user). Үр дүн: integration 266/266.
- **Дүрэм:** Cloud-д сүлжээний хязгаартай үед ч integration-ийг бодит PG + RLS дээр ажиллуулна (shim-ээр); тэр орчны тохиргоог repo-д оруулахгүй. Бодит GoTrue / e2e нь таны машин дээр.
