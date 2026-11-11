---
title: "ADR-011 — Үүлэн хостинг (Supabase Cloud + Render + Vercel + R2)"
type: "Architecture"
status: "Active"
last_updated: 2026-11-11
tags: [adr, hosting, pilot, deploy, backup, v0.2.5]
---

# ADR-011 — Үүлэн хостинг (Supabase Cloud + Render + Vercel + R2)

> 2026-11-11 · Төлөв: **✅ Батлагдсан (хэрэглэгч)** · [[ADR-002_Hosting]]-ийг орлоно (§3 «шилжих нөхцөл»-ийн 3-р заалт: пилотын PC тасралтгүй ажиллах боломжгүй болсон)
> Хэрэгжүүлэлт: [[13_v0.2.5_tech_plan]] · Холбоотой: [[ADR-001_Tenant_Isolation]] · [[ADR-005_Org_Connectivity_Domains]] · [[ADR-003_Users_Login_Permissions]]

## 1. Нөхцөл
- Пилотын хост (ажлын PC) **2026-11-18-нд бүрмөсөн унтарна**; хэрэглэгч урт хугацааны чөлөөтэй, гэрт тогтвортой интернэт байхгүй → локал сервер боломжгүй.
- Пилотод Sino Hydro-ийн бодит өгөгдөл (PII) орсон боловч байгууллага одоогоор **идэвхтэй ашиглаагүй** → сервер байнга асаалттай байх шаардлагагүй, cold start (30–60 с) зөвшөөрөгдөнө.
- Сарын төсөв ≈ 0. Хэмжилт (2026-11-11): пилот DB 22 MB, staging DB 8 MB, файл ≈ 0 (Storage ашиглаагүй), NestJS RAM 81 MB.
- Харьцуулсан (2026-11-11): Монголын VPS (cloud.mn, datacom, itpartner, bowsys, itools, servers.mn) 8 GB ≈ 200–440 мянган ₮/сар; Contabo SG ≈ €6.8; Supabase Pro $25 — төсөвт багтахгүй эсвэл одоогийн ачаалалд хэт их.

## 2. Шийдвэр

| Орчин | DB + Auth | Backend (NestJS) | Frontend | Redis | Файл |
|---|---|---|---|---|---|
| **dev** | Локал Docker Supabase (хэвээр) | локал | локал | локал | локал диск |
| **staging** | Supabase Cloud Free — төсөл 1 | Render Free — service 1 | Vercel preview (`staging` branch) | Upstash Free | R2 `s-project-staging` |
| **pilot** | Supabase Cloud Free — төсөл 2 | Render Free — service 2 | Vercel production (`main`) | Upstash Free | R2 `s-project-pilot` |

- **Region:** Supabase — Зүүн хойд Ази (Сөүл / Токио); Render — Сингапур.
- **Домэйн:** `sino.gobiverse.website` → Vercel (Cloudflare DNS); API → Render; файл → R2 custom domain. Cloudflare Tunnel / Caddy пилотод хэрэглэхээ болино.
- **Schema:** зөвхөн `supabase/migrations/` → `supabase db push` (cloud дээр гараар өөрчлөхгүй).
- **Файл:** `StorageService`-ийн шинэ `R2Storage` adapter (S3 API); `LocalDiskStorage` dev-д хэвээр. Driver орчны хувьсагчаар.
- **Brute-force хамгаалалт:** Supabase-ийн `password_verification_attempt` hook зөвхөн Team/Enterprise төлөвлөгөөнд → **NestJS sign-in урсгалд бүртгэл тус бүрээр түгжинэ** (одоогийн дүрэм: 15 мин-д 5 буруу → 15 мин түгжээ), `auth_guard.password_failures` хүснэгтийг дахин ашиглана. Нэвтрэлт аль хэдийн `POST /api/v1/auth/login`-оор дамждаг.
- **Нөөц:** GitHub Actions (өдөр бүр) → хоёр төслийн `pg_dump` (public + auth) + R2 хуулбар → **шифрлэж** (`age`) → `rclone` → хэрэглэгчийн Google Drive (`s-project-backups/`), 30 хоног хадгална; сард нэг удаа restore туршилт. Энэ ажил DB-д холбогддог тул Free төслийн 7 хоногийн идэвхгүй зогсолтоос хамгаална.
- **Нууц:** Render / Vercel / GitHub Secrets-д; `.env`-д зөвхөн dev. Баримт, git, чатад утга орохгүй.
- **Deploy урсгал:** schema = migration-аас автомат; `main` merge → staging автомат; tag → GitHub Environment `production` (PO батална) → нөөц → migration → deploy → health. Өгөгдөл зөвхөн production → staging; dev-ээс хэзээ ч үгүй ([[10_Agent_Team_Workflow]]).
- **Хяналт:** Sentry (PII-гүй), JSON лог, гаднын uptime monitor `/health`.
- **Нэр:** «pilot» орчныг цаашид **production** гэнэ (Sino Hydro = пилот хөтөлбөр).

## 3. Мэдэгдэж буй хязгаар ба эрсдэл
- **Render Free:** 15 мин идэвхгүй → унтана; workspace-д нийт 750 цаг/сар. Унтсан үед cron (outbox poller, approval SLA, мэдэгдлийн имэйл) ажиллахгүй → сэрэхэд нөхөж ажиллана; имэйл мэдэгдэл хоцорч болно.
- **Supabase Free:** 500 MB DB, нөөц байхгүй (→ өөрийн нөөц), 2 төсөл.
- **GoTrue шууд дуудлага:** frontend anon key-тэй тул `/auth/v1/token`-ийг NestJS-ийг тойрч дуудах боломжтой. Cloud-ийн GoTrue IP хязгаар ажиллана; нэмэлтээр Cloudflare Turnstile (CAPTCHA) шаардлагатай эсэхийг [[13_v0.2.5_tech_plan]] H2-т шалгана.
- **Өгөгдлийн байршил:** пилотын PII Монголоос гадна (Солонгос/Япон) хадгалагдана — Sino-д мэдэгдэх.
- **Staging-д бодит PII:** PO шийдвэрээр (2026-11-11) нууцлахгүй; хандалт зөвхөн багт. v0.3-д дахин үнэлнэ.

## 4. Дахин үнэлэх нөхцөл
Дараахын аль нэг үүсвэл пилотын **backend**-ийг байнгын VPS (cloud.mn / datacom ≈ 2 GB) руу, шаардлагатай бол DB-г Supabase Pro руу шилжүүлэх ADR гаргана: байгууллага өдөр тутам ашиглаж эхлэх · cold start хэрэглэгчийн гомдол · DB > 350 MB эсвэл файл > 7 GB · 750 цагийн хязгаар хүрэх · байгууллага өгөгдлийг Монголд байлгахыг шаардах.
