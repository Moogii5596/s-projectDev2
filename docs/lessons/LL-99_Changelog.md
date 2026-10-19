---
title: "Lessons — бүртгэлийн түүх"
type: "Log"
status: "Active"
last_updated: 2026-10-17
tags: [lessons, changelog]
---

# Lessons — бүртгэлийн түүх

> Индекс: [[lessons_learned]].

## Changelog (2026-09-20 → )

| Огноо | Нэмэгдсэн зүйл |
|-------|----------------|
| 2026-10-19 | v0.2.3 Блок F: TEST-030 (глобал «Санал илгээх» товч ↔ e2e regex `/илгээх/`), OPS-012 (cloud Prisma engine — wasm shim) |
| 2026-10-18 | TEST-028 (CI integration хуучирсан хүлээлт — camp-master, route-probe) |
| 2026-10-18 | TEST-027 (devAdmin-ийн хэл — modules-lite хятад шошго) |
| 2026-10-18 | v0.2.2 Блок 6б: PROC-020 (e2e нөлөөг дутуу хайсан — 3 тест) |
| 2026-10-19 | v0.2.3 Блок D (өгөгдөл импорт): OPS-010 (docker нэрийн шүүлтүүр пилотыг барьсан), OPS-011 (snapshot --like кемпгүй байгууллага), TEST-029 (created_at ижил мөрийн дараалал), DATA-002 (байгууллагын Excel → хөрвүүлэх скрипт + тайлан) |
| 2026-10-17 | v0.2.2 Блок 6б (анализ): SEC-009 (Кемп админ → OWNER урилга), AUTH-004 (идэвхгүй хэрэглэгчийн cache), SEC-010 (токен лог), AUTH-005, RBAC-001 |
| 2026-10-17 | v0.2.2 Блок 6: FE-010 (lazy хуудаснаас import), PROC-019 (хувилбарын дугаар), PROC-008 давтагдсан (3, 4) |
| 2026-10-13 | PROC-017 нэмэв (машин руу багцаар бичих) |
| 2026-10-13 | Нэгтгэсэн файлыг `lessons/LL-01…07` болгон хувааж, индексийг автомат (`pnpm docs:gen`) болгосон; DOC-003 нэмэв |
| 2026-10-13 | §24 v0.2.2: MIG-002 нэмэв (migration дугаарын дараалал) |
| 2026-10-13 | DOC-002 нэмэв (Obsidian vault хөрвүүлэлт) |
| 2026-10-13 | §22 (v0.2.2 Блок 3): TEST-024 (timestamptz ↔ JS Date — хугацааг SQL-д) |
| 2026-10-12 | §22 (v0.2.2 Блок 2): AUTH-003 (GoTrue fetch алдаа ≠ буруу нууц үг), SEC-008 (хязгаар ↔ NAT), PROC-008 давтагдсан |
| 2026-10-12 | §22 (v0.2.2 Блок 1): TEST-022 (harness generate), TEST-023 (зан төлөв ↔ CI-only тест), PROC-016 (git ls-files -z) |
| 2026-10-11 | §22 (v0.2.1 #14): SEC-007 (Caddy XFF / GoTrue IP хязгаар), TEST-021 (cloud prisma generate) |
| 2026-10-11 | §22 (v0.2.1): FE-009, TEST-020, DATA-001, PROC-015 |
| 2026-10-11 | §21 (v0.2.0): FE-008, PROC-012, TEST-017, TEST-018, OPS-004, PS-002, TEST-019, PROC-013, CI-005, PS-003, CI-006, CI-007, PROC-014 |
| 2026-10-11 | §20: PROC-011 (commit хийгээгүй файлыг дарж бичсэн) |
| 2026-10-10 | §20: FE-007 (/login ↔ /camp давталт) |
| 2026-10-10 | §20: OPS-003 (auth.email enable_signup) |
| 2026-10-10 | §20: PROC-010 (`.ps1` орчин цонхонд үлдсэн) |
| 2026-10-10 | §20: PROC-009 (шинэ clone-д pnpm install алга) |
| 2026-10-10 | §20 (v0.1.6 Кемп пилот): SEC-005 (auth/register), SEC-006 (Supabase env() → demo нууц), FE-006 (MFE remote), OPS-001/002, PS-001, TEST-016, PROC-008 |
| 2026-10-10 | §19 (Phase 6.4.7): CONC-002 (зэрэгцээ MR дугаар), TEST-015 дүгнэлт засав |
| 2026-10-10 | §19 (Phase 6.4): CI-004 (CI script/env хоцорсон) |
| 2026-10-10 | §19 (Phase 6.3): TEST-015 (dev + integration зэрэг → flaky) |
| 2026-10-10 | §19 (Phase 6.2): DOC-001 (баримт кодоос хоцорсон) |
| 2026-10-10 | §19: PROC-007 (заавар → `pnpm supabase:*`) |
| 2026-10-10 | §19 (Phase 6.1): TEST-014 (`pnpm test` ↔ e2e, fixture, auth rate limit) |
| 2026-10-10 | §19 (Phase 6.0b): SEC-004 (MR батлалт workflow/role/өөрийгөө батлахыг шалгадаггүй) |
| 2026-10-10 | §19 (Phase 6.0): PROC-006 (ижил staged нэр → хуучин агуулга), FE-005 (цэвэр логик API импортгүй), TEST-013 (harness headless_shell) |
| 2026-10-10 | §18 (Phase 5): EVT-001, EVT-002/003, TEST-012 |
| 2026-10-10 | §17 (Phase 4.9): SEC-003, API-001, HTTP-001; route probe тест |
| 2026-10-10 | §17 (Phase 4.8.5): SEC-002 (workflow definition cross-tenant update), TEST-011; RLS-004 шийдэл |
| 2026-10-10 | §17 (Phase 4.8.3): RLS-007 (set_config transaction-ий гадна), CACHE-001 (MR cache), TEST-010 (Prisma wasm harness) |
| 2026-10-10 | §17 (Phase 4.8.2): RLS-005 (буруу GUC policy), RLS-006 (`current_tenant_id` NULLIF) |
| 2026-10-10 | §16 (Phase 3.6): CURSOR-001, BUILD-001, CLUSTER-001, LOG-001, PROC-005; SEED-002 → `pnpm dev:test-user` |
| 2026-10-10 | §15: PROC-004 (Python CRLF → LF) |
| 2026-10-10 | §15: FE-004 (Шат 8 UI — lint, native validation, mobile, Tailwind, prompt); Шат 9 аудит: Шат 1–8-ын алдаа бүгд бүртгэгдсэн |
| 2026-10-10 | §15: TEST-008 нэмэлт (Modal-ын "×" = "Хаах" давхцал, багц 3) |
| 2026-10-10 | §15: TEST-008 (Playwright шошгын дэд мөр), TEST-009 (interception multipart) |
| 2026-10-10 | §15: PROC-003 (тасарсан оролдлогын үлдэгдэл файл) |
| 2026-10-09 | §15: CONC-001 (засвар хаах ↔ сэлбэг race, trigger `FOR SHARE`); VALID-001 дүрэм (3) хэрэгжсэн (`configureApp`) |
| 2026-10-09 | §15: VALID-001 (implicit conversion → boolean query буруу) |
| 2026-10-09 | §15: PRISMA-003 (Prisma алдааны мессеж escape-тэй) |
| 2026-10-09 | §15: ENV-009 (PowerShell pipe → кирилл `?`), TEST-007 (Supabase `postgres` superuser биш), ENV-010 (хавтас зөөхөд pnpm junction тасрах) |
| 2026-10-08 | ENV-007 (Playwright Chromium), ENV-008 (web-shell `VITE_API_BASE_URL` → CORS) нэмэв |
| 2026-10-08 | §12: SEED-001, ENV-001~005 нэмэв (шинэ машин дээр Supabase on Docker тохиргоо) |
| 2026-10-08 | TEST-006 нэмэв |
| 2026-10-08 | TEST-005 нэмэв |
| 2026-10-08 | RLS-004, MIG-001, TEST-004, ASYNC-001 нэмэв (Phase 4.1) |
| 2026-10-08 | PERF-003, SEED-002 нэмэв (Phase 3.7) |
| 2026-10-08 | PERF-001, PERF-002, PROC-002 нэмэв (Phase 3) |
| 2026-10-08 | TEST-003, RL-001 нэмэв (Phase 2.9) |
| 2026-10-08 | SEC-001, TEST-002 нэмэв (Phase 2.8) |
| 2026-10-08 | ENV-006 нэмэв (Windows Prisma DLL lock) |
| 2026-10-08 | ARCH-001, PROC-001 нэмэв (Phase 2, ADR-001) |
| 2026-10-08 | CI-001~003, TEST-001 нэмэв (Phase 1 CI засвар) |
| 2026-10-08 | Root `lessons_learned.md` (S5-E1~E16, META чеклист)-г 10-р хэсэг болгон нэгтгэв. Үндсэн файл = [[lessons_learned]] |
| 2026-09-21 | Бүх MVP + Sprint 5 алдааг нэгтгэж бүтэцтэй болгосон. RULE хөндлөн лавлагаа нэмсэн. |
| 2026-09-20 | MVP 4 аудит: ENUM-001/002, DI-001~003, SQL-001, CONFIG-001 нэмсэн |
| 2026-09-20 | RLS-001, PATCH-001, DI-008, DI-009, RESOLVE-001 нэмсэн |
| 2026-09-20 | FE-001, FE-002, FE-003 нэмсэн |
