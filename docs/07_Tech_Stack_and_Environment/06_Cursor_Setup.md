---
title: "Cursor IDE тохиргоо"
type: "Guide"
status: "Active"
last_updated: 2026-10-17
tags: [cursor, ide, setup, rules]
---

# Cursor IDE тохиргоо

> Claude-ийн лимит дуусахад энэ IDE дээр үргэлжилнэ; reset хийхэд Claude. Хоёулаа [[CONTEXT]]-ээс эхэлнэ — зэрэгцээ биш (§7). Ажлын дүрэм нь CONTEXT §3–4-тэй ижил — rule файлууд тэр баримт руу заадаг (хуулбар биш).

## 1. Repo доторх файлууд (commit хийгдэнэ)
| Файл | Үүрэг |
|---|---|
| `.cursor/rules/00-core.mdc` | Үргэлж: CONTEXT-ээс эхлэх, төлөвлөгөө → батлуулах, төлөв, шалгах, LL, docs (дүрэм 0–6) |
| `.cursor/rules/10-windows-shell.mdc` | Үргэлж: PowerShell 5.1 (`&&` ✖), pnpm, Docker Supabase |
| `.cursor/rules/20-db-prisma-rls.mdc` | `supabase/**`, `prisma/**` — MIG/RLS/UUID дүрэм |
| `.cursor/rules/30-backend-nestjs.mdc` | `apps/core-kernel/**` — NestJS, API, тест |
| `.cursor/rules/40-frontend.mdc` | `apps/web-shell/**`, `mfe-requisitions/**` |
| `.cursor/rules/50-docs-obsidian.mdc` | `docs/**` — frontmatter, `[[link]]`, INDEX |
| `.cursor/commands/` | `/plan`, `/verify`, `/lesson`, `/close-block` |
| `.cursorignore` | AI огт уншихгүй: `.env*`, `docs/_learning/`, `_tmp_*` |
| `.cursorindexingignore` | Индекслэхгүй: `node_modules`, `dist`, архив, lockfile |
| `.vscode/settings.json`, `extensions.json` | Format on save, ESLint, Prettier, Prisma |
| `.vscode/launch.json` | F5 debug: core-kernel `:3000`, web-shell Vite `:5173` + Chrome |

Дүрэм өөрчлөгдвөл: эхлээд [[CONTEXT]] / [[08_Patterns]]-ийг засна, rule файл зөвхөн заалт.

## 2. Cursor-ийн UI тохиргоо (машин бүр дээр нэг удаа)
1. **Extensions:** `extensions.json`-ийн санал болгосон өргөтгөлүүдийг суулгах.
2. **Settings → Rules:** Project Rules-д 6 rule харагдаж байгааг шалгах. User Rules-д: "Always answer in Mongolian."
3. **Settings → Agents → Auto-run:** allowlist-д `pnpm --filter`, `pnpm docs:gen`, `pnpm docs:check`, `pnpm type-check`, `pnpm lint`, `git status`, `git diff`. Allowlist-д **оруулахгүй:** `supabase db reset`, `supabase migration up`, `git commit/push`, `Remove-Item`.
4. **Settings → General → Privacy Mode:** асаах (кодыг сургалтад ашиглахгүй).
5. **Settings → Indexing & Docs:** Codebase indexing асаалттай; нэмэлт Docs: NestJS, Prisma, Supabase.
6. **Terminal:** default profile = Windows PowerShell.

## 3. Ажлын урсгал
`/plan` → «Батлав» → хэрэгжүүлэх → `/verify` → (алдаа бол `/lesson`) → `/close-block` → commit (хэрэглэгч).

Лимит дуусахад / Claude руу буцахад: [[CONTEXT]] §7 (progress «Зогссон цэг», `git status`).

## 4. Шалгах
Шинэ Agent чатад: «Ямар rule идэвхтэй байна?» гэж асуухад 00 ба 10 нэрлэгдэх ёстой; `apps/core-kernel`-ийн файл нээхэд 30 нэмэгдэнэ.
