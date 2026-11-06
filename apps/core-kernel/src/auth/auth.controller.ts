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
  Param,
  ForbiddenException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { TenantAuthGuard } from './tenant-auth.guard';
import { TenantContextInterceptor } from './tenant-context.interceptor';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AcceptInviteDto, ChangePasswordDto, ForgotPasswordDto, SignInDto } from './dto/sign-in.dto';
import { InviteService } from './invite.service';
import { SignInService, clientIpOf } from './sign-in.service';
import { SessionRevokeService } from './session-revoke.service';
import { SkipAuth } from '../common/decorators/skip-auth.decorator';
import { AllowPasswordChangeRequired } from '../common/decorators/allow-password-change-required.decorator';
import type { RequestUser } from '@s-project/shared-types';

/** SEC-005 (v0.1.6): хэрэглэгч үүсгэх эрхтэй role-ууд */
export const REGISTER_ROLES = ['OWNER', 'ADMIN'] as const;

interface FastifyRequest {
  user?: RequestUser;
  headers: Record<string, string>;
  ip?: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly signInService: SignInService,
    private readonly inviteService: InviteService,
  ) {}

  /**
   * POST /api/v1/auth/register
   * Өөрийн байгууллагад шинэ хэрэглэгч (REQUESTER) үүсгэх — ЗӨВХӨН OWNER/ADMIN.
   *
   * SEC-005 (v0.1.6): өмнө нь нэвтэрсэн ДУРЫН хэрэглэгч (VIEWER ч) дуудаж, Host header-ээр сонгосон tenant-д
   * service key-ээр шинэ бүртгэл үүсгэж чаддаг байсан → VIEWER → REQUESTER эрх нэмэгдэл, `enable_signup=false`-ийг тойрох.
   * Одоо: tenant = нэвтэрсэн хэрэглэгчийн tenant (guard), дуудагч OWNER/ADMIN байх ёстой.
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto, @Req() req: FastifyRequest) {
    const caller = req.user!;
    const me = await this.authService.getMe(caller.id, caller.tenantId);
    if (!me.isActive || !(REGISTER_ROLES as readonly string[]).includes(me.role)) {
      throw new ForbiddenException('Хэрэглэгч үүсгэх эрхгүй (OWNER/ADMIN)');
    }
    return this.authService.register(dto, caller.tenantId);
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
  /**
   * POST /api/v1/auth/sign-in — v0.2.2 D-10 (нэвтрэлтгүй)
   * { identifier: утас | username | имэйл, password } → Supabase session (frontend `setSession`)
   */
  @Post('sign-in')
  @SkipAuth()
  @HttpCode(HttpStatus.OK)
  async signIn(@Body() dto: SignInDto, @Req() req: FastifyRequest) {
    return this.signInService.signIn(req.headers['host'], clientIpOf(req), dto.identifier, dto.password);
  }

  /** GET /api/v1/auth/invites/:token — v0.2.2 Блок 3 (нэвтрэлтгүй): хүчинтэй эсэх, нэр, нэвтрэх нэр */
  @Get('invites/:token')
  @SkipAuth()
  async inspectInvite(@Param('token') token: string) {
    return this.inviteService.inspect(token);
  }

  /** POST /api/v1/auth/invites/:token/accept — нууц үг үүсгэх (урилга / reset; нэг удаа) */
  @Post('invites/:token/accept')
  @SkipAuth()
  @HttpCode(HttpStatus.OK)
  async acceptInvite(@Param('token') token: string, @Body() dto: AcceptInviteDto) {
    return this.inviteService.accept(token, dto.password);
  }

  /** POST /api/v1/auth/forgot-password — хариу үргэлж ижил (задруулахгүй) */
  @Post('forgot-password')
  @SkipAuth()
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: FastifyRequest) {
    return this.inviteService.forgot(req.headers['host'], clientIpOf(req), dto.identifier);
  }

  /** POST /api/v1/auth/change-password — D-06 (must_change_password үед ч нээлттэй) */
  @Post('change-password')
  @AllowPasswordChangeRequired()
  @HttpCode(HttpStatus.OK)
  async changePassword(@Body() dto: ChangePasswordDto, @Req() req: FastifyRequest) {
    const u = req.user!;
    // PIL-15: одоогийн session үлдэх — JWT payload-ийн session_id
    const keepSessionId = SessionRevokeService.sessionIdFromAuthHeader(req.headers.authorization);
    return this.signInService.changePassword(u.tenantId, u.id, dto.currentPassword, dto.newPassword, keepSessionId);
  }

  @Get('me')
  @AllowPasswordChangeRequired()
  @UseGuards(TenantAuthGuard)
  @UseInterceptors(TenantContextInterceptor)
  async me(@Req() req: FastifyRequest) {
    const user = req.user!;
    return this.authService.getMe(user.id, user.tenantId);
  }
}
