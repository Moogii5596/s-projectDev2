/**
 * Phase 6.4.2 — Апп-ын хувилбар (ганц эх сурвалж). `/api/v1/health`, `/api/v1/healthz`.
 * Өмнө: health = хатуу '1.0.0', healthz = npm_package_version (pnpm-ээр асаасан үед л) → '0.1.0'.
 * `app-version.spec.ts` нь энэ утга `apps/core-kernel/package.json`-ийн `version`-тэй тэнцүүг шалгана
 * (release хийхэд хоёуланг нь солино).
 */
export const APP_VERSION = '0.2.0';
