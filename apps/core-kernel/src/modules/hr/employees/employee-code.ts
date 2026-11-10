import { getRosterSettings } from '../../camp/common/camp-lookup';
import type { Tx } from '../../camp/common/camp-tx';

/**
 * v0.2.3 Блок R7 (PIL-25, R-9) — кодгүй ажилтны автомат код: `<угтвар><4+ орон>` (Z0001 …).
 * Дугаарлалт tenant даяар: тухайн угтвартай бүх код (ажлаас гарсныг ч) → хамгийн их + 1 (дахин ашиглахгүй).
 * Угтвар = кемпийн тохиргоо `auto_code_prefix` (анхдагч Z). Зэрэг үүсгэхэд tenant-ийн advisory lock.
 */
const AUTO_CODE_DIGITS = 4;

/** Цэвэр: одоо байгаа кодуудаас дараагийнх (`Z0009` → `Z0010`, 9999-ийн дараа 5 орон) */
export function nextAutoCode(prefix: string, existing: string[]): string {
  const re = new RegExp(`^${prefix}(\\d{${AUTO_CODE_DIGITS},})$`);
  let max = 0;
  for (const c of existing) {
    const m = re.exec(c);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${String(max + 1).padStart(AUTO_CODE_DIGITS, '0')}`;
}

/** Transaction дотор: lock → кемпийн угтвар → tenant-ийн тухайн угтвартай кодууд → дараагийнх */
export async function allocateEmployeeCode(tx: Tx, tenantId: string, campId: string): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`employee-code:${tenantId}`}))`;
  const { autoCodePrefix } = await getRosterSettings(tx, tenantId, campId);
  const rows = await tx.hrEmployee.findMany({ where: { tenantId, employeeCode: { startsWith: autoCodePrefix } }, select: { employeeCode: true } });
  return nextAutoCode(autoCodePrefix, rows.map((r) => r.employeeCode));
}
