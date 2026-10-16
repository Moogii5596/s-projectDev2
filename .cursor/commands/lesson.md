# /lesson — Алдааны сургамж бүртгэх

1. Find the matching group file in `docs/lessons/LL-*.md` (check `docs/lessons_learned.md` index; don't duplicate an existing entry).
2. Append a new entry with the next `[ID]` in that group's format: symptom, root cause, fix, rule (how to avoid next time), date.
3. Run `pnpm docs:gen` (regenerates the `lessons_learned.md` index), then `pnpm docs:check`.
4. Report the ID and one-line rule in Mongolian.
