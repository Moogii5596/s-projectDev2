import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from '../utils/cursor';

describe('cursor pagination', () => {
  it('round-trips an id and timestamp', () => {
    const createdAt = new Date('2026-09-22T00:00:00.000Z');
    expect(decodeCursor(encodeCursor('mr-1', createdAt))).toEqual({ id: 'mr-1', createdAt });
  });

  it('rejects malformed cursors', () => {
    expect(() => decodeCursor('invalid')).toThrow('Invalid pagination cursor');
  });
});