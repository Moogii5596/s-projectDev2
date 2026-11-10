---
title: "04 — Кемп пилот: нэг Windows машин дээр интернэтэд нээх (v0.1.6, шинэчлэл/staging — v0.2.4)"
type: "Guide"
status: "Active"
last_updated: 2026-11-10
tags: [camp, pilot, stack]
---

# 04 — Кемп пилот: нэг Windows машин дээр интернэтэд нээх (v0.1.6, шинэчлэл/staging — v0.2.4)

> Үүсгэсэн: 2026-10-10 (v0.1.6) | Байгууллага: **Sino Hydro** (`sinohydro`) | Модуль: **Кемп**
> Холбоотой: `deploy/pilot/` (скрипт, тохиргоо), [[ADR-002_Hosting]] (хостинг), [[02_Local_Supabase_Docker_Windows]] (dev орчин),
> [[03_Enterprise_VPC_Deployment]] (бүрэн VPC), [[LL-03_Env_Ops_Pilot]] §20

> **Пилотын хаяг (2026-10-13-аас): `https://sino.gobiverse.website`** — Cloudflare Tunnel (`cloudflared` Windows service), заавар [[05_Cloudflare_Tunnel]], шийдвэр [[ADR-005_Org_Connectivity_Domains]]. Tailscale Funnel **хаагдсан** (§7 — түүх/нөөц).

Пилот нь **хувийн мэдээлэлтэй** бодит өгөгдөлтэй ажиллана. Доорх аюулгүй байдлын алхмуудыг алгасахгүй.

---

## 0. Бүтэц

```
Хэрэглэгчийн утас/компьютер
   │  https://sino.gobiverse.website   (Cloudflare edge — HTTPS, CF-Connecting-IP)
   ▼
cloudflared (энэ машин, Windows service) ──► 127.0.0.1:8088  Caddy (deploy/pilot/Caddyfile)
                              ├─ /api/*                                   → 127.0.0.1:3100  backend (NestJS, dedicated: sinohydro)
                              ├─ /auth/v1/token | /auth/v1/user | /auth/v1/logout → 127.0.0.1:55321 Supabase Auth
                              ├─ /auth/*, /rest/*, /storage/*, /realtime/* …       → 404 (хаалттай)
                              └─ бусад                                    → web-shell build (зөвхөн Кемп цэс)
Docker Desktop:  Supabase "s-project-pilot" (553xx)  ·  Redis "s-project-pilot-redis" (127.0.0.1:56379)
```

| | Dev (`E:\MoogiiDev\Dev\s-project`) | **Пилот** (`E:\MoogiiDev\Pilot\s-project`) |
|---|---|---|
| Код | салбар (main) | **tag `v0.1.6`** (тусдаа clone) |
| Supabase | `s-project`, 54321–54329 | `s-project-pilot`, **55321–55329** (Studio унтраалттай) |
| Backend / Web | `pnpm dev` (:3000 / :5173) | build → `node` :3100 + Caddy :8088 |
| Redis | 6379 | 127.0.0.1:**56379** |
| Удирдах | `pnpm ...` | **`.\deploy\pilot\pilot.ps1 ...`** |

Хоёулаа зэрэг ажиллана. **Пилотын хавтсанд `pnpm supabase:*`, `pnpm dev`, `pnpm test*` ажиллуулахгүй** — dev-ийн тохиргоо (54321, demo нууц) асна.

### Аюулгүй байдлын загвар
- Гадаад хүсэлт зөвхөн Cloudflare Tunnel → 127.0.0.1:8088 Caddy-ээр орно. DB (55322), Supabase API (55321), backend (3100), Redis — гаднаас хаалттай (Firewall §6).
- Supabase-ийн **өөрийн JWT нууц** (`SUPABASE_AUTH_JWT_SECRET`). Local Supabase-ийн demo нууц олон нийтэд ил — түүгээр хэн ч service key үүсгэж чадна. `pilot.ps1` demo нууцыг илрүүлбэл асахгүй.
- **Нээлттэй бүртгэл хаалттай** (`enable_signup = false` + Caddy `/auth/v1/signup` 404). Хэрэглэгчийг зөвхөн `pilot.ps1 onboard|user`.
- Апп `app_user` (RLS)-ээр, нууц үг нь анхдагч биш. `NODE_ENV=production`, `DEPLOYMENT_MODE=dedicated`.
- Supabase-ийн published port-уудыг Docker-ийн `127.0.0.1` host-binding network-д ажиллуулна (`pilot.ps1 init`); `pilot.ps1 status` loopback binding болон Firewall дүрмийг шалгана. Алдаа гарвал Firewall-ийг унтрааж тойрохгүй.
- Нөөц **AES-256 шифрлэсэн** (7-Zip, файлын нэр ч шифрлэгдэнэ).
- Зөвлөмж: дискэнд **BitLocker**, Windows хэрэглэгчид хүчтэй нууц үг, дэлгэц түгжих.

---

## 1. Програм суулгах (нэг удаа)

PowerShell (энгийн):
```powershell
winget install CaddyServer.Caddy
winget install 7zip.7zip
winget install Tailscale.Tailscale
```
Node 22, pnpm 9, Git, Docker Desktop аль хэдийн суусан (dev). Суулгасны дараа **PowerShell-ийг хааж дахин нээнэ** (PATH).

> Docker Desktop → Settings → General → **"Start Docker Desktop when you sign in"** асаалттай байх.

## 2. Пилотын хавтас

