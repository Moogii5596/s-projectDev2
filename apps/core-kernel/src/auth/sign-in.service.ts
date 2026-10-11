import { HttpStatus, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../db/redis.module';
import { SystemPrismaService } from '../db/system-prisma.service';
import { parseDeploymentConfig, DeploymentConfig } from '../config/deployment-mode';
import { AppError } from '../common/i18n/app-error';
import { TenantCacheService } from './tenant-cache.service';
import { resolveTenantSlug } from './tenant-slug';
import { LoginIdentifier, maskPhone, parseLoginIdentifier } from './login-identifier';

export interface SignInSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  expiresAt: number | null;
  tokenType: string;
  mustChangePassword: boolean;
}

interface LoginUser {
  authId: string;
  email: string;
  mustChangePassword: boolean;
}

/**
 * Зөвхөн АМЖИЛТГҮЙ оролдлогыг тоолно (амжилттай нэвтрэлт нэвтрэх нэрийн тоолуурыг тэглэнэ):
 *   нэвтрэх нэр × байгууллага: 15 минутад 10 амжилтгүй; IP: 5 минутад 50 амжилтгүй.
 * Шалтгаан: кемпийн нэг WiFi/NAT-аас өглөө олон ажилтан зэрэг нэвтэрнэ (амжилттайг тоолбол 429).
 * IP-ийг зөвхөн Caddy-ийн `X-Real-IP`-тэй (бодит) үед тоолно. Үндсэн хамгаалалт = GoTrue-ийн бүртгэлийн түгжээ (PIL-07).
 */
export const SIGN_IN_LIMITS = {
  identifier: { limit: 10, ttlSec: 15 * 60 },
  ip: { limit: 50, ttlSec: 5 * 60 },
} as const;

const invalid = () => new AppError(HttpStatus.UNAUTHORIZED, 'auth.invalid_credentials');
const tooMany = () => new AppError(HttpStatus.TOO_MANY_REQUESTS, 'auth.too_many_attempts');
const unavailable = () => new AppError(HttpStatus.SERVICE_UNAVAILABLE, 'auth.service_unavailable');

/**
 * GoTrue хүрэх боломжгүй: supabase-js throw хийхгүй, `AuthRetryableFetchError` (status 0/байхгүй) буцаадаг —
 * үүнийг "нууц үг буруу" (401) гэж харуулбал төөрөгдүүлнэ → 503. Буруу нууц үг = 400.
 */
export const isAuthServiceDown = (e: { status?: number; name?: string }) =>
  e.name === 'AuthRetryableFetchError' || !e.status || e.status >= 500;

/**
 * v0.2.2 Блок 2 (D-10) — server-ээр нэвтрүүлэх: утас / username / имэйл → Supabase Auth (password grant) → session.
 *
 * - Хэрэглэгч байгаа эсэх, имэйл, утас юу ч гадагш гарахгүй: байхгүй / идэвхгүй / буруу нууц үг → ИЖИЛ 401.
 *   Байхгүй хэрэглэгчид ч GoTrue-г хуурамч `.invalid` хаягаар дуудна (хугацааны зөрүүгээр задрахгүй).
 * - Tenant = Host (эсвэл dedicated) — TenantAuthGuard-тай нэг дүрэм (`resolveTenantSlug`).
 * - GoTrue-ийн бүртгэлийн түгжээ (v0.2.1 PIL-07 hook, 429) хэвээр үйлчилнэ.
 */
@Injectable()
export class SignInService {
  private readonly logger = new Logger(SignInService.name);
  private readonly deployment: DeploymentConfig;

  constructor(
    private readonly config: ConfigService,
    private readonly system: SystemPrismaService,
    private readonly tenantCache: TenantCacheService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    /** Тест: GoTrue client-ийг орлуулах */
    @Optional() @Inject('SIGN_IN_GOTRUE_FACTORY') private readonly gotrueFactory?: () => SupabaseClient,
  ) {
    this.deployment = parseDeploymentConfig({
      DEPLOYMENT_MODE: this.config?.get<string>('DEPLOYMENT_MODE') ?? process.env['DEPLOYMENT_MODE'],
      DEDICATED_TENANT_SLUG: this.config?.get<string>('DEDICATED_TENANT_SLUG') ?? process.env['DEDICATED_TENANT_SLUG'],
    });
  }

