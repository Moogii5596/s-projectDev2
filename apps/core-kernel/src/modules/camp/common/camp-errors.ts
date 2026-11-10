import { HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { badRequest, conflict, notFound } from '../../../common/i18n/app-error';

const TRIGGER_MESSAGE_CODES: Record<string, string> = {
  CAMP_CONTRACT_HISTORY: 'camp.err.trigger.contract_history',
  CAMP_COST_IMMUTABLE: 'camp.err.trigger.cost_immutable',
  CAMP_HAUL_CONTRACT: 'camp.err.trigger.haul_contract',
  CAMP_HAUL_LOCKED: 'camp.err.trigger.haul_locked',
  CAMP_MAINTENANCE_LOCKED: 'camp.err.trigger.maintenance_locked',
  CAMP_MEAL_CONTRACT: 'camp.err.trigger.meal_contract',
  CAMP_MEAL_LOCKED: 'camp.err.trigger.meal_locked',
  CAMP_STAY_INVALID: 'camp.err.trigger.stay_invalid',
  CAMP_SITE_LINK: 'core.site.camp_link_missing',
  CAMP_SYSTEM_ROLE: 'camp.err.trigger.system_role',
};

/**
 * DB-ийн алдааг HTTP алдаа руу (Шат 2.1). App түвшний шалгалт үндсэн, энэ нь НӨӨЦ хамгаалалт:
 * зэрэгцээ хүсэлт (race) эсвэл app алгассан нөхцөлд DB constraint/trigger барина.
 *   P2002 unique → 409 · P2003 FK → 400 · P2025 not found → 404
 *   trigger `CAMP_*:` → 409 · EXCLUDE (ex_*) → 409 · CHECK (chk_* / *_check) → 400
 */
export function toCampHttpError(err: unknown): unknown {
  if (err instanceof HttpException) return err;
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | string | undefined) ?? '';
      return conflict('camp.err.errors.1', { fields: Array.isArray(target) ? target.join(', ') : target });
    }
    if (err.code === 'P2003') return badRequest('camp.err.errors.2');
    if (err.code === 'P2025') return notFound('camp.err.errors.3');
  }
  // Prisma 5 (PrismaClientUnknownRequestError) PostgreSQL алдааг Rust Debug хэлбэрээр өгдөг — хашилт escape-тэй:
  //   PostgresError { code: "23514", message: "... violates check constraint \"camp_rooms_capacity_check\"", ... }
  // → эхлээд `\"` → `"` болгож хэвийн болгоно; SQLSTATE-ээр (23P01 / 23514) нөөц таних [PRISMA-003]
  const message = (err instanceof Error ? err.message : String(err)).replace(/\\"/g, '"');
  const trigger = /(CAMP_[A-Z_]+): ([^\n"]+)/.exec(message);
  if (trigger) {
    const messageCode = TRIGGER_MESSAGE_CODES[trigger[1]];
    if (messageCode) return conflict(messageCode);
    return conflict('camp.err.errors.4', { code: trigger[1], detail: trigger[2].trim() });
  }
  const sqlstate = /code: "([0-9A-Z]{5})"/.exec(message)?.[1];
  const exclusion = /exclusion constraint "([a-z0-9_]+)"/.exec(message);
  if (exclusion || sqlstate === '23P01') {
    return conflict('camp.err.errors.5', { constraint: exclusion?.[1] ?? sqlstate ?? '23P01' });
  }
  const check = /check constraint "([a-z0-9_]+)"/.exec(message);
  if (check || sqlstate === '23514') {
    return badRequest('camp.err.errors.6', { constraint: check?.[1] ?? sqlstate ?? '23514' });
  }
  return err;
}

/** fn-ийг ажиллуулж DB алдааг HTTP алдаа болгон дахин шиднэ */
export async function withCampErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw toCampHttpError(err);
  }
}
