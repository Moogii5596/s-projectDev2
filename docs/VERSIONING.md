---
title: "Хувилбаржуулалтын Бодлого (Versioning Policy)"
type: "Guide"
status: "Active"
last_updated: 2026-11-11
tags: [release]
---

# Хувилбаржуулалтын Бодлого (Versioning Policy)

## Стандарт: SemVer 2.0.0

Энэ төсөл [Semantic Versioning 2.0.0](https://semver.org/) стандартыг баримтална.

```
MAJOR.MINOR.PATCH
```

| Талбар | Утга |
|---|---|
| **MAJOR** | 0 = pre-production; 1+ = public production release |
| **MINOR** | Шинэ functionality (backward-compatible) |
| **PATCH** | Bug fix, бага сайжруулалт |

---

## Pre-Production vs Production

| Хувилбар | Утга |
|---|---|
| **v0.x.x** | Pre-production — хөгжүүлэлт, туршилт, internal ашиглалт |
| **v1.0.0** | Олон нийтэд гаргах (Public Production Launch) |
| **v1.x.x** | Production дээрх feature update |

> **Тэмдэглэл:** v0.x.x → v1.0.0 шилжилт нь "breaking change" биш — энэ бол бизнесийн шийдвэр: "public release бэлэн болсон" гэсэн утгатай.

---

## Хувилбарын жагсаалт

Хувилбар бүрийн агуулга, төлөв, огноо → **[[01_Development_Roadmap]] §1** (ганц эх сурвалж). Энд зөвхөн дугаарлалтын бодлого.

| Хуучин нэр (2026-09) | SemVer |
|---|---|
| MVP + v1.0 | `v0.1.0` |
| v1.5 | `v0.1.5` |
| v2.0 (Air-Gapped) | `v0.4.0+` (2026-10-11-нээс) |
| Production | `v1.0.0` |

---

## Хувилбар Тэмдэглэгдэх Дүрэм

```
v<MAJOR>.<MINOR>.<PATCH>[-<pre-release>][+<build>]

Жишээ:
  v0.1.0          — Stable pre-production release
  v0.1.5          — Enterprise feature release
  v0.1.7          — v0.1-ийн hotfix (release/v0.1 салбар; v0.1.6.1 нь SemVer-ээс гадуурх онцгой тохиолдол)
  v0.2.2          — Хувилбарын дэд дугаар (v0.2.x дотор feature release)
  v0.3.0          — Шинэ томоохон боломж (дотоод Feed)
  v1.0.0          — Public production launch
  v0.1.5-alpha.1  — Alpha тест
  v0.1.5-rc.1     — Release candidate
```

---

## Git Tag дүрэм

```bash
# Шинэ хувилбар тэмдэглэх
git tag -a v0.1.5 -m "v0.1.5: Enterprise VPC release"
git push origin v0.1.5

# Tag жагсаалт
git tag -l "v*" --sort=-v:refname
```

---

## Release-ийн дүрэм (2026-11-11, PO батласан)

| Үе | Tag | Хаана |
|---|---|---|
| Staging-д шалгах | `v0.2.5-rc.1`, `v0.2.5-rc.2` … | staging (автомат deploy `main`-аас) |
| Production-д гаргах | `v0.2.5` | production (PO «Deploy production» workflow-г гараар ажиллуулна) |
| Production-ийн яаралтай засвар | `v0.2.5.1`, `v0.2.5.2` … | `hotfix/<version>` → PR → staging smoke → PO → production → `main`-д буцааж merge |

- v0.2.x-д PATCH талбарыг feature хувилбарт хэрэглэдэг тул яаралтай засварт **4 оронтой tag** — SemVer-ээс гадуурх **албан ёсны үл хамаарал** (v1.0.0-оос стандарт SemVer).
- Tag зөвхөн `main`-аас (hotfix — hotfix branch-аас), release workflow-оор. Staging-д олдсон алдаа = шинэ `rc`, production-ийн дугаар биш.
- Өмнөх `v0.2.4.1`…`v0.2.4.5` (staging-ийн засварт хэрэглэсэн) — цаашид `rc` болно.

## CHANGELOG.md холбоос

Хувилбар бүрийн дэлгэрэнгүй өөрчлөлтийг [[CHANGELOG]]-аас харна уу.
