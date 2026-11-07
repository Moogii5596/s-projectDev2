# /close-block — Блок дуусгах

`AGENTS.md` §2-ийн шалгуурыг нэг бүрчлэн шалгана:
1. `/verify` ногоон (+ backend бол integration, шинэ дэлгэц бол e2e).
2. Endpoint бүр UI-д ашиглагдсан, 3 хэлний орчуулга бүрэн, эрхгүйд нуугдсан.
3. Migration бол: reset → `db:generate` → `prisma-drift.mjs --update`.
4. `pnpm docs:gen`.
5. Tech plan-д блокийн мөр `[x]` + нэг мөр үр дүн.
6. Өөрийн branch-д commit; хэрэглэгчид merge команд (PowerShell) өгнө.
