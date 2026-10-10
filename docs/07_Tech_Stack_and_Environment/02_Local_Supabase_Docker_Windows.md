# 02 — Local орчин: Supabase + Redis on Docker (Windows)

> Шинэчлэгдсэн: 2026-10-10 (v0.1.5: `app_user` холболт, тест командууд) · 2026-10-08 (шинэ машин дээр бүрэн туршсан) | Холбоотой: `README.md` → Quick Start, `supabase/config.toml`, `docker-compose.dev.yml`, `docs/lessons_learned.md` §12

S Project-ийн local хөгжүүлэлтэд **хоёр бүлэг контейнер** Docker Desktop дээр ажиллана:

| Бүлэг | Хэрхэн асдаг | Агуулга |
|---|---|---|
| **Supabase stack** | `pnpm supabase:start` (Supabase CLI) | Postgres, Auth, PostgREST, Realtime, Storage, Studio, Mailpit, Edge runtime |
| **Redis** | `docker-compose -f docker-compose.dev.yml up -d` | `s-project-redis-dev` (port 6379) |

NestJS (`core-kernel`) болон frontend (`web-shell`) нь контейнерт **биш**, host дээр `pnpm dev`-ээр ажиллана.

> Supabase-д зориулж тусдаа `docker-compose` бичихгүй — CLI өөрөө контейнерүүдийг удирдана.

---

## 1. Шинэ машин дээр анх тохируулах (GitHub-аас clone хийсний дараа)

> Бүх командыг **PowerShell**-д, төслийн root (`E:\MoogiiDev\s-project`) дотор ажиллуулна.
> Програм суулгасны дараа терминал шинэ PATH-ийг мэдэхгүй байдаг — **шинэ цонх нээх** эсвэл доорх мөрийг ажиллуулна:
> ```powershell
> $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
> ```

### 1.1 Шаардлага шалгах
```powershell
wsl --status                  # "Default Version: 2"
docker --version              # Docker Desktop
node -v                       # v20+
pnpm -v                       # 9.12.0
```

### 1.2 Дутуу байгааг суулгах

| Хэрэгсэл | Суулгах | Тайлбар |
|---|---|---|
| Docker Desktop | `winget install Docker.DockerDesktop` → **restart** | "Use WSL 2" сонголттой. Per-user суувал `%LOCALAPPDATA%\Programs\DockerDesktop`-д суудаг (`C:\Program Files` биш) |
| Node.js LTS | `winget install OpenJS.NodeJS.LTS` | `engines.node >= 20` |
| PowerShell script эрх | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` | Үгүй бол `npm.ps1 cannot be loaded` алдаа |
| pnpm | `npm install -g pnpm@9.12.0` | `package.json` → `packageManager` |

Docker Desktop-ийг нэг удаа нээгээд taskbar дээр **"Engine running"** болтол хүлээнэ → `docker ps` алдаагүй гарна.

### 1.3 Dependencies + Supabase CLI
```powershell
pnpm install                  # Supabase CLI root devDependency-д орсон тул хамт суулгагдана
pnpm supabase --version
```

> ⚠️ Supabase CLI-г `npm install -g supabase`-ээр суулгаж **болохгүй** (CLI дэмждэггүй). Төслийн devDependency (`supabase`) ашиглана — баг бүхэлдээ ижил хувилбартай.

### 1.4 Supabase асаах
```powershell
pnpm supabase:start           # Анх удаа ~10 image (2–3 GB) татна — 5–10 мин
```
Амжилттай бол: 15 migration → `seed.sql` → `Started supabase local development setup.`

### 1.5 `.env` файлууд үүсгэх (3 ширхэг — GitHub-д байдаггүй)

| Файл | Хэн уншдаг |
|---|---|
| `.env` | NestJS (root) |
| `apps/core-kernel/.env` | **Prisma** — `pnpm db:*` нь `apps/core-kernel` дотроос ажилладаг тул root `.env`-г уншдаггүй |
| `apps/web-shell/.env` | Vite frontend (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL`). **`VITE_API_BASE_URL` хоосон үлдээнэ** → Vite proxy (`/api` → `:3000`); утга өгвөл CORS-оор хаагдана [ENV-008] |

