import { BadRequestException, ConflictException, HttpException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

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
      return new ConflictException(`Давхардсан утга (${Array.isArray(target) ? target.join(', ') : target})`);
    }
    if (err.code === 'P2003') return new BadRequestException('Холбогдох бичлэг буруу эсвэл өөр кемп/tenant-ийнх байна');
    if (err.code === 'P2025') return new NotFoundException('Бичлэг олдсонгүй');
  }
  // Prisma 5 (PrismaClientUnknownRequestError) PostgreSQL алдааг Rust Debug хэлбэрээр өгдөг — хашилт escape-тэй:
  //   PostgresError { code: "23514", message: "... violates check constraint \"camp_rooms_capacity_check\"", ... }
  // → эхлээд `\"` → `"` болгож хэвийн болгоно; SQLSTATE-ээр (23P01 / 23514) нөөц таних [PRISMA-003]
  const message = (err instanceof Error ? err.message : String(err)).replace(/\\"/g, '"');
  const trigger = /(CAMP_[A-Z_]+): ([^\n"]+)/.exec(message);
  if (trigger) return new ConflictException(`${trigger[1]}: ${trigger[2].trim()}`);
  const sqlstate = /code: "([0-9A-Z]{5})"/.exec(message)?.[1];
  const exclusion = /exclusion constraint "([a-z0-9_]+)"/.exec(message);
  if (exclusion || sqlstate === '23P01') {
    return new ConflictException(`Хугацаа/муж давхцаж байна${exclusion ? ` (${exclusion[1]})` : ''}`);
  }
  const check = /check constraint "([a-z0-9_]+)"/.exec(message);
  if (check || sqlstate === '23514') {
    return new BadRequestException(`Өгөгдөл дүрэм зөрчиж байна${check ? ` (${check[1]})` : ''}`);
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