```powershell
mkdir E:\MoogiiDev\Pilot
cd E:\MoogiiDev\Pilot
git clone https://github.com/Moogii5596/s-projectDev2 s-project
cd s-project
git checkout v0.1.6
```

## 3. `.env`

```powershell
copy deploy\pilot\.env.pilot.example .env
notepad .env
```
`<...>` бүрийг солино. Санамсаргүй утга үүсгэх (дор бүрийн хувьд дахин ажиллуулна):
```powershell
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | % {[char]$_})
```
| Түлхүүр | Анхаарах |
|---|---|
| `DATABASE_URL`-ийн `<APP_USER_PASSWORD>` | зөвхөн үсэг+тоо, 24+ |
| `SUPABASE_AUTH_JWT_SECRET`, `JWT_SECRET` | 40 тэмдэгт; хоёр өөр утга |
| `PILOT_BACKUP_PASSWORD` | үсэг+тоо, 24+. **Нууц үгийн менежерт хадгална** — алдвал нөөц нээгдэхгүй |
| `PILOT_DB_ADMIN_PASSWORD` | `postgres` / `supabase_admin`-д тусдаа, үсэг+тоо 32+. Staging ба pilot-д өөр нууц хэрэглэнэ; rotator `.env`-д хадгална |
| `PILOT_BACKUP_DIR` | боломжтой бол өөр диск / OneDrive-ийн хавтас |

```powershell
.\deploy\pilot\pilot.ps1 check
```
`[OK] .env зөв` гарах ёстой. (Script ажиллахгүй бол: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.)

**DB administrator-ийн нууц:** шинээр асаахад `.env`-д `PILOT_DB_ADMIN_PASSWORD`-ийг санамсаргүй 32+ үсэг/тоон утгаар бөглөнө. Өмнө нь `postgres` анхдагч нууцтай суусан бол эхлээд staging дээр пилотоос тусдаа тестийн хуулбараар дараах командыг ажиллуулж, дараа нь пилотод баталгаажуул:
```powershell
.\deploy\pilot\pilot.ps1 rotate-db-password -Profile staging -Root E:\MoogiiDev\Staging\s-project
.\deploy\pilot\pilot.ps1 rotate-db-password -Profile pilot -Yes
```
Команд шинэ нууцыг хоёр удаа secure prompt-оор авч, DB-д transaction-аар сольж, амжилттай болсны дараа `.env`-г шинэчилнэ; нууцыг дэлгэц/логт хэвлэхгүй. Пилотод `-Yes` болон байгууллагын slug-аар баталгаажуулна. Нууцыг нууц үгийн менежерт хадгал.

## 4. Анхны асаалт

```powershell
pnpm install --frozen-lockfile     # шинэ clone-д заавал (Supabase CLI = devDependency); v0.1.6.1+-д init өөрөө хийнэ
.\deploy\pilot\pilot.ps1 init     # migration хуулах, Redis + Supabase асаах (анх удаа image татна), app_user нууц үг
.\deploy\pilot\pilot.ps1 build    # pnpm install, Prisma, backend + web build (Кемп цэс)
.\deploy\pilot\pilot.ps1 start    # backend + Caddy
```
Шалгах: http://127.0.0.1:8088 → нэвтрэх хуудас.

## 5. Байгууллага + эзэмшигч

```powershell
.\deploy\pilot\pilot.ps1 onboard --slug=sinohydro "--name=Sino Hydro" --email=<эзэмшигчийн email> "--owner-name=<Нэр Овог>"
```
- Байгууллага + **OWNER** + **Кемп админ** (бүх кемп) үүснэ. **Нууц үг нэг удаа хэвлэгдэнэ** — эзэмшигчид аюулгүй сувгаар (биечлэн / утсаар) өгнө.
- Давтан ажиллуулахад аюулгүй (байгаа зүйлийг дахин үүсгэхгүй, нууц үг солихгүй).
- Зай агуулсан аргументыг бүхэлд нь хашилтанд: `"--name=Sino Hydro"`.

Нэвтэрч ороод: Кемп → кемп үүсгэх, байгууллага, ажилчид г.м.

## 6. Firewall (Админ PowerShell — нэг удаа)

**Start → PowerShell → баруун товч → Run as administrator:**
```powershell
cd E:\MoogiiDev\Pilot\s-project
.\deploy\pilot\pilot.ps1 firewall
```
Гаднаас (LAN, Tailscale-ийн бусад төхөөрөмж) хаагдах TCP: 3000, 3100, 3200, 5173, 5174, 6379, 8088, 8089, 54320–54329, 55320–55329, 56379, 56520–56529, 56579 (v0.2.0: staging-ийн портууд нэмэгдсэн → **v0.2.0 суулгасны дараа нэг удаа дахин ажиллуулна**).
`pilot.ps1 status` дүрэм идэвхтэй эсэх, Docker-ийн API/Postgres/Studio published port-ууд болон Supabase network-ийн host binding-ийг шалгана. 127.0.0.1-ээс өөр host binding байвал анхааруулна. Энэ машин дээрээс (localhost) болон Cloudflare Tunnel-ээр ажиллахад нөлөөлөхгүй. Dev-ийг өөр төхөөрөмжөөс (утаснаас :5173) нээх боломжгүй болно.

> Supabase-ийн DB (`postgres`/`supabase_admin`) нууц үг нь local-ийн анхдагч `postgres` хэвээр — тиймээс энэ дүрэм **заавал**.

## 7. Tailscale Funnel — хаалттай