> ⚠️ Supabase CLI v2.1xx+ нь `supabase status`-д **шинэ форматын key** (`sb_publishable_…`, `sb_secret_…`) харуулдаг. Манай код (`@supabase/supabase-js ^2.46`) **хуучин JWT key** (`eyJ…`) ашигладаг тул `supabase status -o env`-ээс `ANON_KEY`, `SERVICE_ROLE_KEY`-г авна.

Доорх скриптийг бүхэлд нь хуулж ажиллуулна — key-уудыг автоматаар бөглөж, `JWT_SECRET` үүсгэнэ:

```powershell
$kv = @{}
pnpm -s supabase status -o env | ForEach-Object { if ($_ -match '^([A-Z_]+)="?(.*?)"?$') { $kv[$matches[1]] = $matches[2] } }
"ANON_KEY: " + $kv.ANON_KEY.Substring(0,12) + "..."      # eyJhbGciOiJI... гарах ёстой

$jwt = -join (1..48 | ForEach-Object { [char[]]'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' | Get-Random })

$root = (Get-Content .env.example -Raw) `
  -replace 'your-anon-key-here', $kv.ANON_KEY `
  -replace 'your-service-role-key-here', $kv.SERVICE_ROLE_KEY `
  -replace 'CHANGE_THIS_TO_A_SECURE_RANDOM_STRING_OF_32_PLUS_CHARS', $jwt
$utf8 = New-Object System.Text.UTF8Encoding $false     # BOM-гүй UTF-8
[IO.File]::WriteAllText("$PWD\.env", $root, $utf8)
[IO.File]::WriteAllText("$PWD\apps\core-kernel\.env", $root, $utf8)

