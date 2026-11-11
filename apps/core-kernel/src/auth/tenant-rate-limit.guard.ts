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

/**
 * #32: бүх цонхыг НЭГ `EVAL`-аар (өмнө нь цонх бүрт `INCR` + шинэ цонхонд `PEXPIRE` → хүсэлт бүрт 3–6 команд).
 * KEYS = цонх бүрийн түлхүүр, ARGV = ижил дараалалтай TTL (ms). Буцаах = тоолуурууд.
 */
export const RATE_LIMIT_LUA = `
local out = {}
for i, key in ipairs(KEYS) do
  local n = redis.call('INCR', key)
  if n == 1 then redis.call('PEXPIRE', key, ARGV[i]) end
  out[i] = n
end
return out`;

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

    const keys = this.windows.map((w) => `rate-limit:${w.name}:${identity}:${Math.floor(now / w.ttlMs)}`);
    let counts: number[];
    try {
      counts = (await this.redis.eval(RATE_LIMIT_LUA, keys.length, ...keys, ...this.windows.map((w) => String(w.ttlMs)))) as number[];
    } catch (err) {
      // Phase 2.9.2 (A): fail-open — Redis тасарвал бүх API 500 болохоос сэргийлж
      // хүсэлтийг нэвтрүүлнэ (тэр хугацаанд rate limit түр ажиллахгүй).
      if (now - this.lastFailOpenWarnAt > 60_000) {
        this.lastFailOpenWarnAt = now;
        this.logger.warn(`Rate limit Redis алдаа — fail-open: ${(err as Error).message}`);
      }
      return true;
    }

    for (const [i, window] of this.windows.entries()) {
      if (Number(counts[i]) > window.limit) {
        const retryAfter = Math.max(1, Math.ceil((window.ttlMs - (now % window.ttlMs)) / 1000));
        response.header('Retry-After', String(retryAfter));
        throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    return true;
  }
}