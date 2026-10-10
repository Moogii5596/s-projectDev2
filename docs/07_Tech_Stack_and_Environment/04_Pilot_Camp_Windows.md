# 04 — Кемп пилот: нэг Windows машин дээр интернэтэд нээх (v0.1.6)

> Үүсгэсэн: 2026-10-10 (v0.1.6) | Байгууллага: **Sino Hydro** (`sinohydro`) | Модуль: **Кемп**
> Холбоотой: `deploy/pilot/` (скрипт, тохиргоо), `02_Local_Supabase_Docker_Windows.md` (dev орчин),
> `03_Enterprise_VPC_Deployment.md` (бүрэн VPC), `docs/lessons_learned.md` §20

Пилот нь **хувийн мэдээлэлтэй** бодит өгөгдөлтэй ажиллана. Доорх аюулгүй байдлын алхмуудыг алгасахгүй.

---

## 0. Бүтэц

```
Хэрэглэгчийн утас/компьютер
   │  https://<машин>.<tailnet>.ts.net   (Tailscale Funnel — HTTPS сертификат автомат, домэйнгүй)
   ▼
Tailscale (энэ машин) ──► 127.0.0.1:8088  Caddy (deploy/pilot/Caddyfile)
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
- Интернэтэд **зөвхөн Caddy** (Funnel → 127.0.0.1:8088). DB (55322), Supabase API (55321), backend (3100), Redis — гаднаас хаалттай (Firewall §6).
- Supabase-ийн **өөрийн JWT нууц** (`SUPABASE_AUTH_JWT_SECRET`). Local Supabase-ийн demo нууц олон нийтэд ил — түүгээр хэн ч service key үүсгэж чадна. `pilot.ps1` demo нууцыг илрүүлбэл асахгүй.
- **Нээлттэй бүртгэл хаалттай** (`enable_signup = false` + Caddy `/auth/v1/signup` 404). Хэрэглэгчийг зөвхөн `pilot.ps1 onboard|user`.
- Апп `app_user` (RLS)-ээр, нууц үг нь анхдагч биш. `NODE_ENV=production`, `DEPLOYMENT_MODE=dedicated`.
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
| `PILOT_BACKUP_DIR` | боломжтой бол өөр диск / OneDrive-ийн хавтас |

```powershell
.\deploy\pilot\pilot.ps1 check
```
`[OK] .env зөв` гарах ёстой. (Script ажиллахгүй бол: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.)

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
Гаднаас (LAN, Tailscale-ийн бусад төхөөрөмж) хаагдах TCP: 3000, 3100, 5173, 5174, 6379, 8088, 54320–54329, 55320–55329, 56379.
Энэ машин дээрээс (localhost) болон Funnel-ээр ажиллахад нөлөөлөхгүй. Dev-ийг өөр төхөөрөмжөөс (утаснаас :5173) нээх боломжгүй болно.

> Supabase-ийн DB (`postgres`/`supabase_admin`) нууц үг нь local-ийн анхдагч `postgres` хэвээр — тиймээс энэ дүрэм **заавал**.

## 7. Интернэтэд нээх — Tailscale Funnel

1. Tailscale-ийг нээж нэвтэрнэ (Google/Microsoft/GitHub бүртгэлээр, үнэгүй).
2. https://login.tailscale.com/admin/dns → **MagicDNS** ба **HTTPS Certificates** → Enable.
3. PowerShell:
   ```powershell
   tailscale funnel --bg 8088
   ```
   Анх удаа Funnel-ийг идэвхжүүлэх холбоос гарвал нээж зөвшөөрнө, дахин ажиллуулна. Гаралт:
   `Available on the internet: https://<машин>.<tailnet>.ts.net/` → **энэ бол пилотын хаяг**.
4. `tailscale funnel status` — тохиргоо. Хаах: `tailscale funnel reset`.

Funnel-ийн тохиргоо Tailscale-д хадгалагдана (дахин асаахад сэргэнэ). Нөөц хувилбар (Tailscale ажиллахгүй үед, түр): `cloudflared tunnel --url http://127.0.0.1:8088` (хаяг дахин асаах бүрт өөрчлөгдөнө).

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

## 11. Өдөр тутам

| Команд | Юу |
|---|---|
| `pilot.ps1 status` | Процесс, health, контейнер, Funnel, сүүлийн нөөц |
| `pilot.ps1 stop` | backend + Caddy (+watchdog) зогсооно. Дахин: `Start-ScheduledTask 'S-Project Pilot'` |
| `pilot.ps1 stop -All` | + Supabase, Redis (өгөгдөл **хадгалагдана**) |
| `pilot.ps1 backup` | Гараар нөөц авах |

Лог: `deploy\pilot\run\logs\` — `backend.log`, `backend.err.log`, `caddy-access.log`, `pilot.log`, `backup.log`.

## 12. Нөөц ба сэргээлт

- Агуулга: `public` schema-ийн бүх өгөгдөл + `auth.users`, `auth.identities` (нэвтрэх эрх, нууц үгийн hash) + migration жагсаалт + manifest. Schema нь кодын migration-оос.
- Файл: `PILOT_BACKUP_DIR\sinohydro-YYYYMMDD-HHMMSS.7z`, `PILOT_BACKUP_KEEP_DAYS` (14) хоногоос хуучныг устгана.
- **7 хоногт нэг удаа** нөөцийг өөр төхөөрөмж рүү (USB / OneDrive) хуулна.

Сэргээх (**одоогийн өгөгдөл устна** — slug бичиж баталгаажуулна):
```powershell
.\deploy\pilot\pilot.ps1 restore E:\MoogiiDev\Pilot\backups\sinohydro-20261011-020000.7z
Start-ScheduledTask 'S-Project Pilot'
```
Нөөц ба кодын migration ижил байх ёстой (өөр бол сэргээхгүй, юу ч устгахгүй) — нөөцийг үүсгэсэн tag-ийг checkout хийж сэргээнэ.
Сэргээсний дараа хэрэглэгчид дахин нэвтэрнэ. **Пилотын эхний долоо хоногт нэг удаа сэргээлтийн дадлага** хийнэ (backup → restore → нэвтэрч шалгах).

## 13. Шинэ хувилбар суулгах

```powershell
.\deploy\pilot\pilot.ps1 backup
.\deploy\pilot\pilot.ps1 stop
git fetch --tags
git checkout v0.1.x
.\deploy\pilot\pilot.ps1 init     # шинэ migration
.\deploy\pilot\pilot.ps1 build
Start-ScheduledTask 'S-Project Pilot'
```

## 14. Хориотой

- Пилотын хавтсанд `pnpm supabase:start|stop|reset`, `pnpm dev`, `pnpm test*`, `pnpm dev:test-user`.
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
| Funnel хаяг нээгдэхгүй | `tailscale status` (нэвтэрсэн?), `tailscale funnel status`, `pilot.ps1 status` (gateway health) |
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
