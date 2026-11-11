import { describe, expect, it } from 'vitest';
import { L1Cache, l1TtlSeconds } from './l1-cache';

describe('L1Cache (#32)', () => {
  it('TTL дуусахад алга болно; утгын TTL нь L1-ийн TTL-ээс хэтрэхгүй', () => {
    let now = 0;
    const c = new L1Cache<string>(30_000, 10, () => now);
    c.set('a', '1');
    c.set('b', '2', 60_000); // 30 с-ээр хязгаарлагдана
    c.set('c', '3', 5_000);
    now = 5_000;
    expect(c.get('c')).toBeUndefined();
    expect(c.get('a')).toBe('1');
    now = 30_000;
    expect(c.get('a')).toBeUndefined();
    expect(c.get('b')).toBeUndefined();
  });

  it('хэмжээ хязгаар → хамгийн хуучныг гаргана; delete', () => {
    const c = new L1Cache<number>(30_000, 2);
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3);
    expect(c.get('a')).toBeUndefined();
    expect(c.size).toBe(2);
    c.delete('b', 'c');
    expect(c.size).toBe(0);
  });

  it('TTL 0 → унтраалттай (хадгалахгүй); env: хоосон → 30, 0 → 0, буруу/их → 30', () => {
    const off = new L1Cache<string>(0);
    off.set('a', '1');
    expect(off.get('a')).toBeUndefined();
    expect(off.enabled).toBe(false);
    expect(l1TtlSeconds(undefined)).toBe(30);
    expect(l1TtlSeconds('0')).toBe(0);
    expect(l1TtlSeconds('10')).toBe(10);
    expect(l1TtlSeconds('300')).toBe(30);
    expect(l1TtlSeconds('x')).toBe(30);
  });
});
