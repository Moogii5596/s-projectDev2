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

## Одоогийн Хувилбарын Зураглал

| SemVer | Хуучин нэр | Тайлбар | Tier | Төлөв |
|---|---|---|---|---|
| **v0.1.0** | MVP + v1.0 | Core System — Tier 1 Production Ready | Tier 1 | ✅ ДУУССАН |
| **v0.1.5** | v1.5 | Enterprise VPC — RLS + dedicated deploy (ADR-001) | Tier 2 | ✅ 2026-10-10 |
| **v0.1.6** | — | Кемп пилот (Sino Hydro, нэг машин) — v0.1-ийн сүүлийн хувилбар (`v0.1.6.1`) | dedicated | ✅ 2026-10-10 |
| **v0.2.0** | — | Пилотын үр дүн + Кемп V2 + техникийн өр | Tier 1–2 | 📝 УРЬДЧИЛСАН |
| **v0.3.0** | — | Байгууллагын дотоод Feed (PRD-05) | Tier 1–2 | 📝 УРЬДЧИЛСАН |
| **v0.4.0+** | v2.0 | Чат · Air-Gapped / Offline-First (хэрэгтэй эсэх шийдэгдээгүй) · нэмэлт | — | 📋 ИРЭЭДҮЙ |
| **v1.0.0** | Production | Олон нийтэд гаргах | All | 🎯 ЗОРИЛГО |

---

## Хувилбар Тэмдэглэгдэх Дүрэм

```
v<MAJOR>.<MINOR>.<PATCH>[-<pre-release>][+<build>]

Жишээ:
  v0.1.0          — Stable pre-production release
  v0.1.5          — Enterprise feature release
  v0.1.7          — v0.1-ийн hotfix (release/v0.1 салбар; v0.1.6.1 нь SemVer-ээс гадуурх онцгой тохиолдол)
  v0.2.0          — Пилот + Кемп V2 release
  v0.3.0          — Air-gapped feature release
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

## CHANGELOG.md холбоос

Хувилбар бүрийн дэлгэрэнгүй өөрчлөлтийг [CHANGELOG.md](./CHANGELOG.md)-аас харна уу.
