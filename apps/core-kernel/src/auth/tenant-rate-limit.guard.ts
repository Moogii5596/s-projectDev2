import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../db/redis.module';
import { parseRateLimitConfig } from '../config/rate-limit';

@Injectable()
export class TenantRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(TenantRateLimitGuard.name);
  /** Redis тасарсан үед log-ийг 60 сек тутам нэг л удаа бичнэ */
  private lastFailOpenWarnAt = 0;
  // Phase 3.1: RATE_LIMIT_SHORT/MEDIUM/LONG (default 100/500/2000) — src/config/rate-limit.ts
  private readonly windows = parseRateLimitConfig(process.env);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Record<string, any>>();
    const response = context.switchToHttp().getResponse<{ header: (name: string, value: string) => void }>();
    const identity = request.user?.tenantId ?? request.ip ?? 'unknown';
    const now = Date.now();

    for (const window of this.windows) {
      const bucket = Math.floor(now / window.ttlMs);
      const key = `rate-limit:${window.name}:${identity}:${bucket}`;
      let count: number;
      try {
        count = await this.redis.incr(key);
        if (count === 1) await this.redis.pexpire(key, window.ttlMs);
      } catch (err) {
        // Phase 2.9.2 (A): fail-open — Redis тасарвал бүх API 500 болохоос сэргийлж
        // хүсэлтийг нэвтрүүлнэ (тэр хугацаанд rate limit түр ажиллахгүй).
        if (now - this.lastFailOpenWarnAt > 60_000) {
          this.lastFailOpenWarnAt = now;
          this.logger.warn(`Rate limit Redis алдаа — fail-open: ${(err as Error).message}`);
        }
        return true;
      }

      if (count > window.limit) {
        const retryAfter = Math.max(1, Math.ceil((window.ttlMs - (now % window.ttlMs)) / 1000));
        response.header('Retry-After', String(retryAfter));
        throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    return true;
  }
}