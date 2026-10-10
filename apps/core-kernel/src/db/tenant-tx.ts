import { Prisma } from '@prisma/client';

/**
 * Phase 4.8.3 — Tenant transaction (RULE-04, [RLS-004]) — 2026-10-10
 *
 * `set_config('app.tenant_id', $1, true)` нь ЗӨВХӨН тухайн transaction-д хүчинтэй.
 * Тиймээс tenant өгөгдлийн query бүр энэ функцээр (нэг transaction дотор) явна —
 * app `app_user` (NOBYPASSRLS)-ээр холбогдоход RLS policy tenant-ийг эндээс уншина.
 * Transaction-ий гадуурх `this.prisma.model.*` дуудлага app_user-д 0 мөр / P2025 өгнө.
 *
 * Camp модуль ижил загварын `camp/common/camp-tx.ts`-ийг ашигладаг.
 */
export type TenantTx = Prisma.TransactionClient;

export interface TransactionCapable {
  $transaction<R>(
    fn: (tx: Prisma.TransactionClient) => Promise<R>,
    options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<R>;
}

export function inTenantTx<T>(
  prisma: TransactionCapable,
  tenantId: string,
  fn: (tx: TenantTx) => Promise<T>,
  options?: { timeout?: number; maxWait?: number },
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx);
  }, options);
}
