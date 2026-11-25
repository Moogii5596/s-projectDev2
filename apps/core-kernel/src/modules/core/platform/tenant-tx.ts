/**
 * Цөмийн platform (ADR-009, C1 / CORE-01) — tenant transaction + Prisma огноо/цагийн хөрвүүлэлт.
 * `inTenantTx`-ийн ганц хэрэгжүүлэлт = `db/tenant-tx.ts` (RULE-04, [RLS-004]); модулиуд эндээс import хийнэ.
 */
import type { TenantTx } from '../../../db/tenant-tx';

export { inTenantTx } from '../../../db/tenant-tx';
export type Tx = TenantTx;

/** 'YYYY-MM-DD' → UTC шөнө дунд (Prisma @db.Date) */
export const toDbDate = (iso: string): Date => new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);

/** Prisma @db.Date → 'YYYY-MM-DD' */
export const fromDbDate = (d: Date): string => d.toISOString().slice(0, 10);

/** 'HH:MM' → Prisma @db.Time (1970-01-01 UTC) */
export const toDbTime = (hhmm: string): Date => new Date(`1970-01-01T${hhmm}:00.000Z`);

/** Prisma @db.Time → 'HH:MM' */
export const fromDbTime = (d: Date): string => d.toISOString().slice(11, 16);