  /** Хүсэлт бүрт шинэ, session хадгалдаггүй anon client (хэрэглэгч хооронд төлөв хуваалцахгүй) */
  private gotrue(): SupabaseClient {
    if (this.gotrueFactory) return this.gotrueFactory();
    return createClient(
      this.config?.get<string>('SUPABASE_URL') ?? process.env['SUPABASE_URL'] ?? 'https://mock.supabase.co',
      this.config?.get<string>('SUPABASE_ANON_KEY') ?? process.env['SUPABASE_ANON_KEY'] ?? 'mock-anon-key',
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );
  }

  private static hash(v: string): string {
    return createHash('sha256').update(v).digest('hex').slice(0, 32);
  }

  private static keys(tenantKey: string, identifier: string, clientIp: string | undefined) {
    return {
      id: `signin:fail:id:${tenantKey}:${SignInService.hash(identifier)}`,
      ip: clientIp ? `signin:fail:ip:${SignInService.hash(clientIp)}` : null,
    };
  }

  /** Redis алдаа → fail-open (TenantRateLimitGuard-тай ижил) */
  private async safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      this.logger.warn(`sign-in limiter Redis алдаа — fail-open: ${(err as Error).message}`);
      return fallback;
    }
  }

  /** Өмнөх амжилтгүй оролдлого босгонд хүрсэн бол GoTrue дуудахгүй 429 */
  private async assertNotLimited(k: { id: string; ip: string | null }): Promise<void> {
    const [byId, byIp] = await this.safe(
      async () => Promise.all([this.redis.get(k.id), k.ip ? this.redis.get(k.ip) : Promise.resolve(null)]),
      [null, null] as (string | null)[],
    );
    if (Number(byId ?? 0) >= SIGN_IN_LIMITS.identifier.limit || Number(byIp ?? 0) >= SIGN_IN_LIMITS.ip.limit) throw tooMany();
  }

  private async recordFailure(k: { id: string; ip: string | null }): Promise<void> {
    await this.safe(async () => {
      for (const [key, ttl] of [[k.id, SIGN_IN_LIMITS.identifier.ttlSec], [k.ip, SIGN_IN_LIMITS.ip.ttlSec]] as const) {
        if (!key) continue;
        const n = await this.redis.incr(key);
        if (n === 1) await this.redis.pexpire(key, ttl * 1000);
      }
    }, undefined);
  }

  /** Идэвхтэй хэрэглэгчийг нэвтрэх нэрээр (RLS-ийг тойрох системийн холболт — tenant шүүлт ЗААВАЛ) */
  async findLoginUser(tenantId: string, id: LoginIdentifier): Promise<LoginUser | null> {
    type Row = { auth_id: string; email: string; must_change_password: boolean };
    const pick = (rows: Row[]) => (rows.length === 1 ? { authId: rows[0].auth_id, email: rows[0].email, mustChangePassword: rows[0].must_change_password } : null);
    if (id.kind === 'email') {
      return pick(await this.system.$queryRaw<Row[]>`
        SELECT auth_id, email, must_change_password FROM core_users
        WHERE tenant_id = ${tenantId}::uuid AND is_active AND lower(email) = ${id.value} LIMIT 2`);
    }
    if (id.kind === 'phone') {
      const byPhone = pick(await this.system.$queryRaw<Row[]>`
        SELECT auth_id, email, must_change_password FROM core_users
        WHERE tenant_id = ${tenantId}::uuid AND is_active AND phone = ${id.value} LIMIT 2`);
      if (byPhone) return byPhone;
      // Тоон username (ажилтны код "10234567") утас шиг харагдаж болно → username-аар дахин
    }
    return pick(await this.system.$queryRaw<Row[]>`
      SELECT auth_id, email, must_change_password FROM core_users
      WHERE tenant_id = ${tenantId}::uuid AND is_active AND username = ${id.value} LIMIT 2`);
  }

  async signIn(host: string | undefined, clientIp: string | undefined, identifier: string, password: string): Promise<SignInSession> {
    const slug = resolveTenantSlug(this.deployment, host);
    const tenantId = slug ? await this.tenantCache.getTenantId(slug) : null;
    const parsed = parseLoginIdentifier(identifier);
    const key = parsed?.value ?? identifier.trim().toLowerCase();
    const lk = SignInService.keys(tenantId ?? 'none', key, clientIp);
    await this.assertNotLimited(lk);

    const user = tenantId && parsed ? await this.findLoginUser(tenantId, parsed) : null;
    // Байхгүй хэрэглэгч: хуурамч хаяг (RFC 2606 .invalid — хэзээ ч бүртгэгдэхгүй) → GoTrue ижил 400 → 401
    const email = user?.email ?? `nouser-${SignInService.hash(`${slug}:${key}`)}@login.invalid`;

    let result: Awaited<ReturnType<SupabaseClient['auth']['signInWithPassword']>>;
    try {
      result = await this.gotrue().auth.signInWithPassword({ email, password });
    } catch (err) {
      this.logger.error(`GoTrue sign-in алдаа: ${(err as Error).message}`);
      throw new AppError(HttpStatus.SERVICE_UNAVAILABLE, 'auth.service_unavailable');
    }
    const { data, error } = result;
    if (error) {
      if (error.status === 429) throw tooMany();
      if (isAuthServiceDown(error)) throw unavailable();
      if (user && parsed?.kind === 'phone') this.logger.log(`sign-in татгалзсан: утас ${maskPhone(parsed.value)}`);
      await this.recordFailure(lk);
      throw invalid();
    }
    // Хамгаалалт: session нь бидний олсон хэрэглэгчийнх биш бол (байх ёсгүй) — токен өгөхгүй
    if (!user || !data.session || data.user?.id !== user.authId) {
      await this.recordFailure(lk);
      throw invalid();
    }
    await this.safe(() => this.redis.del(lk.id), 0);

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: data.session.expires_in,
      expiresAt: data.session.expires_at ?? null,
      tokenType: data.session.token_type,
      mustChangePassword: user.mustChangePassword,
    };
  }

  /**
   * D-06: нууц үг солих. Одоогийн нууц үгийг GoTrue-ээр шалгана (түгжээ үйлчилнэ) → admin API-аар шинэчилнэ →
   * must_change_password = false → membership cache цэвэрлэнэ.
   */
  async changePassword(tenantId: string, authId: string, currentPassword: string, newPassword: string): Promise<{ changed: true }> {
    if (currentPassword === newPassword) throw new AppError(HttpStatus.BAD_REQUEST, 'auth.password_same');
    const rows = await this.system.$queryRaw<{ id: string; email: string }[]>`
      SELECT id, email FROM core_users WHERE tenant_id = ${tenantId}::uuid AND auth_id = ${authId}::uuid AND is_active LIMIT 1`;
    if (rows.length === 0) throw invalid();

    const check = await this.gotrue().auth.signInWithPassword({ email: rows[0].email, password: currentPassword });
    if (check.error) {
      if (check.error.status === 429) throw tooMany();
      if (isAuthServiceDown(check.error)) throw unavailable();
      throw new AppError(HttpStatus.BAD_REQUEST, 'auth.password_current_wrong');
    }
    if (check.data.user?.id !== authId) throw invalid();

    const { error } = await this.admin().auth.admin.updateUserById(authId, { password: newPassword });
    if (error) {
      // GoTrue-ийн нууц үгийн бодлого (урт г.м.) → 400
      if (error.status === 422 || error.status === 400) throw new AppError(HttpStatus.BAD_REQUEST, 'auth.password_weak');
      this.logger.error(`updateUserById алдаа: ${error.message}`);
      throw new AppError(HttpStatus.SERVICE_UNAVAILABLE, 'auth.service_unavailable');
    }
    await this.system.$executeRaw`
      UPDATE core_users SET must_change_password = false, updated_at = now()
      WHERE tenant_id = ${tenantId}::uuid AND id = ${rows[0].id}::uuid`;
    await this.tenantCache.invalidateMember(tenantId, authId);
    return { changed: true };
  }

  private admin(): SupabaseClient {
    if (this.gotrueFactory) return this.gotrueFactory();
    return createClient(
      this.config?.get<string>('SUPABASE_URL') ?? process.env['SUPABASE_URL'] ?? 'https://mock.supabase.co',
      this.config?.get<string>('SUPABASE_SERVICE_ROLE_KEY') ?? process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? 'mock-service-role-key',
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );
  }
}

/**
 * Caddy (127.0.0.1) ард: `X-Real-IP` (Caddy `header_up X-Real-IP {client_ip}`) — зөвхөн loopback-аас ирсэн бол итгэнэ.
 * Loopback + header алга (dev, e2e, vite proxy) → undefined (IP-ээр хязгаарлахгүй; бүх хүсэлт 127.0.0.1 байх тул).
 */
export function clientIpOf(req: { ip?: string; headers: Record<string, string | string[] | undefined> }): string | undefined {
  const loopback = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
  const real = req.headers['x-real-ip'];
  if (loopback) return typeof real === 'string' && real.length > 0 && real.length <= 64 ? real.trim() : undefined;
  return req.ip;
}
