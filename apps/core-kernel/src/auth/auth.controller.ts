import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { TenantAuthGuard } from './tenant-auth.guard';
import { TenantContextInterceptor } from './tenant-context.interceptor';
import { TenantCacheService } from './tenant-cache.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import type { RequestUser } from '@s-project/shared-types';

interface FastifyRequest {
  user?: RequestUser;
  headers: Record<string, string>;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tenantCacheService: TenantCacheService,
  ) {}

  /**
   * POST /api/v1/auth/register
   * Шинэ хэрэглэгч бүртгэх
   * Host header-ээс tenant тодорхойлно
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto, @Req() req: FastifyRequest) {
    const tenantId = await this.resolveTenantId(req);
    return this.authService.register(dto, tenantId);
  }

  /**
   * POST /api/v1/auth/login
   * Email + нууц үгээр нэвтрэх → JWT токен буцаах
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /**
   * GET /api/v1/auth/me
   * Одоогийн нэвтэрсэн хэрэглэгчийн мэдээлэл
   * TenantAuthGuard шаардана
   */
  @Get('me')
  @UseGuards(TenantAuthGuard)
  @UseInterceptors(TenantContextInterceptor)
  async me(@Req() req: FastifyRequest) {
    const user = req.user!;
    return this.authService.getMe(user.id, user.tenantId);
  }

  // ── Туслах: host-ээс tenant_id авах ────────────────────────
  private async resolveTenantId(req: FastifyRequest): Promise<string> {
    const host = req.headers['host'] ?? '';
    let slug: string;

    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      slug = process.env.DEV_TENANT_SLUG ?? 'test-tenant';
    } else {
      const parts = host.split('.');
      slug = parts.length >= 3 ? parts[0] : 'test-tenant';
    }

    const tenantId = await this.tenantCacheService?.getTenantId(slug) ?? null;
    if (!tenantId) {
      const { ForbiddenException } = await import('@nestjs/common');
      throw new ForbiddenException(`Tenant "${slug}" олдсонгүй`);
    }

    return tenantId;
  }
}