Гадаад хэрэглэгчийн урсгал зөвхөн [[05_Cloudflare_Tunnel]]-ээр орно. `tailscale funnel --bg` ажиллуулахгүй; өмнөх тохиргоо үлдсэн бол `tailscale funnel reset` ажиллуулж, `pilot.ps1 status`-д Funnel унтраалттайг батална. Funnel-ийг нөөц зам болгон асаах нь Cloudflare-ийн итгэмжлэгдсэн header-ийг хуурамчаар тавих эрсдэлтэй ([[ADR-005_Org_Connectivity_Domains]] §2.3).

## 8. Гаднаас шалгах (заавал)

**Утаснаас, Wi-Fi-г УНТРААЖ (мобайл дата):**
| Хаяг | Хүлээгдэх |
|---|---|
| `https://<хаяг>/` | Нэвтрэх хуудас, нэвтэрч Кемп нээгдэнэ |
| `https://<хаяг>/api/v1/health` | `{"status":"ok","version":"0.1.6",…}` |
| `https://<хаяг>/rest/v1/` | 404 |
| `https://<хаяг>/auth/v1/signup` | 404 |

**Ижил Wi-Fi-д холбогдсон өөр төхөөрөмжөөс** (энэ машины LAN IP — `ipconfig`):
| Хаяг | Хүлээгдэх |
|---|---|
| `http://<LAN IP>:3100/api/v1/health` | нээгдэхгүй (timeout) |
| `http://<LAN IP>:55321/` | нээгдэхгүй |
| `http://<LAN IP>:8088/` | нээгдэхгүй |

Аль нэг нь нээгдвэл §6-г дахин шалгана (Админ эрхээр ажилласан эсэх).

## 9. Автомат асаалт, нөөцлөлт, тэжээл

```powershell
.\deploy\pilot\pilot.ps1 install-tasks
```
- **`S-Project Pilot`** — Windows-д нэвтрэхэд `pilot.ps1 run`: Docker-ийг хүлээж (≤15 мин) бүгдийг асаана, дараа нь 30 сек тутам backend/Caddy-г шалгаж унасан бол дахин асаана (`deploy\pilot\run\logs\pilot.log`).
- **`S-Project Pilot Backup`** — өдөр бүр 02:00 `pilot.ps1 backup` (унтарсан байвал асмагц).
- Даалгавар зөвхөн **хэрэглэгч нэвтэрсэн үед** ажиллана → машиныг унтраахгүй, гарахгүй (дэлгэц түгжих — болно).

Тэжээл (Админ PowerShell):
```powershell
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
```
Windows Update: Settings → Windows Update → **Active hours** (ажлын цаг) тохируулна.

Шалгах: `Get-ScheduledTask -TaskName 'S-Project Pilot*'` · Гараар асаах: `Start-ScheduledTask 'S-Project Pilot'`.

### 9а. Мониторинг — унавал мэдэгдэл (v0.2.1, PIL-04)

Машин унтарсан, интернэт тасарсан, backend унасан, нөөц бүтэлгүйтсэн үед **таны утас/имэйл рүү** мэдэгдэл ирнэ. Заавал биш, гэхдээ пилотод зөвлөнө.

