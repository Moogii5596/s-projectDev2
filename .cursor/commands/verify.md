# /verify — Шалгах (PowerShell 5.1: no `&&`)

Run for the packages you changed only, one command at a time:
- Backend: `pnpm --filter @s-project/core-kernel type-check` ; `pnpm --filter @s-project/core-kernel exec eslint <changed files>` ; `pnpm --filter @s-project/core-kernel exec vitest run <related test files>`
- Frontend: `pnpm --filter @s-project/web-shell type-check` ; `pnpm --filter @s-project/web-shell exec eslint <changed files>` ; related vitest files if any.
- Integration tests only when DB/RLS code changed: `pnpm --filter @s-project/core-kernel test:integration` (needs Supabase running).

Report a short Mongolian summary: ✓/✗ per step. If something fails, fix it (max 3 attempts, then record the error and stop) — see `/lesson`.
