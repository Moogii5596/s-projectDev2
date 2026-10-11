import { Injectable, Inject, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { REDIS_CLIENT } from '../db/redis.module';
import Redis from 'ioredis';
import { SystemPrismaService } from '../db/system-prisma.service';

const CACHE_TTL_SECONDS = 300; // 5 минут
const CACHE_PREFIX = 'tenant:slug:';
// SEC-001: membership cache — эерэг 5 мин, сөрөг 30 сек (шинэ урилга хурдан идэвхжинэ)
const MEMBER_PREFIX = 'tenant:member:';
/** v0.2.2 D-06 — нууц үг солих шаардлага (60с; солиход invalidateMember цэвэрлэнэ) */
const PWCHANGE_PREFIX = 'tenant:pwchange:';
const PWCHANGE_TTL_SECONDS = 60;
const MEMBER_TTL_SECONDS = 300;
const NON_MEMBER_TTL_SECONDS = 30;
// PERF-003: Supabase token шалгалтын cache — хүсэлт бүрт Supabase Auth руу хандахгүй
const AUTH_PREFIX = 'auth:token:';
export const AUTH_CACHE_MAX_TTL_SECONDS = 60;

export interface CachedAuthUser {
  id: string;
  email?: string;
}

/** Token-ийг Redis-д ХАДГАЛАХГҮЙ — зөвхөн SHA-256 hash-ийг түлхүүр болгоно */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Cache TTL = min(60с, token дуусах хүртэлх хугацаа). Дууссан token → 0 (cache хийхгүй).
 * exp-ийг гарын үсэг шалгалгүй уншина — зөвхөн TTL-ийг БОГИНОСГОХОД ашиглана,
 * token өөрөө Supabase-аар баталгаажсаны дараа л cache-д орно.
 */
export function authCacheTtlSeconds(token: string, nowMs: number): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as {
      exp?: unknown;
    };
    if (typeof payload.exp !== 'number') return AUTH_CACHE_MAX_TTL_SECONDS;
    const remaining = Math.floor(payload.exp - nowMs / 1000);
    return Math.max(0, Math.min(AUTH_CACHE_MAX_TTL_SECONDS, remaining));
  } catch {
    return AUTH_CACHE_MAX_TTL_SECONDS;
  }
}

@Injectable()
export class TenantCacheService {
  private readonly logger = new Logger(TenantCacheService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    // Phase 4.8.4: tenants (app_user-д эрхгүй) + membership — системийн холболт
    private readonly prisma: SystemPrismaService,
  ) {}

  async getTenantId(slug: string): Promise<string | null> {
    const cacheKey = `${CACHE_PREFIX}${slug}`;

    // 1. Redis cache шалгах
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return cached;
    }

    // 2. DB-ээс авах (bypass RLS — system call)
    try {
      const tenant = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM tenants WHERE slug = ${slug} AND is_active = true LIMIT 1
      `;

      if (!tenant.length) {
        this.logger.warn(`Tenant slug "${slug}" олдсонгүй`);
        return null;
      }

      const tenantId = tenant[0].id;

      // 3. Redis-д cache хийх
      await this.redis.setex(cacheKey, CACHE_TTL_SECONDS, tenantId);

      return tenantId;
    } catch (err) {
      this.logger.error(`Tenant lookup алдаа: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * SEC-001: Хэрэглэгч (Supabase authId) тухайн tenant-д идэвхтэй гишүүн эсэх.
   * core_users-д FORCE RLS байгаа тул RULE-04: set_config + query нэг $transaction дотор.
   * DB алдаа → false (fail closed), cache хийхгүй.
   */
  async isMember(tenantId: string, authId: string): Promise<boolean> {
    const cacheKey = `${MEMBER_PREFIX}${tenantId}:${authId}`;

    const cached = await this.redis.get(cacheKey);
    if (cached === '1') return true;
    if (cached === '0') return false;

    let member: boolean;
    try {
      const rows = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
        return tx.$queryRaw<{ ok: number }[]>`
          SELECT 1 AS ok FROM core_users
          WHERE tenant_id = ${tenantId}::uuid AND auth_id = ${authId}::uuid AND is_active = true
          LIMIT 1
        `;
      });
      member = rows.length > 0;
    } catch (err) {
      this.logger.error(`Membership lookup алдаа: ${(err as Error).message}`);
      return false;
    }

    await this.redis.setex(
      cacheKey,
      member ? MEMBER_TTL_SECONDS : NON_MEMBER_TTL_SECONDS,
      member ? '1' : '0',
    );
    return member;
  }

  /**
   * PERF-003: Баталгаажсан token-ийн хэрэглэгч (cache). Redis алдаа → null
   * (guard Supabase-аар шууд шалгана — аюулгүй тал руу).
   */
  async getCachedAuthUser(token: string): Promise<CachedAuthUser | null> {
    try {
      const value = await this.redis.get(`${AUTH_PREFIX}${hashToken(token)}`);
      return value ? (JSON.parse(value) as CachedAuthUser) : null;
    } catch (err) {
      this.logger.warn(`Auth cache унших алдаа: ${(err as Error).message}`);
      return null;
    }
  }

  /** Supabase-аар баталгаажсан хэрэглэгчийг cache-д хадгална (TTL ≤ 60с, token-ийн exp-ээс хэтрэхгүй) */
  async cacheAuthUser(token: string, user: CachedAuthUser): Promise<void> {
    const ttl = authCacheTtlSeconds(token, Date.now());
    if (ttl <= 0) return;
    try {
      await this.redis.setex(`${AUTH_PREFIX}${hashToken(token)}`, ttl, JSON.stringify(user));
    } catch (err) {
      this.logger.warn(`Auth cache бичих алдаа: ${(err as Error).message}`);
    }
  }

  /** Хэрэглэгчийг идэвхгүй болгох / tenant-аас хасах үед дуудна */
  /**
   * v0.2.2 D-06: `must_change_password` (гишүүн гэдгийг isMember шалгасны ДАРАА дуудна).
   * DB алдаа → false (fail-open: нэвтрэлтийг хаахгүй; хамгаалалт = нууц үг өөрөө).
   */
  async mustChangePassword(tenantId: string, authId: string): Promise<boolean> {
    const cacheKey = `${PWCHANGE_PREFIX}${tenantId}:${authId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached === '1') return true;
    if (cached === '0') return false;
    let must = false;
    try {
      const rows = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
        return tx.$queryRaw<{ must: boolean }[]>`
          SELECT must_change_password AS must FROM core_users
          WHERE tenant_id = ${tenantId}::uuid AND auth_id = ${authId}::uuid AND is_active = true
          LIMIT 1
        `;
      });
      must = rows[0]?.must === true;
    } catch (err) {
      this.logger.error(`must_change_password lookup алдаа: ${(err as Error).message}`);
      return false;
    }
    await this.redis.setex(cacheKey, PWCHANGE_TTL_SECONDS, must ? '1' : '0');
    return must;
  }

  async invalidateMember(tenantId: string, authId: string): Promise<void> {
    await this.redis.del(`${MEMBER_PREFIX}${tenantId}:${authId}`, `${PWCHANGE_PREFIX}${tenantId}:${authId}`);
  }

  async invalidate(slug: string): Promise<void> {
    await this.redis.del(`${CACHE_PREFIX}${slug}`);
  }
}
