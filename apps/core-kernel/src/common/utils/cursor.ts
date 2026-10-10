import { BadRequestException } from '@nestjs/common';

/** Phase 3.6.3: cursor-ийн id нь DB-д `::uuid` болж ордог — UUID биш бол 500 биш 400 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const INVALID_CURSOR_MESSAGE = 'cursor буруу байна';

export const encodeCursor = (id: string, createdAt: Date): string =>
  Buffer.from(JSON.stringify({ id, createdAt: createdAt.toISOString() })).toString('base64url');

/**
 * Буруу cursor (base64/JSON/id/огноо) → BadRequestException (400).
 * BadRequestException нь Error-ийн удамшил тул `try { decodeCursor } catch { throw 400 }` хэв маяг ч ажилласаар.
 */
export const decodeCursor = (cursor: string): { id: string; createdAt: Date } => {
  let decoded: { id?: unknown; createdAt?: unknown };
  try {
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as typeof decoded;
  } catch {
    throw new BadRequestException(INVALID_CURSOR_MESSAGE);
  }
  if (decoded === null || typeof decoded !== 'object') throw new BadRequestException(INVALID_CURSOR_MESSAGE);
  const { id, createdAt } = decoded;
  if (typeof id !== 'string' || !UUID_RE.test(id) || typeof createdAt !== 'string') {
    throw new BadRequestException(INVALID_CURSOR_MESSAGE);
  }
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(INVALID_CURSOR_MESSAGE);
  return { id, createdAt: date };
};
