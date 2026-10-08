import { describe, it, expect } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { EnvConfig } from './env.config';

// ADR-001: EnvConfig startup validation-д DEPLOYMENT_MODE нэгтгэсэн эсэх
// RULE-10: new Service(mockDep as never) хэв маяг — ConfigService-г map-аар mock хийнэ

const BASE_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3000',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:54322/postgres',
  DIRECT_URL: 'postgresql://postgres:postgres@localhost:54322/postgres',
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  SUPABASE_ANON_KEY: 'test-anon-key',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'x'.repeat(32),
};

function makeConfig(overrides: Record<string, string> = {}): ConfigService {
  const map = { ...BASE_ENV, ...overrides };
  // process.env fallback-аас хамааралгүй байхын тулд тохируулаагүй key → '' (clean() → undefined)
  return { get: (key: string) => map[key] ?? '' } as unknown as ConfigService;
}

describe('EnvConfig — DEPLOYMENT_MODE', () => {
  it('тохируулаагүй → shared (одоогийн зан хэвээр)', () => {
    const env = new EnvConfig(makeConfig());
    expect(env.DEPLOYMENT_MODE).toBe('shared');
    expect(env.isDedicated).toBe(false);
    expect(env.DEDICATED_TENANT_SLUG).toBeNull();
  });

  it('dedicated + зөв slug → getter-үүд зөв', () => {
    const env = new EnvConfig(
      makeConfig({ DEPLOYMENT_MODE: 'dedicated', DEDICATED_TENANT_SLUG: 'acme' }),
    );
    expect(env.DEPLOYMENT_MODE).toBe('dedicated');
    expect(env.isDedicated).toBe(true);
    expect(env.DEDICATED_TENANT_SLUG).toBe('acme');
  });

  it('dedicated + slug байхгүй → startup алдаа (validation failed)', () => {
    expect(() => new EnvConfig(makeConfig({ DEPLOYMENT_MODE: 'dedicated' }))).toThrow(
      /Environment variable validation failed[\s\S]*DEDICATED_TENANT_SLUG/,
    );
  });

  it('буруу mode → startup алдаа', () => {
    expect(() => new EnvConfig(makeConfig({ DEPLOYMENT_MODE: 'vpc' }))).toThrow(
      /DEPLOYMENT_MODE/,
    );
  });
});

describe('EnvConfig — RATE_LIMIT_* (Phase 3.1)', () => {
  it('тохируулаагүй → алдаагүй эхэлнэ', () => {
    expect(() => new EnvConfig(makeConfig())).not.toThrow();
  });

  it('зөв утга → алдаагүй', () => {
    expect(() => new EnvConfig(makeConfig({ RATE_LIMIT_SHORT: '1000000' }))).not.toThrow();
  });

  it('буруу утга → startup алдаа', () => {
    expect(() => new EnvConfig(makeConfig({ RATE_LIMIT_MEDIUM: 'abc' }))).toThrow(
      /Environment variable validation failed[\s\S]*RATE_LIMIT_MEDIUM/,
    );
  });
});
