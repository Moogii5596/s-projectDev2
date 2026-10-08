import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import { TenantCacheService } from './tenant-cache.service';
import { IS_PUBLIC_KEY } from '../common/decorators/skip-auth.decorator';
import { DeploymentConfig, parseDeploymentConfig } from '../config/deployment-mode';

/**
 * PERF-003: Supabase Auth өөрөө ажиллахгүй байгаа (сүлжээ, timeout, 5xx) эсэх.
 * Ийм үед 401 биш 503 — хүчинтэй token-тэй хэрэглэгчийг системээс гаргахгүй.
 * auth-js: сүлжээ → AuthRetryableFetchError (status 0), 502/503/504 → retryable, бусад 5xx → status ≥ 500.
 */
export function isAuthServiceError(error: { name?: string; status?: number } | null | undefined): boolean {
  if (!error) return false;
  // status-гүй бусад алдаа → 401 хэвээр (сервисийн алдаа гэж таамаглахгүй)
  return error.name === 'AuthRetryableFetchError' || error.status === 0 || (error.status ?? 0) >= 500;
}

@Injectable()
export class TenantAuthGuard implements CanActivate {
  private readonly logger = new Logger(TenantAuthGuard.name);
  private readonly deployment: DeploymentConfig;
  /** PERF-003: нэг client-ийг дахин ашиглана (өмнө нь хүсэлт бүрт шинээр + autoRefresh timer) */
  private supabase: SupabaseClient | null = null;
  /** PERF-003: single-flight — ижил token-ийн зэрэгцээ cache miss нэг л Supabase дуудлага хийнэ */
  private readonly inflight = new Map<string, Promise<{ id: string; email?: string }>>();

  constructor(
    private readonly configService: ConfigService,
    private readonly tenantCacheService: TenantCacheService,
    private readonly reflector: Reflector,
  ) {
    // ADR-001: буруу тохиргоо → startup дээр алдаа (EnvConfig-тэй ижил функц)
    this.deployment = parseDeploymentConfig({
      DEPLOYMENT_MODE:
        this.configService?.get<string>('DEPLOYMENT_MODE') ?? process.env['DEPLOYMENT_MODE'],
      DEDICATED_TENANT_SLUG:
        this.configService?.get<string>('DEDICATED_TENANT_SLUG') ?? process.env['DEDICATED_TENANT_SLUG'],
    });
    if (this.deployment.mode === 'dedicated') {
      this.logger.log(`Deployment mode: dedicated (tenant=${this.deployment.dedicatedTenantSlug})`);
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // @SkipAuth() decorator бүхий route-уудыг алгасна
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    // 1. Authorization header-ээс JWT авах
    const authHeader = request.headers['authorization'] as string | undefined;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authorization header байхгүй байна');
    }

    const token = authHeader.substring(7);

    // 2. JWT баталгаажуулах — PERF-003: Redis cache (≤ 60с) → miss үед Supabase Auth
    const user = await this.verifyToken(token);

    // 3. Tenant slug: dedicated → тохиргооноос, shared → subdomain-ээс
    const host = request.headers['host'] as string;
    const tenantSlug = this.extractTenantSlug(host);

    if (!tenantSlug) {
      throw new ForbiddenException('Tenant тодорхойлогдоогүй байна');
    }

    // 4. Redis cache-ээс tenant_id авах
    const tenantId = await this.tenantCacheService.getTenantId(tenantSlug);
    if (!tenantId) {
      throw new ForbiddenException(`Tenant "${tenantSlug}" олдсонгүй`);
    }

    // 4b. SEC-001: хэрэглэгч энэ tenant-ийн идэвхтэй гишүүн эсэх (core_users)
    //     Үгүй бол A tenant-ийн хэрэглэгч Host-оо сольж B-ийн өгөгдлийг уншиж чадна (RLS нь app.tenant_id-д итгэдэг)
    const isMember = await this.tenantCacheService.isMember(tenantId, user.id);
    if (!isMember) {
      this.logger.warn(`Membership байхгүй: authId=${user.id} tenant=${tenantSlug}`);
      throw new ForbiddenException('Та энэ байгууллагад харьяалагдахгүй байна');
    }

    // 5. Request-д context хавсаргах
    request.user = {
      id: user.id,
      email: user.email,
      tenantId,
      tenantSlug,
    };

    return true;
  }

  private async verifyToken(token: string): Promise<{ id: string; email?: string }> {
    const cached = await this.tenantCacheService.getCachedAuthUser(token);
    if (cached) return cached;

    const pending = this.inflight.get(token);
    if (pending) return pending;
    const promise = this.verifyWithSupabase(token).finally(() => this.inflight.delete(token));
    this.inflight.set(token, promise);
    return promise;
  }

  private async verifyWithSupabase(token: string): Promise<{ id: string; email?: string }> {
    let result: Awaited<ReturnType<SupabaseClient['auth']['getUser']>>;
    try {
      result = await this.getSupabase().auth.getUser(token);
    } catch (err) {
      this.logger.error(`Supabase Auth дуудлага алдаа: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Нэвтрэлтийн сервис түр ажиллахгүй байна');
    }

    const { data, error } = result;
    if (error && isAuthServiceError(error)) {
      this.logger.error(`Supabase Auth ажиллахгүй (status=${error.status ?? 'n/a'}): ${error.message}`);
      throw new ServiceUnavailableException('Нэвтрэлтийн сервис түр ажиллахгүй байна');
    }
    if (error || !data.user) {
      this.logger.warn(`Invalid JWT token: ${error?.message}`);
      throw new UnauthorizedException('Token хүчингүй байна');
    }

    const user = { id: data.user.id, email: data.user.email };
    await this.tenantCacheService.cacheAuthUser(token, user);
    return user;
  }

  private getSupabase(): SupabaseClient {
    if (!this.supabase) {
      // [DI-009] process.env fallback (integration тест configService-ийг дараа нь онооно — lazy үүсгэнэ)
      const supabaseUrl =
        this.configService?.get<string>('SUPABASE_URL') ?? process.env['SUPABASE_URL']!;
      const supabaseAnonKey =
        this.configService?.get<string>('SUPABASE_ANON_KEY') ?? process.env['SUPABASE_ANON_KEY']!;
      this.supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
    }
    return this.supabase;
  }

  private extractTenantSlug(host: string): string | null {
    // ADR-001: Enterprise VPC (dedicated) — нэг deploy = нэг tenant, Host header-ээс үл хамаарна
    if (this.deployment.mode === 'dedicated') {
      return this.deployment.dedicatedTenantSlug;
    }
    if (!host) return null;
    // subdomain.domain.com → subdomain
    // localhost:3000 (development) → 'test-tenant'
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      return process.env.DEV_TENANT_SLUG ?? 'test-tenant';
    }
    const parts = host.split('.');
    return parts.length >= 3 ? parts[0] : null;
  }
}
