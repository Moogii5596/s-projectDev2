import { Injectable, Inject, Logger } from '@nestjs/common';
import { REDIS_CLIENT } from '../db/redis.module';
import Redis from 'ioredis';
import { PrismaTenantClientService } from '../db/prisma-tenant-client.service';

const CACHE_TTL_SECONDS = 300; // 5 минут
const CACHE_PREFIX = 'tenant:slug:';
// SEC-001: membership cache — эерэг 5 мин, сөрөг 30 сек (шинэ урилга хурдан идэвхжинэ)
const MEMBER_PREFIX = 'tenant:member:';
const MEMBER_TTL_SECONDS = 300;
const NON_MEMBER_TTL_SECONDS = 30;

@Injectable()
export class TenantCacheService {
  private readonly logger = new Logger(TenantCacheService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly prisma: PrismaTenantClientService,
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

  /** Хэрэглэгчийг идэвхгүй болгох / tenant-аас хасах үед дуудна */
  async invalidateMember(tenantId: string, authId: string): Promise<void> {
    await this.redis.del(`${MEMBER_PREFIX}${tenantId}:${authId}`);
  }

  async invalidate(slug: string): Promise<void> {
    await this.redis.del(`${CACHE_PREFIX}${slug}`);
  }
}
