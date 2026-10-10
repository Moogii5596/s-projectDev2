import { describe, expect, it } from 'vitest';
import { resolveSystemDatabaseUrl } from './system-prisma.service';

describe('resolveSystemDatabaseUrl (Phase 4.8.4)', () => {
  const APP = 'postgresql://app_user:x@127.0.0.1:54322/postgres';
  const SYS = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

  it('SYSTEM_DATABASE_URL байвал түүнийг', () => {
    expect(resolveSystemDatabaseUrl({ DATABASE_URL: APP, SYSTEM_DATABASE_URL: SYS })).toBe(SYS);
  });

  it('байхгүй / хоосон / зай → DATABASE_URL (шилжилтийн үе)', () => {
    expect(resolveSystemDatabaseUrl({ DATABASE_URL: SYS })).toBe(SYS);
    expect(resolveSystemDatabaseUrl({ DATABASE_URL: SYS, SYSTEM_DATABASE_URL: '' })).toBe(SYS);
    expect(resolveSystemDatabaseUrl({ DATABASE_URL: SYS, SYSTEM_DATABASE_URL: '  ' })).toBe(SYS);
  });

  it('хоёулаа байхгүй → undefined (Prisma schema-ийн env("DATABASE_URL") анхдагч)', () => {
    expect(resolveSystemDatabaseUrl({})).toBeUndefined();
  });
});
