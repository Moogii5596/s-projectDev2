import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../db/redis.module';

@Injectable()
export class TenantRateLimitGuard implements CanActivate {
  private readonly windows = [
    { name: 'short', ttlMs: 1_000, limit: 10 },
    { name: 'medium', ttlMs: 10_000, limit: 50 },
    { name: 'long', ttlMs: 60_000, limit: 200 },
  ];

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Record<string, any>>();
    const response = context.switchToHttp().getResponse<{ header: (name: string, value: string) => void }>();
    const identity = request.user?.tenantId ?? request.ip ?? 'unknown';
    const now = Date.now();

    for (const window of this.windows) {
      const bucket = Math.floor(now / window.ttlMs);
      const key = `rate-limit:${window.name}:${identity}:${bucket}`;
      const count = await this.redis.incr(key);
      if (count === 1) await this.redis.pexpire(key, window.ttlMs);

      if (count > window.limit) {
        const retryAfter = Math.max(1, Math.ceil((window.ttlMs - (now % window.ttlMs)) / 1000));
        response.header('Retry-After', String(retryAfter));
        throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    return true;
  }
}