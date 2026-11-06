import { Global, Module } from '@nestjs/common';
import { TenantAuthGuard } from './tenant-auth.guard';
import { TenantContextInterceptor } from './tenant-context.interceptor';
import { TenantCacheService } from './tenant-cache.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SignInService } from './sign-in.service';
import { UserAdminService } from './user-admin.service';
import { MailerService } from './mailer.service';
import { InviteService } from './invite.service';
import { SessionRevokeService } from './session-revoke.service';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    TenantAuthGuard,
    TenantContextInterceptor,
    TenantCacheService,
    AuthService,
    SignInService,
    UserAdminService,
    MailerService,
    InviteService,
    SessionRevokeService,
  ],
  exports: [TenantAuthGuard, TenantContextInterceptor, TenantCacheService, AuthService, SignInService, UserAdminService, InviteService, SessionRevokeService],
})
export class AuthModule {}
