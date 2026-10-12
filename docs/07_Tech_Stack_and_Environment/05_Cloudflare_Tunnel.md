# Байгууллага холбох — Cloudflare Tunnel (`<байгууллага>.gobiverse.website`)

> v0.2.2 Блок 2.5 · ADR-005 · 2026-10-12. Эхний жишээ: **Sino Hydro** — `sino.gobiverse.website` → таны Windows компьютер (`desktop-13n3elv`).
> Нэг удаа: §1–§2 (домэйн Cloudflare руу). Байгууллага бүрт: §3–§5.

## 0. Нууцлал (заавал)
- Tunnel-ийн **токен = нууц** (тухайн машиныг таны домэйнд холбох түлхүүр). Зөвхөн `cloudflared` service-д. Чат, git, `.env.example`, дэлгэцийн зурагт бүү оруул. Задарсан гэж сэжиглэвэл: Cloudflare → tunnel → токеныг шинэчлэх (refresh) → service-ийг шинэ токеноор дахин суулгах.
- TLS Cloudflare дээр тайлагдана (ADR-005 §3) — байгууллагад урьдчилж хэлнэ.

## 1. `gobiverse.website`-ийг Cloudflare-д нэмэх (нэг удаа)
1. **Одоогийн DNS-ийг тэмдэглэ:** Spaceship → `gobiverse.website` → DNS — бүх бичлэгийг (A, CNAME, **MX**, TXT) дэлгэцээр авч хадгал. Имэйл (MX) байвал §1.4-т заавал шалгана.
2. https://dash.cloudflare.com → бүртгэл (Free) → **Add a domain / Onboard a domain** → `gobiverse.website` → **Free** план.
3. Cloudflare одоогийн бичлэгүүдийг импортлоно → §1.1-ийн жагсаалттай тулга. **`sino` CNAME (→ `…ts.net`)-ийг УСТГА** (дараа нь tunnel өөрөө үүсгэнэ; байвал tunnel-ийн hostname нэмэхэд алдаа өгнө).
4. MX / TXT (SPF, DKIM) байвал — ижил утгатай, **DNS only (саарал үүл)** байгааг шалга (имэйл proxy-гоор явахгүй).

## 2. Nameserver-ийг Cloudflare болгох (нэг удаа)
1. Cloudflare-ийн өгсөн 2 nameserver-ийг хуул (`…ns.cloudflare.com`).
2. Spaceship → `gobiverse.website` → **Nameservers** → Custom → Cloudflare-ийн 2-ыг тавь (`launch1/2.spaceship.net`-ийг соль) → хадгал.
3. Cloudflare-д домэйн **Active** болтол хүлээ (хэдэн минутаас 24 цаг). Энэ хооронд ts.net хаяг хэвийн ажиллана.
4. Cloudflare → **SSL/TLS → Edge Certificates:** Always Use HTTPS = **On**, Minimum TLS = **1.2**.
5. **Speed / Optimization:** Rocket Loader = **Off** (апп-ын JS-ийг эвдэж болно). Auto Minify гэсэн сонголт байвал Off.
6. **Caching → Cache Rules:** нэг дүрэм — URI Path starts with `/api/` **эсвэл** `/auth/` → **Bypass cache**. (`/assets/*` hash-тай тул кэшлэгдэх нь зөв.)

## 3. Tunnel үүсгэх (байгууллага бүрт)
1. Cloudflare → **Zero Trust** (анх удаа бол Free plan сонгоно) → **Networks → Tunnels** (зарим дэлгэцэд *Access → Tunnels*) → **Create a tunnel** → **Cloudflared**.
2. Нэр: `<байгууллага>-<орчин>` (жнь `sino-pilot`).
3. Орчин: **Windows** → Cloudflare-ийн харуулсан **суулгах командыг** хуул (`cloudflared.exe service install <токен>` хэлбэртэй).
4. Тухайн компьютер дээр **PowerShell (Administrator)**:
   - `cloudflared` суулгах: `winget install --id Cloudflare.cloudflared` (эсвэл Cloudflare-ийн албан ёсны MSI).
   - Шинэ PowerShell цонх (Administrator) → §3.3-ийн командыг ажиллуул.
   - Шалгах: `Get-Service cloudflared` → **Running**.
