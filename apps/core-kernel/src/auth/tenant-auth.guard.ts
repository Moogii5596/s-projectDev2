import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import { TenantCacheService } from './tenant-cache.service';
import { IS_PUBLIC_KEY } from '../common/decorators/skip-auth.decorator';

@Injectable()
export class TenantAuthGuard implements CanActivate {
  private readonly logger = new Logger(TenantAuthGuard.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly tenantCacheService: TenantCacheService,
    private readonly reflector: Reflector,
  ) {}

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

    // 2. Supabase-аар JWT баталгаажуулах
    // [DI-009] process.env fallback: SWC+emitDecoratorMetadata суулгахаас өмнө
    // esbuild configService-г undefined үлдээдэг байсан учир хамгаалалт нэмсэн
    const supabaseUrl =
      this.configService?.get<string>('SUPABASE_URL') ?? process.env['SUPABASE_URL']!;
    const supabaseAnonKey =
      this.configService?.get<string>('SUPABASE_ANON_KEY') ?? process.env['SUPABASE_ANON_KEY']!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      this.logger.warn(`Invalid JWT token: ${error?.message}`);
      throw new UnauthorizedException('Token хүчингүй байна');
    }

    const user = data.user;

    // 3. Subdomain-ээс tenant slug авах
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

    // 5. Request-д context хавсаргах
    request.user = {
      id: user.id,
      email: user.email,
      tenantId,
      tenantSlug,
    };

    return true;
  }

  private extractTenantSlug(host: string): string | null {
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
