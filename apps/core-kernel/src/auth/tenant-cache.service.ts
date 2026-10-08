import { Injectable, Inject, Logger } from '@nestjs/common';
import { REDIS_CLIENT } from '../db/redis.module';
import Redis from 'ioredis';
import { PrismaTenantClientService } from '../db/prisma-tenant-client.service';

const CACHE_TTL_SECONDS = 300; // 5 минут
const CACHE_PREFIX = 'tenant:slug:';

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

  async invalidate(slug: string): Promise<void> {
    await this.redis.del(`${CACHE_PREFIX}${slug}`);
  }
}