5. Cloudflare дээр tunnel **Healthy** болно.

## 4. Хаяг холбох (Public Hostname)
1. Tunnel → **Public Hostname** (эсвэл *Published application routes*) → **Add**:
   - Subdomain: `sino` · Domain: `gobiverse.website` · Path: (хоосон)
   - Service: **HTTP** · URL: `127.0.0.1:8088` (пилотын Caddy; staging бол түүний порт)
2. Хадгал → Cloudflare `sino` DNS бичлэгийг автоматаар (proxied) үүсгэнэ.
3. Нэрлэх дүрэм (ADR-005 §2.1): `<байгууллага>` эсвэл `<байгууллага>-<орчин>`. **`staging.sino.…` хэлбэр хориотой** (үнэгүй сертификат хамрахгүй).

## 5. Тохиргоо ба шалгалт
1. Пилотын `.env`: `PUBLIC_APP_URL=https://sino.gobiverse.website` (`.env.pilot.example`). `pilot.ps1 status` → "Cloudflare Tunnel … ажиллаж байна", "нийтийн хаяг".
2. Caddyfile (`CF-Connecting-IP`) — **v0.2.2-ийн upgrade-тай хамт** ирнэ. Түүнээс өмнө tunnel ажиллана (зөвхөн логт харагдах IP нарийвчлал өөр).
3. **Шалгах жагсаалт** (утаснаас, WiFi-гүй — мобайл датаар):
   - [ ] `https://sino.gobiverse.website` нээгдэнэ, цоож (хүчинтэй сертификат)
   - [ ] Нэвтрэх (имэйл; v0.2.2-оос утас/username) → хуудас хооронд шилжих, 1 цагийн дараа session шинэчлэгдсэн
   - [ ] Excel импорт (хамгийн том бодит файл) — 100 сек дотор дуусна
   - [ ] (v0.2.2) буруу нууц үг 5 удаа → "Олон удаа оролдсон" (түгжээ)
   - [ ] ts.net хаяг ч зэрэг ажиллаж байна (шилжилт)
4. Пилотын хэрэглэгчдэд шинэ хаягийг мэдэгдэх (утасны home screen shortcut-ийг шинэчлэх).

## 6. Funnel-ийг хаах (~1 долоо хоногийн дараа)
Шалгах жагсаалт бүгд ✅, хэрэглэгчид шинэ хаягаар орж байгаа бол:
```powershell
tailscale funnel reset
tailscale funnel status   # "No serve config" гэх мэт
```
Шалтгаан: Funnel нээлттэй байхад түүгээр ирсэн хүсэлт `CF-Connecting-IP`-г хуурамчаар тавьж IP хязгаараас зайлсхийж болно (ADR-005 §2.3). Tailscale өөрөө (таны алсын удирдлага) хэвээр.

## 7. Буцаах / асуудал
| Шинж | Арга |
|---|---|
| Tunnel унасан (`cloudflared` Stopped) | `Start-Service cloudflared`; Event Viewer → Application → cloudflared |
| 502 / 1033 (Cloudflare алдаа) | Пилот ажиллаж байна уу: `pilot.ps1 status` (gateway health 127.0.0.1:8088) |
| Сертификатын алдаа | Хоёр түвшний дэд домэйн ашигласан уу (§4.3); домэйн Active уу (§2.3) |
| Яаралтай буцаах | ts.net хаяг (Funnel хаагаагүй бол); хаасан бол `tailscale funnel --bg 8088` |
| Токен задарсан | §0 — шинэчилж service-ийг дахин суулгах |

## 8. Шинэ байгууллага нэмэх (давтагдах)
Төрлөө сонго (ADR-005 §2.2) → 1 / 2: §3–§5 (тэдний машин дээр tunnel; токеныг тэдний админд аюулгүй сувгаар) · 3: манай серверийн tunnel-д hostname нэмэх (дэд домэйн = tenant slug) · 4: Cloudflare хэрэггүй (дотоод DNS).
