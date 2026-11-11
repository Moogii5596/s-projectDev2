## What / why
Closes #

## How it was verified
- [ ] `pnpm verify:changed` green (tsc + eslint + related unit for touched files)
- [ ] Unit / integration / e2e (list the specs):
- [ ] Ran against the **real stack** (local Supabase / staging), not only mocks/shims — or say what could not be run (ARCH-001, OPS-016)
- [ ] Endpoint / permission change: negative tests — no permission (403) · other tenant (403) · target with a higher role (SEC-001/004/009)
- [ ] Screenshots (UI changes, 390px + desktop):

## Size
- Files changed: ___ (aim ≤ 30; split larger work into several PRs — one issue = one PR)

## Risk
- Migration: none / expand / contract — rollback-safe? 
- Permissions / tenant isolation / PII impact:
- Feature flag:

## Definition of Done (AGENTS.md §2)
- [ ] Acceptance criteria of the issue met
- [ ] mn / en / zh, no hardcoded text
- [ ] tsc + eslint + tests green locally; CI green
- [ ] Migration: local reset → db:generate → prisma-drift (if any)
- [ ] `pnpm docs:gen` (if API/DB/permissions changed)
- [ ] Issue updated (what / tests / remaining)
- [ ] Author does NOT merge — A0 merges after review
