# /close-block — Блок дуусгах (DoD)

Follow `docs/09_Codebase/08_Patterns.md` §6:
1. `/verify` is green (type-check, lint, related tests).
2. Migration in this block? → note local reset + `pnpm db:generate` done and staging checks in progress.
3. Update the relevant section of `docs/09_Codebase/01_Backend_Modules.md` / `04_Frontend_Map.md`.
4. `pnpm docs:gen` then `pnpm docs:check` ✓.
5. Update the current sprint progress file (see `docs/project-status.md`) and `docs/project-status.md` top sections (`last_updated` too).
6. Any errors fixed this block → `/lesson`.
7. Output the final checklist state and a suggested commit message (English, conventional commits). Do not commit.