1. [healthchecks.io](https://healthchecks.io) (үнэгүй) → 2 check үүсгэнэ:
   - **S-Project Pilot** — Period **10 мин**, Grace **10 мин**
   - **S-Project Backup** — Period **1 өдөр**, Grace **2 цаг**
   - Integrations → Email (эсвэл Telegram) идэвхжүүлнэ.
2. Ping URL-уудыг `.env`-д (нууц үг биш, гэхдээ нийтэд бүү тавь):
   ```
   PILOT_HEALTHCHECK_URL=https://hc-ping.com/<pilot-uuid>
   PILOT_HEALTHCHECK_BACKUP_URL=https://hc-ping.com/<backup-uuid>
   ```
3. `pilot.ps1 check` (URL-ийн хэлбэрийг шалгана) → `Start-ScheduledTask 'S-Project Pilot'` (watchdog дахин асаана) → `pilot.ps1 status` → "healthcheck ping илгээв".

Ажиллагаа:
- `run` (watchdog): эрүүл үед 5 мин тутам (`PILOT_HEALTHCHECK_INTERVAL_SEC`) ping; backend унавал / health 2 удаа дараалан алдвал / Caddy унавал шууд `/fail`. Машин, интернэт, watchdog бүхэлдээ зогсвол ping тасарч healthchecks өөрөө мэдэгдэнэ.
- `status`: гараар ажиллуулахад мөн ping (эрүүл бол OK, үгүй бол `/fail`).
- `backup`: амжилттай бол backup check руу OK; нөөц эсвэл хуулбар бүтэлгүйтвэл `/fail`. `PILOT_HEALTHCHECK_BACKUP_URL` хоосон бол зөвхөн алдааг `PILOT_HEALTHCHECK_URL` руу `/fail` илгээнэ.
- Ping амжилтгүй бол пилотыг зогсоохгүй, зөвхөн `logs\pilot.log`-д бичнэ (URL-ийг логт бичихгүй).

**Гаднаас uptime шалгалт (нэмэлт):** UptimeRobot (үнэгүй, 5 мин) → HTTP(s) monitor → `https://sino.gobiverse.website/api/v1/health` (хариу 200). Энэ нь Cloudflare Tunnel + Caddy + backend-ийг интернэтээс шалгана — healthchecks нь машин дотроос, UptimeRobot нь гаднаас.

## 10. Хэрэглэгч удирдах

```powershell
# Шинэ хэрэглэгч (нууц үг автоматаар, нэг удаа хэвлэнэ)
.\deploy\pilot\pilot.ps1 user --email=bat@sinohydro.mn --role=VIEWER "--name=Бат Дорж" --camp-role=CAMP_MANAGER
# Role солих
.\deploy\pilot\pilot.ps1 user --email=bat@sinohydro.mn --role=APPROVER
# Нууц үг сэргээх (мартсан)
.\deploy\pilot\pilot.ps1 user --email=bat@sinohydro.mn --role=APPROVER --reset-password
# Идэвхгүй болгох (шууд хүчинтэй)
.\deploy\pilot\pilot.ps1 user --email=bat@sinohydro.mn --role=APPROVER --deactivate
```
| `--role` | Утга |
|---|---|
| `OWNER` / `ADMIN` | Байгууллагын бүх тохиргоо |
| `APPROVER` / `REQUESTER` / `VIEWER` | Үндсэн role (Кемп пилотод голчлон `VIEWER` + кемпийн роль) |

`--camp-role`: `CAMP_ADMIN` (бүх кемп, эрх олгоно) · `CAMP_MANAGER` · `CATERING_ADMIN` — **бүх кемпэд**. Тодорхой нэг кемпэд эрх → апп-д Кемп → **Хэрэглэгчийн роль**.
`--role` заавал (байгаа хэрэглэгчид ч одоогийн role-ийг бичнэ). Нууц үгийг мессенжерийн бүлэгт бичихгүй.

**Нэвтрэлтийн түгжээ (v0.2.1, PIL-07):** нэг бүртгэлд 15 минутад **5 буруу нууц үг → 15 минут түгжинэ** (зөв нууц үгтэй ч "Хэт олон буруу оролдлого — N минутын дараа…", 3 хэлээр). Зөв нэвтэрвэл тоолуур тэглэнэ. Хэрэглэгч хүлээж чадахгүй бол:
```powershell
.\deploy\pilot\pilot.ps1 unlock worker@sinohydro.mn
```

## 11. Өдөр тутам

| Команд | Юу |
|---|---|
| `pilot.ps1 status` | Процесс, health, контейнер, port binding, Firewall, Funnel, DB + storage хэмжээ, сүүлийн нөөц |
| `pilot.ps1 stop` | backend + Caddy (+watchdog) зогсооно. Дахин: `Start-ScheduledTask 'S-Project Pilot'` |
| `pilot.ps1 stop -All` | + Supabase, Redis (өгөгдөл **хадгалагдана**) |
| `pilot.ps1 backup` | Гараар нөөц авах |

Лог: `deploy\pilot\run\logs\` — `backend.log`, `backend.err.log`, `caddy-access.log`, `pilot.log`, `backup.log`.

## 12. Нөөц ба сэргээлт

- Агуулга: `public` schema-ийн бүх өгөгдөл + `auth.users`, `auth.identities` (нэвтрэх эрх, нууц үгийн hash) + migration жагсаалт + manifest. Schema нь кодын migration-оос.
- Файл: `PILOT_BACKUP_DIR\sinohydro-YYYYMMDD-HHMMSS.7z`, `PILOT_BACKUP_KEEP_DAYS` (14) хоногоос хуучныг устгана.
- **2 дахь хуулбар (v0.2.1, PIL-05):** `.env`-д `PILOT_BACKUP_COPY_DIR=` (OneDrive / USB / өөр диск — `PILOT_BACKUP_DIR`-ээс ӨӨР) тохируулбал нөөц бүрийг тэнд хуулж SHA256-аар тулгана, хуучныг ижил `PILOT_BACKUP_KEEP_DAYS`-ээр устгана. Хуулбар бүтэлгүйтвэл үндсэн нөөц хэвээр, `backup.log`-д `COPY FAIL` + мониторинг `/fail`. `pilot.ps1 status` сүүлийн хуулбарыг харуулна.
- Feed-ийн `storage/` хавтас нөөцөд орж, сэргээхэд нөөцийн хуулбараар солигдоно. `status` болон 5 минут тутмын watchdog шалгалт PostgreSQL DB + storage нийлбэрийг `.env`-ийн `PILOT_STORAGE_DB_WARN_GB` (анхдагч 10 GB)-тэй харьцуулж, босго давбал анхааруулга болон healthcheck `/fail` илгээнэ. Мөн storage байгаа дискний сул зай 10 GB эсвэл 10%-иас доош бол анхааруулна.
- Хуулбар тохируулаагүй бол **7 хоногт нэг удаа** нөөцийг өөр төхөөрөмж рүү (USB / OneDrive) гараар хуулна.

Сэргээх (**одоогийн өгөгдөл устна** — slug бичиж баталгаажуулна):
```powershell
.\deploy\pilot\pilot.ps1 restore E:\MoogiiDev\Pilot\backups\sinohydro-20261011-020000.7z
Start-ScheduledTask 'S-Project Pilot'
```
Нөөц ба кодын migration ижил байх ёстой (өөр бол сэргээхгүй, юу ч устгахгүй) — нөөцийг үүсгэсэн tag-ийг checkout хийж сэргээнэ.
Сэргээсний дараа хэрэглэгчид дахин нэвтэрнэ. **Пилотын эхний долоо хоногт нэг удаа сэргээлтийн дадлага** хийнэ (backup → restore → нэвтэрч шалгах).

## 13. Шинэ хувилбар суулгах

**Эхлээд staging дээр дадлага (§13в) — A = B болсны дараа л пилотод.**

### v0.2.0 ба түүнээс хойш — нэг команд
```powershell
cd E:\MoogiiDev\Pilot\s-project
.\deploy\pilot\pilot.ps1 upgrade -Tag v0.2.1
```
Дараалал: `.env` шалгах → git tree цэвэр эсэх (commit хийгээгүй өөрчлөлттэй бол **эхлэхгүй**) → `git fetch --tags` → tag байгаа эсэх → **нөөц** → Task-ийг түр идэвхгүй + зогсоох → `git checkout <tag>` → шинэ хувилбарын `init` (migration) → `build` → `start` → health → Task-ийг дахин асаана. Лог: `deploy\pilot\run\logs\upgrade.log`.
Алдаа гарвал **буцаах алхмыг хэвлэнэ** (өмнөх tag, яг энэ шинэчлэлийн нөөцийн зам) — хуулж ажиллуулна:
```powershell
.\deploy\pilot\pilot.ps1 stop
git checkout v0.2.0
.\deploy\pilot\pilot.ps1 restore E:\MoogiiDev\Pilot\backups\sinohydro-YYYYMMDD-HHMMSS.7z   # migration буцдаггүй тул заавал
.\deploy\pilot\pilot.ps1 build
Start-ScheduledTask 'S-Project Pilot'
```

### v0.1.6.x → v0.2.0 (нэг удаа — хуучин `pilot.ps1`-д `upgrade` алга)
```powershell
cd E:\MoogiiDev\Pilot\s-project
git status                                   # "nothing to commit" байх ёстой
.\deploy\pilot\pilot.ps1 backup
.\deploy\pilot\pilot.ps1 stop
git fetch --tags
git checkout v0.2.0
.\deploy\pilot\pilot.ps1 init             # 5 шинэ migration (зөвхөн нэмэлт)
.\deploy\pilot\pilot.ps1 build
Start-ScheduledTask 'S-Project Pilot'
.\deploy\pilot\pilot.ps1 status
.\deploy\pilot\pilot.ps1 firewall         # Админ PowerShell — staging портуудыг нэмнэ (§6)
```
Шалгах: утаснаас нэвтрэх → Кемп нээгдэнэ (сүүлд орсон кемп), хэл сонгох (баруун дээд), Тохиргоо каталог.

### 13в. Staging дээр шинэчлэлийн дадлага (v0.2.0 §0.2) — пилотын өгөгдлийг өөрчлөхгүй
Staging = **ижил машин, тусдаа** Supabase (`s-project-staging`, 56521/56522, Studio 56523), Redis 56579, backend 3200, Caddy 8089 (Funnel-гүй, Task-гүй). Пилотын нөөцийг сэргээж, хуучин → шинэ хувилбарт шилжүүлээд хоолны тооцоо өөрчлөгдөөгүйг (`camp:snapshot` A = B) шалгана.

**Нэг удаагийн бэлтгэл**
```powershell
# 1) Staging clone (пилотын хавтаснаас ТУСДАА)
git -C E:\MoogiiDev\Pilot\s-project remote get-url origin        # пилотын URL
git clone <тэр URL> E:\MoogiiDev\Staging\s-project
# 2) Шинэ скриптийн "tools" хуулбар — хуучин tag-ийн clone-д deploy\staging алга тул скриптийг гаднаас ажиллуулна
cd E:\MoogiiDev\Dev\s-project ; git fetch --tags
git archive --format=zip -o E:\MoogiiDev\Staging\tools.zip v0.2.0 deploy   # PowerShell-ийн "|" binary-г эвддэг тул zip файлаар
Expand-Archive E:\MoogiiDev\Staging\tools.zip E:\MoogiiDev\Staging\tools -Force
# 3) .env.staging (staging clone-ийн root-д; PILOT_BACKUP_PASSWORD = пилотынх, бусад нууц ШИНЭ)
copy E:\MoogiiDev\Staging\tools\deploy\staging\.env.staging.example E:\MoogiiDev\Staging\s-project\.env.staging
notepad E:\MoogiiDev\Staging\s-project\.env.staging
```
Доорх командуудад `$st` товчлол:
```powershell
$st = 'E:\MoogiiDev\Staging\tools\deploy\pilot\pilot.ps1'
$sr = 'E:\MoogiiDev\Staging\s-project'
& $st check -Profile staging -Root $sr      # пилотын порт/DB руу заасан бол АЛДАА гаргаж зогсоно
```

**Дадлага (≈ 30–40 мин)**
```powershell
# A. Пилотын шинэ нөөц
cd E:\MoogiiDev\Pilot\s-project ; .\deploy\pilot\pilot.ps1 backup
# B. Staging-ийг пилотын ОДООГИЙН хувилбар дээр (жнь v0.1.6.1)
cd $sr ; git fetch --tags ; git checkout v0.1.6.1
& $st init  -Profile staging -Root $sr
& $st build -Profile staging -Root $sr
& $st restore E:\MoogiiDev\Pilot\backups\sinohydro-YYYYMMDD-HHMMSS.7z -Profile staging -Root $sr   # slug бичиж баталгаажуулна
# C. Snapshot A (v0.2.2 → v0.2.3: хуучин staging clone-оос; бусад хувилбарын CLI нийцлийг урьдчилан шалгана)
cd E:\MoogiiDev\Staging\s-project
pnpm camp:snapshot --env=E:\MoogiiDev\Staging\s-project\.env.staging --out=E:\MoogiiDev\Staging\a.json
# D. Шинэчлэл (пилот дээр хийх яг тэр команд)
& $st upgrade -Tag v0.2.0 -Profile staging -Root $sr
# E. Шинэ хувилбарын CLI: B-г A-тай ижил өдөр/мужаар (--like) авч, харьцуулна
cd E:\MoogiiDev\Dev\s-project
pnpm camp:snapshot --env=E:\MoogiiDev\Staging\s-project\.env.staging --out=E:\MoogiiDev\Staging\b.json --like=E:\MoogiiDev\Staging\a.json
pnpm camp:snapshot --compare E:\MoogiiDev\Staging\a.json E:\MoogiiDev\Staging\b.json
#    ✅ A = B  → пилотыг §13-аар шинэчилнэ.   ❌ зөрүү → пилотод ХИЙХГҮЙ, зөрүүний жагсаалтыг надад илгээнэ (тоо л, нэр байхгүй)
# F. Нэвтэрч шалгах: http://127.0.0.1:8089 (зөвхөн энэ машинаас) — пилотын хэрэглэгчийн нууц үгээр
# G. Дуусахад зогсоох (өгөгдөл хадгалагдана; дараагийн дадлагад restore дахин хийнэ)
# H. (v0.2.1+) Нэвтрэлтийн түгжээ — staging-д байгаа туршилтын хэрэглэгчээр (6 буруу нууц үг → 400×5, 429; дараа нь түгжээг тайлна)
& $st auth-test test@sinohydro.mn -Profile staging -Root $sr
& $st stop -All -Profile staging -Root $sr
```
- `init` нь Supabase-ийн `config.toml` өөрчлөгдсөн бол (жнь v0.2.1-ийн нэвтрэлтийн hook) migration-ы дараа Supabase-ийг **дахин асаана** (~1-2 мин, өгөгдөл хадгалагдана). v0.2.1 руу анх шинэчлэхэд нэг удаа заавал болно.
- Замыг **бүтэн** (E:\...) бичнэ. Snapshot: кемп бүрт өнөөдөр − 35 … + 7 хоногийн хоолны тоо (хоол × байршил), хүн, хүн-өдөр, өрөөний самбарын нийлбэр, мастер/үйл ажиллагааны тоо. Файлд **хувийн мэдээлэл байхгүй** (тоо, кемп/байршлын нэр) — гэхдээ git-д оруулахгүй.
- v0.2.2 → v0.2.3-д A-г хуучин хувилбарын CLI-аар авна: v0.2.3-ийн CLI хуучин DB-д байхгүй тохиргооны баганыг уншдаг. B ба харьцуулалтыг v0.2.3 CLI-аар хийж, ADR-007 эрхийн нэрийн шилжилтийг тооцно. CLI алдаа өгвөл өмнөх `a.json`-ийг ашиглахгүй.
- Эрхийн шууд олголт эсвэл өөрчлөгдсөн загварын улмаас роль-загвар ба эцсийн эрх өмнөөсөө ялгаатай байж болно; A/B-д уг ялгааны өөрчлөлт болон бодит эрхийг харьцуулна (OPS-015). v0.2.3 tag-ийн дараах энэ засварыг агуулсан dev CLI шаардлагатай.
- Staging нь пилотын нөөцийг агуулна → `.env.staging`, `E:\MoogiiDev\Staging\backups` пилоттой ижил хамгаалалт; дадлага дууссаны дараа `stop -All`.
- `upgrade` нь staging-ийн өөрийн нөөцийг `staging-sinohydro-*.7z` нэрээр авна (пилотын нөөцтэй холилдохгүй).

### 13б. Hotfix (P0) — `release/v0.1` салбар (2026-10-11 шийдвэр D2)
v0.1 хаагдсан; `main` дээр v0.2 хөгжиж байгаа тул пилотын P0 засварыг **dev хавтсанд** `release/v0.1` салбарт хийнэ:
```powershell
git switch release/v0.1        # анх: git switch -c release/v0.1 v0.1.6.1 ; git push -u origin release/v0.1
# … засвар + тест (pnpm test, test:integration, test:e2e) …
git commit -am "fix: <P0 тайлбар> (FB-xx)"
git tag v0.1.7 ; git push origin release/v0.1 --tags
git switch main ; git merge release/v0.1   # засварыг v0.2-т ч оруулна
```
Пилот дээр §13-ийн алхмаар `git checkout v0.1.7`.

### 13г. v0.2.4 (v0.2.4.1) — staging дадлага, эрхийн gate, пилотын шинэчлэл

> Энэ хэсэг нь заавар; одоогийн release бэлтгэлд staging/pilot-д **ажиллуулахгүй**. Pilot upgrade-д эзэмшигчийн шууд зөвшөөрөл шаардлагатай. Migration `20261107006` хуучин эрхийн хүснэгтүүдийг устгах тул буцаалт нь migration хийхээс өмнөх DB + storage нөөцийг сэргээх юм.

1. **Бэлтгэл ба нөөц:** пилотын админ PowerShell дээр `.\deploy\pilot\pilot.ps1 backup` ажиллуул. Нөөцөд PostgreSQL ба `storage/` орсныг шалгаж, архив болон гаднах хуулбарын SHA256 таарч байгааг баталгаажуул. `FILE_ENCRYPTION_KEY`-ийг нөөцийн архиваас тусад нь нууц үгийн менежерт хадгал. v0.2.3 нөөцөд v0.2.4-ийн `core_attachments` байхгүй тул staging-д §1а-ийн дагуу тусдаа шинэ түлхүүр хэрэглэнэ; v0.2.4+ шифрлэгдсэн хавсралттай нөөцийг сэргээх бол тухайн нөөцийн түлхүүр шаардлагатай. Бодит `.env`-г Git/чатад бүү хуул.
1а. **Tools ба нууц (v0.2.4.1):** staging/pilot-ийг ШИНЭ скриптээр ажиллуулна — `git archive --format=zip -o E:\MoogiiDev\Staging\tools.zip v0.2.4.1 deploy` → `Expand-Archive E:\MoogiiDev\Staging\tools.zip E:\MoogiiDev\Staging\tools -Force`. Staging-ийн DB administrator нууцыг prompt-гүй: `& $st rotate-db-password -Profile staging -Root $sr -Generate` (`.env.staging`-ийн `PILOT_DB_ADMIN_PASSWORD` хоосон = одоогийн `postgres`; шинэ нууцыг скрипт үүсгэж DB-д тохируулаад `.env.staging`-д хадгална, хэвлэхгүй). Staging-ийн `FILE_ENCRYPTION_KEY` — тусдаа шинэ түлхүүр: v0.2.3 нөөцөд шифрлэгдсэн хавсралт байхгүй (`core_attachments` v0.2.4-д шинэ).
2. **Staging restore:** §13в-ийн тусдаа staging profile-д пилотын backup-ийг сэргээ. Staging-ийн бусад нууц (DB, JWT, backup password) шинээр үүсгэ; v0.2.3 backup-д §1а-ийн дагуу тусдаа `FILE_ENCRYPTION_KEY` тохируулна. v0.2.4+ шифрлэгдсэн хавсралттай backup сэргээвэл уг backup-ийг үүсгэсэн түлхүүрийг secure сувгаар staging-д оруул. Snapshot A-г **одоогийн v0.2.3 DB-г шинэчлэхээс өмнө**, dev-ийн шинэ `camp:snapshot` хэрэгслээр ав:
   ```powershell
   cd E:\MoogiiDev\Dev\s-project
   pnpm camp:snapshot --env=E:\MoogiiDev\Staging\s-project\.env.staging --out=E:\MoogiiDev\Staging\a-v024.json
   ```
3. **Staging upgrade ба тулгалт:** `& $st upgrade -Tag v0.2.4.1 -Profile staging -Root $sr` ажиллуул. Шинэчлэлтээр `20261107006` legacy alias/хуулбар хүснэгтүүдийг устгаж, `20261110002` өмнөх Camp роль/хэрэглэгчийн эрхийг ижил хүрээтэй Core эрх рүү хуулна. Шинэчилсний дараа ижил CLI-гаар B авч, A-тай яг ижил огноо/мужийг `--like`-аар хадгалж, тулга:
   ```powershell
   cd E:\MoogiiDev\Dev\s-project
   pnpm camp:snapshot --env=E:\MoogiiDev\Staging\s-project\.env.staging --out=E:\MoogiiDev\Staging\b-v024.json --like=E:\MoogiiDev\Staging\a-v024.json
   pnpm camp:snapshot --compare E:\MoogiiDev\Staging\a-v024.json E:\MoogiiDev\Staging\b-v024.json
   ```
   `camp:snapshot/2` нь хоол/өрөө/тоо, эрх (Camp/Core хоёр хос grant-ийг ижил эрх гэж тулгана), A-д байсан module status, орчуулгын override-ийн hash-ийг шалгана (текстийг файлд хадгалахгүй). Migration-аар шинээр үүсэх module-ийн анхдагч мөрүүдийг тулгалтаас хасна; B дээр `core`, `hr`, `camp`, `feed` нь `ACTIVE`, debug/сонголтот модулиуд `SUSPENDED` болохыг тусад нь шалга. Зөрүү эсвэл hash өөрчлөлт гарвал pilot руу **шилжүүлэхгүй**.
3а. **Pilot-ийн бэлтгэл (ЗААВАЛ, pilot ажиллаж байх үед, эзэмшигч):** (1) pilot `.env`-д `FILE_ENCRYPTION_KEY=<openssl rand -base64 32>` нэмж, нөөцөөс тусад нь нууц үгийн менежерт хадгал (байхгүй бол түлхүүр `JWT_SECRET`-ээс гарч, JWT солиход хавсралт уншигдахгүй). (2) `.\deploy\pilot\pilot.ps1 rotate-db-password -Profile pilot -Yes` — `PILOT_DB_ADMIN_PASSWORD` (32+) байхгүй бол v0.2.4-ийн init Supabase асаахаас татгалзана. v0.2.3-ийн pilot скриптэд upgrade preflight байхгүй тул энэ алхмыг алгасвал upgrade pilot-ийг зогсоосны дараа унаж, систем унтарсан хэвээр үлдэнэ.
4. **Pilot D-6 gate:** шинэ backup + SHA256-г дахин баталгаажуул. Migration `20261107006`-г ажиллуулахын өмнө TC-v023-ийн **A04 эрхийн шалгалтыг** эрхийн жагсаалт/хэрэглэгчийн жишээн дээр гүйцэтгэж, хэн ч эрхээ алдаагүйг бүртгэ. Дараагийн `20261110002` migration ижил роль, хэрэглэгч, ажлын байрны хүрээтэй Core grant-ыг хуулна; upgrade-ийн дараа snapshot болон TC-v023-A04-өөр дахин тулгана. Энэ gate амжилтгүй эсвэл нотолгоо байхгүй бол зогсоно.
5. **Зөвшөөрөлтэй pilot upgrade:** зөвхөн staging A = B, D-6 gate, backup, owner зөвшөөрөл бүгд хангагдсан үед:
   ```powershell
   # ШИНЭ скриптээр (preflight: DB нууц + FILE_ENCRYPTION_KEY-ийг pilot-ийг зогсоохоос ӨМНӨ шалгана)
   $pt = 'E:\MoogiiDev\Staging\tools\deploy\pilot\pilot.ps1'
   & $pt upgrade -Tag v0.2.4.1 -Profile pilot -Root E:\MoogiiDev\Pilot\s-project
   cd E:\MoogiiDev\Pilot\s-project ; .\deploy\pilot\pilot.ps1 status
   ```
   Дараа нь health/smoke, TC-v023-ийн эрхийн шалгалт, TC-v024-ийг ажиллуул; шалгаагүй үр дүнг release-д ногоон гэж тэмдэглэхгүй.
6. **Rollback:** migration буцаах SQL байхгүй. Upgrade алдаа эсвэл өгөгдлийн зөрүү гарвал аппыг зогсоож, кодыг `v0.2.3` руу буцаагаад яг энэ шинэчлэлийн өмнөх backup-ийг сэргээ; дараа нь өмнөх хувилбарыг build/start хий. Restore-д DB + storage болон secure хадгалсан ижил `FILE_ENCRYPTION_KEY` заавал хамт байна:
   ```powershell
   .\deploy\pilot\pilot.ps1 stop
   git checkout v0.2.3
   .\deploy\pilot\pilot.ps1 restore E:\MoogiiDev\Pilot\backups\<энэ-шинэчлэлийн-өмнөх-нөөц>.7z
   .\deploy\pilot\pilot.ps1 build
   Start-ScheduledTask 'S-Project Pilot'
   ```

## 14. Хориотой

- Пилотын хавтсанд `pnpm supabase:start|stop|reset`, `pnpm dev`, `pnpm test*`, `pnpm dev:test-user`.
- Staging-ийн `.env.staging`-д пилотын порт (5532x, 56379, 3100, 8088) — `pilot.ps1` зогсооно; гараар ч бүү холбо.
- Пилотын хавтсанд tracked файлыг гараар засах (`upgrade` бохир tree-д эхлэхгүй).
- `supabase stop --no-backup` (**бүх өгөгдлийг устгана**), `supabase db reset` (restore-оос бусад үед).
- Studio-г байнга асаах, 55322/3100/55321-ийг router-ээр (port forward) нээх.
- `.env`, нөөц, нууц үгийг git / чат / имэйлээр дамжуулах.

## 15. Асуудал шийдэх

| Шинж | Шалтгаан / шийдэл |
|---|---|
| `[АЛДАА] ANON_KEY нь … demo нууцаар` | Supabase-ийг `.env`-гүй (гараар) асаасан → `pilot.ps1 stop -All` → `pilot.ps1 start` |
| `web build-ийн anon key … таарахгүй` | JWT нууц солигдсон → `pilot.ps1 build` → `start` |
| `backend эхэлсэнгүй` | `run\logs\backend.err.log`. Ихэвчлэн `.env` эсвэл DB (Docker асаагүй) |
| `Docker Desktop ажиллахгүй` | Docker Desktop-ийг нээнэ; `run` 15 мин хүлээнэ |
| Пилотын гадаад хаяг нээгдэхгүй | Cloudflare Tunnel service, `pilot.ps1 status` (Tunnel ба gateway health); Funnel-ийг асаахгүй |
| `/login` ↔ `/camp` төгсгөлгүй шилжинэ | v0.1.6.1-ээс өмнөх build (FE-007). Түр: сайтын өгөгдлийг устгах (🔒 → Site settings → Delete data) |
| Нэвтрэх → "Email logins are disabled" | `config.toml`-д `[auth.email] enable_signup = false` (OPS-003) → `true`; `pilot.ps1 stop -All` → `start` |
| Нэвтрэх → "Invalid login credentials" | Нууц үг буруу → `pilot.ps1 user … --reset-password` |
| Нэвтэрсэн ч 403 | Хэрэглэгч идэвхгүй, эсвэл өөр байгууллагын email |
| Олон удаа буруу нэвтэрсний дараа 429 | Supabase Auth хязгаар (5 мин) — Caddy-ийн ард бүх хүсэлт нэг IP тул байгууллагад хуваалцна; хүлээнэ |
| PowerShell-д кирилл `?` | Windows Terminal ашиглана; `pilot.ps1` UTF-8 BOM-той — засварлахдаа BOM-ийг хадгална |

## 16. Мэдэгдэж буй хязгаарлалт (пилот)

- Нэг машин: машин/интернэт унавал систем ажиллахгүй. Нөөц өдөрт 1 удаа → хамгийн ихдээ ~1 өдрийн өгөгдөл алдагдах эрсдэл.
- Web-д зөвхөн Кемп цэс (`PILOT_MODULES=camp`); бусад модулийн API эрхээр хамгаалагдсан хэвээр.
- Автомат escalation унтраалттай (`ESCALATION_CRON=off`) — алхам алгасах асуудал backlog-д.
- Хэрэглэгч/нууц үгийг зөвхөн админ скриптээр (UI-д "нууц үг мартсан" алга).
