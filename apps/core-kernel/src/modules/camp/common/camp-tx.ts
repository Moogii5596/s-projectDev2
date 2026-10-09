import { Prisma } from '@prisma/client';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';

export type Tx = Prisma.TransactionClient;

/**
 * RULE-04: set_config + бүх query НЭГ transaction дотор. Transaction бүр `app.tenant_id`-аар эхэлнэ ([RLS-004]).
 */
export function inTenantTx<T>(
  prisma: PrismaTenantClientService,
  tenantId: string,
  fn: (tx: Tx) => Promise<T>,
  /** Том импорт г.м. — Prisma interactive transaction-ийн анхдагч timeout 5с */
  options?: { timeout?: number; maxWait?: number },
): Promise<T> {
  return prisma.$transaction(async (tx: Tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx);
  }, options);
}

/** 'YYYY-MM-DD' → UTC шөнө дунд (Prisma @db.Date) */
export const toDbDate = (iso: string): Date => new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);

/** Prisma @db.Date → 'YYYY-MM-DD' */
export const fromDbDate = (d: Date): string => d.toISOString().slice(0, 10);

/** 'HH:MM' → Prisma @db.Time (1970-01-01 UTC) */
export const toDbTime = (hhmm: string): Date => new Date(`1970-01-01T${hhmm}:00.000Z`);

/** Prisma @db.Time → 'HH:MM' */
export const fromDbTime = (d: Date): string => d.toISOString().slice(11, 16);
