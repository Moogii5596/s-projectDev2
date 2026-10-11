import { Global, Module } from '@nestjs/common';
import { TenantAuthGuard } from './tenant-auth.guard';
import { TenantContextInterceptor } from './tenant-context.interceptor';
import { TenantCacheService } from './tenant-cache.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SignInService } from './sign-in.service';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    TenantAuthGuard,
    TenantContextInterceptor,
    TenantCacheService,
    AuthService,
    SignInService,
  ],
  exports: [TenantAuthGuard, TenantContextInterceptor, TenantCacheService, AuthService],
})
export class AuthModule {}
