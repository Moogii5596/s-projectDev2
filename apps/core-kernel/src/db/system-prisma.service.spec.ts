import { describe, expect, it } from 'vitest';
import { resolveSystemDatabaseUrl } from './system-prisma.service';

describe('resolveSystemDatabaseUrl (Phase 4.8.4)', () => {
  const APP = 'postgresql://app_user:x@127.0.0.1:54322/postgres';
  const SYS = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

  it('SYSTEM_DATABASE_URL байвал түүнийг', () => {
    expect(resolveSystemDatabaseUrl({ DATABASE_URL: APP, SYSTEM_DATABASE_URL: SYS })).toBe(SYS);
  });

  it('DATABASE_URL нь fallback болохгүй; системийн URL дутвал fail-fast', () => {
    expect(() => resolveSystemDatabaseUrl({ DATABASE_URL: SYS })).toThrow(/SYSTEM_DATABASE_URL/);
    expect(() => resolveSystemDatabaseUrl({ DATABASE_URL: SYS, SYSTEM_DATABASE_URL: '' })).toThrow(/SYSTEM_DATABASE_URL/);
    expect(() => resolveSystemDatabaseUrl({ DATABASE_URL: SYS, SYSTEM_DATABASE_URL: '  ' })).toThrow(/SYSTEM_DATABASE_URL/);
  });

  it('хоёулаа байхгүй бол fail-fast', () => {
    expect(() => resolveSystemDatabaseUrl({})).toThrow(/SYSTEM_DATABASE_URL/);
  });
});
