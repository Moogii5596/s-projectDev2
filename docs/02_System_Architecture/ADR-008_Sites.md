---
title: "ADR-008 — Ажлын байр (site)"
type: "Architecture"
status: "Active"
last_updated: 2026-11-07
tags: [core, sites, v0.2.4]
---

# ADR-008 — Ажлын байр (site)

## Шийдвэр

- Цөмийн `core_sites` хүснэгт tenant бүрийн ажлын байрыг `type`, `code`, `name`, `is_active`-аар бүртгэнэ. Одоогийн төрлүүд: `CAMP`, `OFFICE`, `MINE`, `OTHER`.
- Кемп нь ажлын байрны нэг төрөл. Шилжилтийн migration одоогийн кемп бүрт `CAMP` site үүсгэж, `camps.site_id`-аар tenant-scoped FK холбоно; одоо байгаа кемпийн өгөгдөл устгахгүй. Дараагийн кемпийн үүсгэлт/засвар site-тэй синхрон байна.
- Site API-г зөвхөн tenant-ийн `OWNER` / `ADMIN` удирдаж, өөрчлөлт бүрийг audit хийнэ. Устгах үйлдэл нь мөр устгахгүй, идэвхгүй болгоно.
- v0.2.4-д RBAC-ийн `core_user_permissions.site_id` хэвээр `camps.id`-г заана (`core_user_roles` мөн хуучин site ID-г хэрэглэнэ). Эрхийн олголтын FK ба өгөгдлийг `core_sites.id` рүү шилжүүлэх ажлыг v0.2.5-д хийнэ; энэ migration-д RBAC-ийн багануудыг өөрчлөхгүй.
