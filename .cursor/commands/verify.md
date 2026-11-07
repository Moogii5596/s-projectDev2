# /verify — Шалгах (PowerShell 5.1: `&&` ✖, `;` ашигла)

Хөндсөн package-д л:
- Backend: `pnpm --filter @s-project/core-kernel type-check` ; `pnpm --filter @s-project/core-kernel exec eslint <файлууд>` ; `pnpm --filter @s-project/core-kernel exec vitest run <хамаарах тест>`
- Frontend: `pnpm --filter @s-project/web-shell type-check` ; `pnpm --filter @s-project/web-shell exec eslint <файлууд>` ; хамаарах vitest
- Backend / DB өөрчлөгдсөн бол: `pnpm --filter @s-project/core-kernel exec vitest run -c vitest.integration.config.ts <тухайн spec>` (Supabase ажиллаж байх)

Үр дүнг алхам тус бүр ✓/✗-оор товч. Унавал засна; 3 оролдлогоор засагдахгүй бол шалтгааныг бичээд зогсоно.
