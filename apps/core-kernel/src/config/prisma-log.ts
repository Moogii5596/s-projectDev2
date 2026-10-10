import type { Prisma } from '@prisma/client';

/**
 * Phase 3.6.6 — Prisma-гийн өөрийн консол лог (`prisma:error ...`)-ийн түвшин (2026-10-10)
 *
 * Prisma `log: ['error']` үед код БАРЬЖ АВСАН алдааг ч (жнь P2002 → 409) консол руу бичдэг.
 * Integration тест санаатайгаар давхардал үүсгэдэг тул гаралт "алдаатай" мэт харагддаг байв.
 * PRISMA_LOG_LEVELS="warn,error" (default) | "warn" | "none" | "query,info,warn,error"
 * Барьж аваагүй алдаа нь exception болж HTTP 500 / тестийн filter-ийн [ERROR] логоор харагдсаар байна.
 */
const LEVELS: readonly Prisma.LogLevel[] = ['query', 'info', 'warn', 'error'];
export const DEFAULT_PRISMA_LOG_LEVELS: Prisma.LogLevel[] = ['warn', 'error'];

export function resolvePrismaLogLevels(raw: string | undefined = process.env.PRISMA_LOG_LEVELS): Prisma.LogLevel[] {
  if (raw === undefined || raw.trim() === '') return [...DEFAULT_PRISMA_LOG_LEVELS];
  if (raw.trim().toLowerCase() === 'none') return [];
  const picked = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is Prisma.LogLevel => (LEVELS as readonly string[]).includes(s));
  return picked.length > 0 ? [...new Set(picked)] : [...DEFAULT_PRISMA_LOG_LEVELS];
}
