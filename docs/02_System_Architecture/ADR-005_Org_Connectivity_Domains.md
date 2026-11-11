---
title: "ADR-005 — Байгууллагын холболт ба домэйн (`*.gobiverse.website`)"
type: "Architecture"
status: "Active"
last_updated: 2026-11-10
tags: [deploy]
---

# ADR-005 — Байгууллагын холболт ба домэйн (`*.gobiverse.website`)

> 2026-10-12 · Төлөв: **✅ Батлагдсан** · v0.2.2 Блок 2.5 (tech plan §10, D-14) · Холбоотой: ADR-001 (tenant isolation, dedicated), ADR-003 (нэвтрэлт, D-10)

## 1. Нөхцөл
- `gobiverse.website` дээр олон байгууллага холбогдоно. Sino Hydro (`sino`) — эхнийх.
- Байгууллагууд өөр өөрөөр байрлана: өөрийн дотоод сүлжээнд (сервер/PC), өөрийн VM / cloud-д, эсвэл манай нийтийн серверт; заримд нь интернэт огт байхгүй.
- Tailscale Funnel нь өөрийн домэйныг дэмждэггүй (зөвхөн `*.ts.net` сертификат; tailscale/tailscale #11563, #16478) → CNAME дангаараа TLS алдаа.
- Oracle Cloud (Always Free) — "Out of Capacity" (2026-10-12) → урд талын VM proxy одоохондоо боломжгүй.

## 2. Шийдвэр
### 2.1 Нэг домэйн, байгууллага бүр дэд домэйн
- `gobiverse.website`-ийн DNS = **Cloudflare** (Free). Байгууллага бүр `<байгууллага>.gobiverse.website`.
- **Нэрлэх дүрэм:** `<байгууллага>` (production), `<байгууллага>-<орчин>` (`sino-staging`). **Хоёр түвшин (`staging.sino.…`) хориотой** — Cloudflare-ийн үнэгүй Universal SSL зөвхөн root ба 1-р түвшний дэд домэйныг хамардаг.
- Дэд домэйн ≠ tenant slug байж болно (Sino: `sino` ↔ slug `sinohydro`): **dedicated** горимд tenant = `.env` `DEDICATED_TENANT_SLUG` (домэйноос үл хамаарна). **shared** горимд tenant = дэд домэйны эхний хэсэг (`resolveTenantSlug`) → shared-д байрлах байгууллагын дэд домэйн = slug.

### 2.2 Холболтын төрөл (байрлалаас хамаарна)
| Төрөл | Систем хаана | Холболт | Tenant |
|---|---|---|---|
| **1. Дотоод сүлжээ, интернэт гарцтай** | Байгууллагын сервер / PC | Тэр машин дээр **тусдаа Cloudflare Tunnel** (`cloudflared` service; гарах холболт, порт нээхгүй) → Caddy `127.0.0.1:8088` | dedicated |
| **2. Тэдний VM / cloud** (Enterprise VPC) | Тэдний VM | Тусдаа Cloudflare Tunnel (эсвэл тэдний TLS-тэй шууд A бичлэг) | dedicated |
| **3. Манай нийтийн сервер** | Бидний сервер (олон tenant) | Нэг tunnel, олон дэд домэйн | shared (дэд домэйн = slug) |
| **4. Бүрэн дотоод (air-gapped, v0.4+?)** | Интернэтгүй сүлжээ | Нийтийн холболтгүй; дотоод DNS + дотоод сертификат | dedicated |
| **5. Өөрийн домэйнтэй** | 1–3 | Тусгай тохиргоо (хэрэгцээ гарвал судална) | — |

- Нэг Cloudflare бүртгэлд олон tunnel — байгууллага бүр бие даасан (нэг нь унтарвал бусдад нөлөөгүй).
- Шилжилтийн үед Tailscale Funnel (`*.ts.net`) нөөц хаяг байсан — **2026-10-13 хаасан** (`sino.gobiverse.website` Cloudflare Tunnel-ээр ажиллаж байна).

### 2.3 Бодит IP ба хамгаалалт
- Пилотын Caddy: `trusted_proxies 127.0.0.1/::1`, `client_ip_headers CF-Connecting-IP X-Forwarded-For` → `/api/*`-д `X-Real-IP {client_ip}` → backend sign-in хязгаар (D-10, SEC-007/008). `CF-Connecting-IP`-г Cloudflare дарж бичдэг (хэрэглэгч хуурамчаар тавьж чадахгүй). Funnel нээлттэй үед Funnel-аар ирсэн хүн уг header-ийг хуурамчаар тавьж IP хязгаараас зайлсхийж болно (нэвтрэх нэрийн хязгаар + GoTrue түгжээ хэвээр) → Funnel-ийг хаах.
- **Cookie:** `.gobiverse.website` түвшинд cookie ХЭЗЭЭ Ч тавихгүй (байгууллага хооронд session холилдохгүй). Session = браузерын localStorage, домэйн тус бүр.
- Tunnel-ийн токен = нууц (`cloudflared` service-д л); чат / git / `.env.example`-д бичихгүй.

### 2.4 Үндсэн домэйн `gobiverse.website` — нүүр хуудас (2026-10-13)
- Үндсэн хаяг (apex) = S Project-ийн танилцуулга хуудас ([[PRD-06_Vision_Business_Model]] §7), байгууллагын систем **биш**.
- Байршуулалт: GitHub repo → **Vercel** (static) → Cloudflare DNS (apex / `www` → Vercel). Байгууллагын дэд домэйнууд (§2.1) tunnel-ээрээ хэвээр.
- Нүүр хуудас ямар ч байгууллагын өгөгдөл, API-д холбогдохгүй; `.gobiverse.website` cookie дүрэм (§2.3) хамаарна.

> Tenant хооронд өгөгдөл солилцох (B2B, катеринг ↔ захиалагч) → [[ADR-010_Tenant_Links]].

## 3. Үр дагавар
- (+) VM, нээлттэй порт, сертификат удирдлага хэрэггүй; байгууллага нэмэх = давтагдах алхам ([[05_Cloudflare_Tunnel]]).
- (−) **TLS Cloudflare дээр тайлагдана** — 1–3-т өгөгдөл Cloudflare-аар дамжина. Байгууллага "3-р талаар дамжих ёсгүй" гэвэл: 4-р төрөл, эсвэл тэдний VM дээр өөрийн TLS (2-р төрлийн шууд хувилбар).
- (−) Cloudflare-ийн хязгаар (Free): хүсэлтийн хугацаа ~100 сек, upload-ийн хэмжээ — том Excel импорт staging-д шалгана.
- Oracle VM (урд талын proxy) — v0.2.4 PIL-06 хостингийн шийдвэрт дахин авч үзнэ.
