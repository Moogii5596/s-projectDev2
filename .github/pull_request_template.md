## What / why
Closes #

## How it was verified
- [ ] Unit / integration / e2e (list the specs):
- [ ] Screenshots (UI changes, 390px + desktop):

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
