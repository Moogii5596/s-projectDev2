import { HttpStatus, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../db/redis.module';
import { SystemPrismaService } from '../db/system-prisma.service';
import { parseDeploymentConfig, DeploymentConfig } from '../config/deployment-mode';
import { AppError, badRequest } from '../common/i18n/app-error';
import { TenantCacheService } from './tenant-cache.service';
import { resolveTenantSlug } from './tenant-slug';
import { LoginIdentifier, maskPhone, parseLoginIdentifier } from './login-identifier';
import { SessionRevokeService } from './session-revoke.service';
import { DEFAULT_TENANT_SECURITY_POLICY, TenantSecurityPolicyService } from './tenant-security-policy.service';
import { LoginLockService, minutesUntil } from './login-lock.service';

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
 * IP-ийг зөвхөн Caddy-ийн `X-Real-IP`-тэй (бодит) үед тоолно. Үндсэн хамгаалалт = бүртгэлийн түгжээ (`LoginLockService`, v0.2.5 H1).
 */
export const SIGN_IN_LIMITS = {
  identifier: { limit: 10, ttlSec: 15 * 60 },
  ip: { limit: 50, ttlSec: 5 * 60 },
} as const;
type FailureLimit = { limit: number; ttlSec: number };

const invalid = () => new AppError(HttpStatus.UNAUTHORIZED, 'auth.invalid_credentials');
const tooMany = () => new AppError(HttpStatus.TOO_MANY_REQUESTS, 'auth.too_many_attempts');
/** v0.2.5 #27: Turnstile token алга / хүчингүй / хугацаа дууссан (GoTrue `captcha_failed`) — нууц үгийн оролдлогод тоологдохгүй */
const captchaFailed = () => new AppError(HttpStatus.BAD_REQUEST, 'auth.captcha_failed');
const isCaptchaFailure = (e: { code?: string; message?: string }) =>
  e.code === 'captcha_failed' || /captcha/i.test(e.message ?? '');
const unavailable = () => new AppError(HttpStatus.SERVICE_UNAVAILABLE, 'auth.service_unavailable');
/** v0.2.5 H1: бүртгэл түгжигдсэн — `params.minutes` (мессежид), `params.until` (ISO) */
const accountLocked = (until: Date) =>
  new AppError(HttpStatus.TOO_MANY_REQUESTS, 'auth.account_locked', { minutes: minutesUntil(until), until: until.toISOString() });

/**
 * GoTrue хүрэх боломжгүй: supabase-js throw хийхгүй, `AuthRetryableFetchError` (status 0/байхгүй) буцаадаг —
 * үүнийг "нууц үг буруу" (401) гэж харуулбал төөрөгдүүлнэ → 503. Буруу нууц үг = 400.
 */
const isAuthServiceDown = (e: { status?: number; name?: string }) =>
  e.name === 'AuthRetryableFetchError' || !e.status || e.status >= 500;

/**
 * v0.2.2 Блок 2 (D-10) — server-ээр нэвтрүүлэх: утас / username / имэйл → Supabase Auth (password grant) → session.
 *
 * - Хэрэглэгч байгаа эсэх, имэйл, утас юу ч гадагш гарахгүй: байхгүй / идэвхгүй / буруу нууц үг → ИЖИЛ 401.
 *   Байхгүй хэрэглэгчид ч GoTrue-г хуурамч `.invalid` хаягаар дуудна (хугацааны зөрүүгээр задрахгүй).
 * - Tenant = Host (эсвэл dedicated) — TenantAuthGuard-тай нэг дүрэм (`resolveTenantSlug`).
 * - v0.2.5 H1 (#16): бүртгэлийн түгжээ = `LoginLockService` (15 мин-д 5 буруу → 15 мин, env-ээр) — GoTrue дуудахаас ӨМНӨ шалгана.
 *   Self-hosted GoTrue hook (PIL-07) асаалттай бол (`AUTH_LOCK_GOTRUE_HOOK=true`) тоолохыг hook-д үлдээнэ.
 */
@Injectable()
export class SignInService {
  private readonly logger = new Logger(SignInService.name);
  private readonly deployment: DeploymentConfig;

  constructor(
    private readonly config: ConfigService,
    private readonly system: SystemPrismaService,
    private readonly tenantCache: TenantCacheService,
    private readonly securityPolicy: TenantSecurityPolicyService,
    private readonly loginLock: LoginLockService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    /** Тест: GoTrue client-ийг орлуулах */
    @Optional() @Inject('SIGN_IN_GOTRUE_FACTORY') private readonly gotrueFactory?: () => SupabaseClient,
    /** PIL-15: нууц үг солиход бусад session цуцлах (unit тест_session-гүй орчинд алдаа → log) */
    @Optional() private readonly sessions?: SessionRevokeService,
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
  private async assertNotLimited(
    k: { id: string; ip: string | null },
    identifierLimit: FailureLimit = SIGN_IN_LIMITS.identifier,
  ): Promise<void> {
    const [byId, byIp] = await this.safe(
      async () => Promise.all([this.redis.get(k.id), k.ip ? this.redis.get(k.ip) : Promise.resolve(null)]),
      [null, null] as (string | null)[],
    );
    if (Number(byId ?? 0) >= identifierLimit.limit || Number(byIp ?? 0) >= SIGN_IN_LIMITS.ip.limit) throw tooMany();
  }

  private async recordFailure(
    k: { id: string; ip: string | null },
    identifierLimit: FailureLimit = SIGN_IN_LIMITS.identifier,
  ): Promise<void> {
    await this.safe(async () => {
      for (const [key, ttl] of [[k.id, identifierLimit.ttlSec], [k.ip, SIGN_IN_LIMITS.ip.ttlSec]] as const) {
        if (!key) continue;
        const n = await this.redis.incr(key);
        if (n === 1) await this.redis.pexpire(key, ttl * 1000);
      }
    }, undefined);
  }

  /** Түгжээтэй бүртгэл → GoTrue дуудахгүй 429 (зөв нууц үгтэй ч). DB алдаа → 503 (fail-closed) */
  private async assertAccountNotLocked(authId: string): Promise<void> {
    let until: Date | null;
    try {
      until = await this.loginLock.lockedUntil(authId);
    } catch (err) {
      this.logger.error(`login lock шалгахад алдаа: ${(err as Error).message}`);
      throw unavailable();
    }
    if (until) throw accountLocked(until);
  }

  /**
   * Бүртгэлийн буруу оролдлого тоолох (hook асаалттай бол hook тоолно). Энэ оролдлогоор түгжигдсэн бол шууд 429
   * (хэрэглэгч хэдэн минут хүлээхээ мэднэ). DB алдаа → log, дуудагчийн алдаа (401/400) хэвээр.
   */
  private async recordAccountFailure(authId: string): Promise<void> {
    if (this.loginLock.rules.gotrueHook) return;
    let until: Date | null = null;
    try {
      until = await this.loginLock.recordFailure(authId);
    } catch (err) {
      this.logger.error(`login lock тоолоход алдаа: ${(err as Error).message}`);
    }
    if (until) throw accountLocked(until);
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

  /** Host / dedicated → tenantId (TenantAuthGuard-тай нэг дүрэм) */
  async tenantIdFromHost(host: string | undefined): Promise<string | null> {
    const slug = resolveTenantSlug(this.deployment, host);
    return slug ? this.tenantCache.getTenantId(slug) : null;
  }

  async signIn(host: string | undefined, clientIp: string | undefined, identifier: string, password: string, captchaToken?: string): Promise<SignInSession> {
    const slug = resolveTenantSlug(this.deployment, host);
    const tenantId = slug ? await this.tenantCache.getTenantId(slug) : null;
    const policy = tenantId ? await this.securityPolicy.get(tenantId) : DEFAULT_TENANT_SECURITY_POLICY;
    const identifierLimit = {
      limit: policy.loginFailureLimit,
      ttlSec: policy.loginLockoutMinutes * 60,
    };
    const parsed = parseLoginIdentifier(identifier);
    const key = parsed?.value ?? identifier.trim().toLowerCase();
    const lk = SignInService.keys(tenantId ?? 'none', key, clientIp);
    await this.assertNotLimited(lk, identifierLimit);

    const user = tenantId && parsed ? await this.findLoginUser(tenantId, parsed) : null;
    if (user) await this.assertAccountNotLocked(user.authId);
    // Байхгүй хэрэглэгч: хуурамч хаяг (RFC 2606 .invalid — хэзээ ч бүртгэгдэхгүй) → GoTrue ижил 400 → 401
    const email = user?.email ?? `nouser-${SignInService.hash(`${slug}:${key}`)}@login.invalid`;

    let result: Awaited<ReturnType<SupabaseClient['auth']['signInWithPassword']>>;
    try {
      result = await this.gotrue().auth.signInWithPassword({ email, password, options: captchaToken ? { captchaToken } : undefined });
    } catch (err) {
      this.logger.error(`GoTrue sign-in алдаа: ${(err as Error).message}`);
      throw new AppError(HttpStatus.SERVICE_UNAVAILABLE, 'auth.service_unavailable');
    }
    const { data, error } = result;
    if (error) {
      if (error.status === 429) throw tooMany();
      if (isAuthServiceDown(error)) throw unavailable();
      if (isCaptchaFailure(error)) throw captchaFailed();
      if (user && parsed?.kind === 'phone') this.logger.log(`sign-in татгалзсан: утас ${maskPhone(parsed.value)}`);
      await this.recordFailure(lk, identifierLimit);
      if (user) await this.recordAccountFailure(user.authId);
      throw invalid();
    }
    // Хамгаалалт: session нь бидний олсон хэрэглэгчийнх биш бол (байх ёсгүй) — токен өгөхгүй
    if (!user || !data.session || data.user?.id !== user.authId) {
      await this.recordFailure(lk, identifierLimit);
      throw invalid();
    }
    await this.safe(() => this.redis.del(lk.id), 0);
    await this.loginLock.reset(user.authId);

    // PIL-16: сүүлийн амжилттай нэвтрэлтийн огноо (алдаа → зөвхөн log, нэвтрэлтийг зогсоохгүй)
    if (tenantId) {
      try {
        await this.system.$executeRaw`
          UPDATE core_users SET last_sign_in_at = now()
          WHERE tenant_id = ${tenantId}::uuid AND auth_id = ${user.authId}::uuid`;
      } catch (err) {
        this.logger.warn(`last_sign_in_at бичихэд алдаа: ${(err as Error).message}`);
      }
    }

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
   * D-06: нууц үг солих. Одоогийн нууц үгийг GoTrue-ээр шалгана (түгжээ үйлчилнэ) → шинэчилнэ →
   * must_change_password = false → membership cache цэвэрлэнэ.
   *
   * PIL-15 / D-1 (OPS-013): GoTrue нууц үг солиход дуудагчийн session-оос БУСАД бүгдийг устгадаг (admin API бүгдийг нь).
   * Тиймээс хэрэглэгчийн ӨӨРИЙН access token-оор (`PUT /auth/v1/user`) солино → одоогийн төхөөрөмж логинтой үлдэнэ.
   * Шалгалтын `signInWithPassword` үүсгэсэн нэмэлт session-ыг цэвэрлэнэ (төхөөрөмжийн жагсаалтад «сүнс» гарахгүй).
   * `accessToken` алга (тооцоолоогүй) → admin API (бүх session устна).
   */
  async changePassword(
    tenantId: string,
    authId: string,
    currentPassword: string,
    newPassword: string,
    accessToken: string | null = null,
    captchaToken?: string,
  ): Promise<{ changed: true }> {
    if (currentPassword === newPassword) throw new AppError(HttpStatus.BAD_REQUEST, 'auth.password_same');
    const policy = await this.securityPolicy.get(tenantId);
    if (newPassword.length < policy.passwordMinLength) {
      throw badRequest('auth.password_min_length', { min: policy.passwordMinLength });
    }
    const rows = await this.system.$queryRaw<{ id: string; email: string }[]>`
      SELECT id, email FROM core_users WHERE tenant_id = ${tenantId}::uuid AND auth_id = ${authId}::uuid AND is_active LIMIT 1`;
    if (rows.length === 0) throw invalid();
    // H1: одоогийн нууц үгийн шалгалт = нууц үг таах өөр зам → ижил түгжээ
    await this.assertAccountNotLocked(authId);

    const check = await this.gotrue().auth.signInWithPassword({
      email: rows[0].email,
      password: currentPassword,
      options: captchaToken ? { captchaToken } : undefined,
    });
    if (check.error) {
      if (check.error.status === 429) throw tooMany();
      if (isAuthServiceDown(check.error)) throw unavailable();
      if (isCaptchaFailure(check.error)) throw captchaFailed();
      await this.recordAccountFailure(authId);
      throw new AppError(HttpStatus.BAD_REQUEST, 'auth.password_current_wrong');
    }
    if (check.data.user?.id !== authId) throw invalid();
    await this.loginLock.reset(authId);
    // Шалгалтын session — амжилттай бол GoTrue өөрөө устгана; алдаатай бол доор гараар
    const verifySessionId = SessionRevokeService.sessionIdFromJwt(check.data.session?.access_token);

    const failure = accessToken ? await this.updateOwnPassword(accessToken, newPassword) : await this.updatePasswordAsAdmin(authId, newPassword);
    if (failure) {
      await this.sessions?.dropQuietly(authId, verifySessionId);
      // GoTrue-ийн нууц үгийн бодлого (урт г.м.) → 400
      if (failure.status === 422 || failure.status === 400) throw new AppError(HttpStatus.BAD_REQUEST, 'auth.password_weak');
      this.logger.error(`нууц үг солих алдаа (${failure.status}): ${failure.message}`);
      throw new AppError(HttpStatus.SERVICE_UNAVAILABLE, 'auth.service_unavailable');
    }
    await this.system.$executeRaw`
      UPDATE core_users SET must_change_password = false, updated_at = now()
      WHERE tenant_id = ${tenantId}::uuid AND id = ${rows[0].id}::uuid`;
    await this.tenantCache.invalidateMember(tenantId, authId);
    return { changed: true };
  }

  /** Хэрэглэгчийн өөрийн токеноор — дуудагчийн session үлдэнэ. Алдаа → {status,message}, амжилт → null */
  private async updateOwnPassword(accessToken: string, password: string): Promise<{ status: number; message: string } | null> {
    const base = this.config?.get<string>('SUPABASE_URL') ?? process.env['SUPABASE_URL'] ?? 'https://mock.supabase.co';
    const anon = this.config?.get<string>('SUPABASE_ANON_KEY') ?? process.env['SUPABASE_ANON_KEY'] ?? 'mock-anon-key';
    let res: Response;
    try {
      res = await fetch(`${base.replace(/\/$/, '')}/auth/v1/user`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ password }),
      });
    } catch (err) {
      return { status: 503, message: (err as Error).message };
    }
    if (res.ok) return null;
    const body = (await res.json().catch(() => null)) as { msg?: string; message?: string } | null;
    return { status: res.status, message: body?.msg ?? body?.message ?? res.statusText };
  }

  private async updatePasswordAsAdmin(authId: string, password: string): Promise<{ status: number; message: string } | null> {
    const { error } = await this.admin().auth.admin.updateUserById(authId, { password });
    return error ? { status: error.status ?? 503, message: error.message } : null;
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
