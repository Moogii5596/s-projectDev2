import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { createRedisMock } from '../../../test/helpers/redis-mock';

/**
 * [TEST-003] Integration тестийн Redis mock апп-ын бүх Redis командыг агуулж байгаа эсэх.
 * Sprint 8-д TenantRateLimitGuard `redis.incr`-г ашигласан ч mock-д нэмээгүйгээс
 * 29 integration тест 500-аар унасан. Энэ тест тэр төрлийн алдааг unit шатанд барина.
 */
const SRC = resolve(__dirname, '../..');
const REDIS_CALL = /\b(?:this\.)?redis\.([a-zA-Z]+)\(/g;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.ts$/.test(name) && !/\.(spec|test)\.ts$/.test(name) ? [p] : [];
  });
}

describe('Integration Redis mock coverage (TEST-003)', () => {
  const used = new Set<string>();
  for (const file of walk(SRC)) {
    for (const m of readFileSync(file, 'utf-8').matchAll(REDIS_CALL)) used.add(m[1]);
  }

  it('src-д Redis команд ашиглагдаж байгааг олно (regex ажиллаж байна)', () => {
    expect(used.size).toBeGreaterThan(0);
    expect(used).toContain('incr');
  });

  it('src-ийн Redis команд бүр test/helpers/redis-mock.ts-д байна', () => {
    const mock = createRedisMock() as Record<string, unknown>;
    const missing = [...used].filter((cmd) => typeof mock[cmd] !== 'function');
    expect(missing, `redis-mock.ts-д нэмэх: ${missing.join(', ')}`).toEqual([]);
  });

  it('scanStream хоосон stream буцаана (cache invalidateTenant)', async () => {
    const batches: unknown[] = [];
    for await (const b of createRedisMock().scanStream()) batches.push(b);
    expect(batches).toEqual([]);
  });
});
