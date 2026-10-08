/**
 * Tenant rate limit тохиргоо — Phase 3.1 (2026-10-08, шийдвэр B)
 *
 * Tenant бүрт (нэвтрээгүй бол IP-ээр) 3 цонх:
 *   short  — 1 сек   (RATE_LIMIT_SHORT,  default 100)
 *   medium — 10 сек  (RATE_LIMIT_MEDIUM, default 500)
 *   long   — 60 сек  (RATE_LIMIT_LONG,   default 2000)
 *
 * Өмнөх утга (10/50/200) нь 100 хэрэглэгчтэй нэг байгууллагад хэт бага байсан —
 * нэг хуудас ачаалахад хэд хэдэн API дуудлага явдаг.
 * Load test-д өндөр утга өгнө (жнь RATE_LIMIT_SHORT=1000000).
 *
 * Ганц эх сурвалж: EnvConfig (startup validation) + TenantRateLimitGuard.
 */

export interface RateLimitWindow {
  name: 'short' | 'medium' | 'long';
  ttlMs: number;
  limit: number;
}

export const RATE_LIMIT_DEFAULTS = { short: 100, medium: 500, long: 2000 } as const;

export interface RateLimitEnvInput {
  RATE_LIMIT_SHORT?: string | null;
  RATE_LIMIT_MEDIUM?: string | null;
  RATE_LIMIT_LONG?: string | null;
}

function parseLimit(key: keyof RateLimitEnvInput, raw: string | null | undefined, fallback: number): number {
  const value = raw?.trim();
  if (!value) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1 || !Number.isSafeInteger(Number(value))) {
    throw new Error(`${key}: "${value}" буруу утга — 1-ээс их бүхэл тоо байх ёстой`);
  }
  return Number(value);
}

/**
 * @throws Error — буруу утга үед (app эхлэхгүй)
 */
export function parseRateLimitConfig(input: RateLimitEnvInput): RateLimitWindow[] {
  return [
    { name: 'short', ttlMs: 1_000, limit: parseLimit('RATE_LIMIT_SHORT', input.RATE_LIMIT_SHORT, RATE_LIMIT_DEFAULTS.short) },
    { name: 'medium', ttlMs: 10_000, limit: parseLimit('RATE_LIMIT_MEDIUM', input.RATE_LIMIT_MEDIUM, RATE_LIMIT_DEFAULTS.medium) },
    { name: 'long', ttlMs: 60_000, limit: parseLimit('RATE_LIMIT_LONG', input.RATE_LIMIT_LONG, RATE_LIMIT_DEFAULTS.long) },
  ];
}
