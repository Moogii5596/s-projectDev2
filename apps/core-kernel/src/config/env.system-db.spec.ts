import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { EnvConfig } from './env.config';

const BASE: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://app_user:x@localhost:54322/postgres',
  DIRECT_URL: 'postgresql://postgres:postgres@localhost:54322/postgres',
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'k',
  SUPABASE_ANON_KEY: 'a',
  JWT_SECRET: 'x'.repeat(32),
};
const make = (o: Record<string, string> = {}) =>
  new EnvConfig({ get: (k: string) => ({ ...BASE, ...o })[k] ?? '' } as unknown as ConfigService);

describe('EnvConfig — SYSTEM_DATABASE_URL (Phase 4.8.4)', () => {
  it('тохируулаагүй ("") → алдаагүй, getter = DATABASE_URL', () => {
    expect(make().SYSTEM_DATABASE_URL).toBe(BASE.DATABASE_URL);
  });

  it('зөв URL → түүнийг буцаана', () => {
    const sys = 'postgresql://postgres:postgres@localhost:54322/postgres';
    expect(make({ SYSTEM_DATABASE_URL: sys }).SYSTEM_DATABASE_URL).toBe(sys);
  });

  it('буруу URL → startup алдаа', () => {
    expect(() => make({ SYSTEM_DATABASE_URL: 'not a url' })).toThrow(/SYSTEM_DATABASE_URL/);
  });
});
