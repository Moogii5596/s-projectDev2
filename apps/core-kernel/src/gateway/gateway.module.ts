import { Global, Module } from '@nestjs/common';
import { DynamicIngressRouterService } from './dynamic-ingress-router.service';
import { DrainingInterceptor }         from './draining.interceptor';

// @Global() — DynamicIngressRouterService нь бүх module-д inject хийгдэнэ
// AuthModule-тэй адил pattern
@Global()
@Module({
  providers: [DynamicIngressRouterService, DrainingInterceptor],
  exports:   [DynamicIngressRouterService, DrainingInterceptor],
})
export class GatewayModule {}
