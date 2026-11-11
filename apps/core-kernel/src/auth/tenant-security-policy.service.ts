import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { AppError } from '../common/i18n/app-error';
import { SystemPrismaService } from '../db/system-prisma.service';
import { REDIS_CLIENT } from '../db/redis.module';
import { L1Cache, l1TtlSeconds } from '../common/cache/l1-cache';

export interface TenantSecurityPolicy {
  passwordMinLength: number;
  loginFailureLimit: number;
  loginLockoutMinutes: number;
  sessionDurationMinutes: number;
}

export const DEFAULT_TENANT_SECURITY_POLICY: TenantSecurityPolicy = {
  passwordMinLength: 12,
  loginFailureLimit: 10,
  loginLockoutMinutes: 15,
  sessionDurationMinutes: 0,
};

const CACHE_TTL_SECONDS = 30;
const CACHE_PREFIX = 'tenant:security-policy:';

@Injectable()
export class TenantSecurityPolicyService {
  private readonly logger = new Logger(TenantSecurityPolicyService.name);
  /** #32: процесс доторх cache (≤ 30 с) — хүсэлт бүрийн Redis `GET`-ийг багасгана */
  private readonly l1 = new L1Cache<TenantSecurityPolicy>(l1TtlSeconds() * 1000);

  constructor(
    private readonly system: SystemPrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async get(tenantId: string): Promise<TenantSecurityPolicy> {
    const key = `${CACHE_PREFIX}${tenantId}`;
    const hit = this.l1.get(key);
    if (hit) return hit;
    try {
      const cached = await this.redis.get(key);
      if (cached) {
        const parsed = JSON.parse(cached) as TenantSecurityPolicy;
        if (this.isPolicy(parsed)) {
          this.l1.set(key, parsed);
          return parsed;
        }
        this.logger.warn(`Security policy cache буруу бүтэцтэй — tenant=${tenantId}`);
      }
    } catch (error) {
      this.logger.warn(`Security policy cache уншилт алдаа — tenant=${tenantId}: ${(error as Error).message}`);
    }

    let rows: {
      password_min_length: number;
      login_failure_limit: number;
      login_lockout_minutes: number;
      session_duration_minutes: number;
    }[];
    try {
      rows = await this.system.$queryRaw<{
        password_min_length: number;
        login_failure_limit: number;
        login_lockout_minutes: number;
        session_duration_minutes: number;
      }[]>`
        SELECT password_min_length, login_failure_limit, login_lockout_minutes, session_duration_minutes
        FROM core_tenant_settings
        WHERE tenant_id = ${tenantId}::uuid
        LIMIT 1`;
    } catch (error) {
      this.logger.error(`Security policy DB уншилт алдаа — tenant=${tenantId}: ${(error as Error).message}`);
      throw new AppError(503, 'auth.service_unavailable');
    }
    const row = rows[0];
    const policy = row
      ? {
          passwordMinLength: row.password_min_length,
          loginFailureLimit: row.login_failure_limit,
          loginLockoutMinutes: row.login_lockout_minutes,
          sessionDurationMinutes: row.session_duration_minutes,
        }
      : DEFAULT_TENANT_SECURITY_POLICY;
    try {
      await this.redis.setex(key, CACHE_TTL_SECONDS, JSON.stringify(policy));
      this.l1.set(key, policy, CACHE_TTL_SECONDS * 1000);
    } catch (error) {
      this.logger.warn(`Security policy cache бичилт алдаа — tenant=${tenantId}: ${(error as Error).message}`);
    }
    return policy;
  }

  async invalidate(tenantId: string): Promise<void> {
    this.l1.delete(`${CACHE_PREFIX}${tenantId}`);
    try {
      await this.redis.del(`${CACHE_PREFIX}${tenantId}`);
    } catch (error) {
      this.logger.warn(`Security policy cache цэвэрлэгээ алдаа — tenant=${tenantId}: ${(error as Error).message}`);
    }
  }

  private isPolicy(value: unknown): value is TenantSecurityPolicy {
    if (typeof value !== 'object' || value === null) return false;
    const policy = value as Record<keyof TenantSecurityPolicy, unknown>;
    return (
      Number.isInteger(policy.passwordMinLength) &&
      Number(policy.passwordMinLength) >= 6 &&
      Number(policy.passwordMinLength) <= 72 &&
      Number.isInteger(policy.loginFailureLimit) &&
      Number(policy.loginFailureLimit) >= 3 &&
      Number(policy.loginFailureLimit) <= 20 &&
      Number.isInteger(policy.loginLockoutMinutes) &&
      Number(policy.loginLockoutMinutes) >= 1 &&
      Number(policy.loginLockoutMinutes) <= 1440 &&
      Number.isInteger(policy.sessionDurationMinutes) &&
      Number(policy.sessionDurationMinutes) >= 0 &&
      Number(policy.sessionDurationMinutes) <= 43200
    );
  }
}
