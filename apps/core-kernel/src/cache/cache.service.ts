import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../db/redis.module';

@Injectable()
export class CacheService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  buildKey(module: string, tenantId: string, resource: string, id?: string): string {
    return id
      ? `cache:${module}:${tenantId}:${resource}:${id}`
      : `cache:${module}:${tenantId}:${resource}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    return value === null ? null : (JSON.parse(value) as T);
  }

  async set<T>(key: string, value: T, ttlSeconds = 300): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async invalidateTenant(tenantId: string): Promise<void> {
    const stream = this.redis.scanStream({ match: `cache:*:${tenantId}:*`, count: 100 });
    const keys: string[] = [];

    for await (const batch of stream) {
      keys.push(...(batch as string[]));
    }

    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}