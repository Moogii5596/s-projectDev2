import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor, INVALID_CURSOR_MESSAGE } from '../utils/cursor';

const ID = '0192a3b4-0000-7000-8000-000000000001';
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');

describe('cursor pagination', () => {
  it('round-trips an id and timestamp', () => {
    const createdAt = new Date('2026-09-22T00:00:00.000Z');
    expect(decodeCursor(encodeCursor(ID, createdAt))).toEqual({ id: ID, createdAt });
  });

  it.each([
    ['base64/JSON биш', 'invalid'],
    ['JSON null', b64(null)],
    ['id байхгүй', b64({ createdAt: '2026-09-22T00:00:00.000Z' })],
    ['id UUID биш (DB ::uuid → 500 байсан)', b64({ id: 'mr-1', createdAt: '2026-09-22T00:00:00.000Z' })],
    ['id тоо', b64({ id: 5, createdAt: '2026-09-22T00:00:00.000Z' })],
    ['огноо буруу', b64({ id: ID, createdAt: 'yesterday' })],
    ['огноо тоо', b64({ id: ID, createdAt: 0 })],
  ])('%s → BadRequestException (400)', (_label, cursor) => {
    let err: unknown;
    try {
      decodeCursor(cursor);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).getStatus()).toBe(400);
    expect((err as Error).message).toBe(INVALID_CURSOR_MESSAGE);
  });
});