$web = (Get-Content apps\web-shell\.env.example -Raw) -replace 'your_supabase_anon_key', $kv.ANON_KEY
[IO.File]::WriteAllText("$PWD\apps\web-shell\.env", $web, $utf8)
```

> **DB холболт (v0.1.5):** `.env.example` → `DATABASE_URL` = **`app_user`** (RLS идэвхтэй, production-тэй ижил), `SYSTEM_DATABASE_URL` = `postgres`, `DIRECT_URL` = `postgres` (Prisma migrate). `pnpm dev` асахад `DB role "app_user" — RLS идэвхтэй` гарна. Хуучин `.env` (DATABASE_URL = postgres) ч ажиллана — RLS алгасагдаж WARN лог гарна.

### 1.6 Prisma + Redis + dev
```powershell
pnpm db:generate              # Prisma Client (DB-д юу ч бичихгүй)
pnpm dev:test-user            # admin@test.mn-ийг Supabase Auth-д үүсгэж core_users-тэй холбоно (reset бүрийн дараа)
docker-compose -f docker-compose.dev.yml up -d
pnpm dev
```

> ⚠️ **`pnpm db:push` БҮҮ ажиллуул** [MIG-001] — DB-г `supabase/migrations/*.sql` (`pnpm supabase:start` / `supabase:reset` автоматаар) үүсгэнэ; `db push` RLS policy, GRANT, тусгай index-ийг устгах/зөрүүлэх эрсдэлтэй. Шинэ migration: `pnpm exec supabase migration up` → `pnpm db:generate`.

---

## 2. Өдөр тутмын командууд

| Команд | Юу хийх | Өгөгдөл |
|---|---|---|
| `pnpm supabase:start` | Supabase контейнерүүдийг асаана | Хадгална |
| `pnpm supabase:status` | URL, port, key-ууд (`-o env` → JWT key) | — |
| `pnpm supabase:stop` | Контейнерийг зогсооно | **Хадгална** (Docker volume) |
| `pnpm supabase stop --no-backup` | Зогсоогоод volume устгана | ⚠️ **БҮГДИЙГ УСТГАНА** |
| `pnpm supabase:reset` | DB-г устгаад `supabase/migrations/*.sql` + `seed.sql`-ийг дахин ажиллуулна | ⚠️ **БҮГДИЙГ УСТГАНА** |
| `docker-compose -f docker-compose.dev.yml up -d` / `down` | Redis асаах / зогсоох | Хадгална |
| `pnpm db:generate` | Prisma Client үүсгэнэ | — |
| `pnpm exec supabase migration up` | Шинэ migration-ийг хэрэглэнэ (auth хэрэглэгчийг устгахгүй) | Schema өөрчилнө |

### Тест

| Команд | Юу | Шаардлага |
|---|---|---|
| `pnpm test` | Unit (core-kernel + web-shell), сервергүй, ~10с | — |
| `pnpm test:integration` | NestJS + бодит DB (15 файл) | Supabase асаалттай, `.env` |
| `pnpm test:e2e` (= `pnpm e2e`) | Playwright: backend + web-shell-ийг өөрөө асаана; **fixture** нь 3 tenant + 13 хэрэглэгчийг үүсгээд, дуусахад устгана | Supabase, Redis, `.env`, `pnpm playwright:install` |
| `pnpm e2e:ui` | Playwright UI горим | ижил |

> E2E нэг ажиллалтад ~50 нэвтрэлт хийдэг → `supabase/config.toml`-д `[auth.rate_limit] sign_in_sign_ups = 500` (анхдагч 30/5 мин). `config.toml` өөрчлөгдсөний дараа `pnpm supabase:stop` → `pnpm supabase:start`.
> Кемп e2e: `supabase/dev/camp_e2e_grant.sql` (admin@test.mn → Кемп админ). E2E тасарсан бол `apps/e2e/.fixture.json` үлдэнэ → дараагийн ажиллалт эхлэхэд шинээр үүсгэнэ; хуучныг устгах: `pnpm --filter @s-project/core-kernel e2e:fixture teardown --in=apps/e2e/.fixture.json`.

### Өглөө
```powershell
# Docker Desktop-оо нээгээд "Engine running" болтол хүлээ
pnpm supabase:start
docker-compose -f docker-compose.dev.yml up -d
pnpm dev
```

### Орой (RAM чөлөөлөх — заавал биш)
```powershell
pnpm supabase:stop
docker-compose -f docker-compose.dev.yml down
```

> `supabase:reset`-ийн дараа зөвхөн `supabase/migrations/` дахь объектууд сэргэнэ. Prisma-гаар нэмэгдсэн өөрчлөлт байвал **`pnpm db:push`**-г дахин ажиллуулна.

---

## 3. Port-ууд (`supabase/config.toml`)

| Сервис | Port | URL / холболт |
|---|---|---|
| API (Kong gateway) | 54321 | http://127.0.0.1:54321 |
| **PostgreSQL** | **54322** | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Shadow DB (diff-д) | 54320 | — |
| Studio (DB UI) | 54323 | http://127.0.0.1:54323 |
| Mailpit (Auth имэйл тест) | 54324 | http://127.0.0.1:54324 |
| MCP | 54321 | http://127.0.0.1:54321/mcp |
| Pooler | 54329 | `enabled = false` |
| Analytics | 54327 | `enabled = false` (Windows-д асуудалгүй байлгах) |
| Redis | 6379 | `redis://localhost:6379` |

`supabase status`-д `Stopped services: [imgproxy, analytics, vector, pooler]` гэж гарах нь **хэвийн** — config-д санаатай унтраасан.

> Local key-ууд бүх машинд ижил demo key — нууц биш. Гэхдээ **production key-г `.env`-д хэзээ ч бүү тавь** (`.gitignore`-д орсон). Local stack `0.0.0.0`-д bind хийдэг тул нийтийн Wi-Fi дээр Docker Desktop-оо унтраах нь зүйтэй.

### Контейнер дотроос Supabase руу хандах
`docker-compose.yml` дахь `core-kernel` контейнер нь host дээрх Supabase руу `host.docker.internal`-аар хандана:
```env
DATABASE_URL="postgresql://postgres:postgres@host.docker.internal:54322/postgres?schema=public"
SUPABASE_URL="http://host.docker.internal:54321"
```

---

## 4. Түгээмэл алдаа ба шийдэл (Windows)

| Алдаа | Шалтгаан | Шийдэл |
|---|---|---|
| `docker` / `node` / `pnpm` `is not recognized` | Програм суулгахаас **өмнө** нээгдсэн терминал хуучин PATH-тай | Терминалаа (VS Code бол бүхэлд нь) дахин нээх, эсвэл §1-ийн PATH refresh мөр |
| `Test-Path "C:\Program Files\Docker\..."` → False | Docker Desktop per-user суусан | `%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin\docker.exe` |
| `npm.ps1 cannot be loaded because running scripts is disabled` | PowerShell ExecutionPolicy | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `'supabase' is not recognized` | CLI суугаагүй (`pnpm install` хийгээгүй) | `pnpm install` → `pnpm supabase --version` |
| `Cannot connect to the Docker daemon` / `error during connect` | Docker Desktop асаагүй / асаж дуусаагүй | "Engine running" болтол хүлээх |
| `invalid input value for enum "...": "..."` (seed үед) | `seed.sql` migration-ий enum-тэй зөрсөн | `seed.sql`-ийн утгыг migration-ий enum-тэй тааруулах (`lessons_learned` SEED-001) |
| `failed to bind port 0.0.0.0:5432x` / `access a socket in a way forbidden` | WinNAT/Hyper-V port нөөцөлсөн | Admin PowerShell: `net stop winnat` → `pnpm supabase:start` → `net start winnat`. Шалгах: `netsh interface ipv4 show excludedportrange protocol=tcp` |
| `port is already allocated` | Өөр Postgres / өөр төслийн Supabase ажиллаж байна | `docker ps --format "table {{.Names}}\t{{.Ports}}"` → `pnpm supabase stop --project-id <id>` |
| Prisma: `Environment variable not found: DATABASE_URL` | `apps/core-kernel/.env` байхгүй | §1.5 |
| Prisma: `Can't reach database server at 127.0.0.1:54322` | Supabase асаагүй | `pnpm supabase:status` |
| Auth: `Invalid API key` / JWT алдаа | `.env`-д `sb_publishable_…` шинэ key орсон | `supabase status -o env`-ийн `ANON_KEY` (`eyJ…`) ашиглах |
| `npm warn Unknown env config "node-linker"` | `.npmrc`-ийн pnpm тохиргоог npx уншсан | Хор хөнөөлгүй — үл тооно |
| Docker Desktop маш их RAM | WSL2 хязгааргүй | `%UserProfile%\.wslconfig` → `[wsl2]` `memory=6GB` → `wsl --shutdown` |
| `password authentication failed for user "app_user"` | `DATABASE_URL`-ийн нууц үг ≠ migration-ий (local `change_in_production`) | `.env.example`-ийн мөрийг хуулах |
| `pnpm dev` дараа бүх API 403 "Tenant олдсонгүй" | `DATABASE_URL` = app_user, `SYSTEM_DATABASE_URL` алга | `.env`-д `SYSTEM_DATABASE_URL` (postgres) нэмэх |
| E2E: `Request rate limit reached` / 429 нэвтрэлт | Supabase Auth rate limit (анхдагч 30/5 мин) | `config.toml` `[auth.rate_limit]` → `pnpm supabase:stop` → `start` |
| `'supabase' is not recognized` (`supabase stop` гэж бичсэн) | CLI глобал биш, root devDependency | `pnpm supabase:stop` / `pnpm supabase:start` [PROC-007] |

---

## 5. Шалгах жагсаалт (шинэ машин)

- [ ] `wsl --status` → Version 2
- [ ] `docker ps` алдаагүй
- [ ] `node -v` ≥ 20, `pnpm -v` = 9.12.0
- [ ] `pnpm install` → `pnpm supabase --version`
- [ ] `pnpm supabase:start` → 28 migration + seed → "Started"
- [ ] http://127.0.0.1:54323 Studio нээгдэнэ
- [ ] `.env`, `apps/core-kernel/.env`, `apps/web-shell/.env` — key нь `eyJ…`-ээр эхэлнэ
- [ ] `pnpm db:generate` → `pnpm dev:test-user` → "✅ admin@test.mn"
- [ ] `docker-compose -f docker-compose.dev.yml up -d` → Redis
- [ ] `pnpm dev` → core-kernel DB, Redis-тэй холбогдоно
- [ ] `pnpm playwright:install` → Chromium (E2E-д заавал) [ENV-007]
- [ ] `pnpm test` → бүгд ✅ (unit л, ~10с)
- [ ] `pnpm test:integration` → 15 файл ✅
- [ ] `pnpm test:e2e` → 47 passed (0 skip)
