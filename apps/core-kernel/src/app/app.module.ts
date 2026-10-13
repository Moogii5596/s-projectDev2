import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EnvConfig } from '../config/env.config';
import { DatabaseModule } from '../db/database.module';
import { RedisModule } from '../db/redis.module';
import { AppCacheModule } from '../cache/cache.module';
import { AuthModule } from '../auth/auth.module';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { TenantRateLimitGuard } from '../auth/tenant-rate-limit.guard';
import { TenantContextInterceptor } from '../auth/tenant-context.interceptor';
import { MaterialRequisitionModule } from '../modules/material-requisition/material-requisition.module';
// Sprint 1: Dynamic Route Ingress
import { GatewayModule }      from '../gateway/gateway.module';
import { DrainingInterceptor } from '../gateway/draining.interceptor';
import { RouteIngressModule }  from '../modules/route-ingress/route-ingress.module';
// Sprint 2: Workflow Engine
import { WorkflowModule }      from '../modules/workflow/workflow.module';
// Sprint 5: Health
import { HealthModule }         from '../modules/health/health.module';
// Sprint 4: Tenant Onboarding
import { TenantAdminModule }    from '../modules/tenant-admin/tenant-admin.module';
// Sprint 3: Event Bus
import { EventBusModule }      from '../modules/event-bus/event-bus.module';
// Phase 4: Sprint 9 модулиуд
import { BudgetModule }        from '../modules/budget/budget.module';
import { InventoryModule }     from '../modules/inventory/inventory.module';
import { VendorModule }        from '../modules/vendor/vendor.module';
import { ReportModule }        from '../modules/report/report.module';
// Camp Module (ERD v4, Шат 2)
import { CampModule }          from '../modules/camp/camp.module';
import { CoreModule }          from '../modules/core/core.module';
import { HrModule }            from '../modules/hr/hr.module';
// v0.2.0 §0.7 — олон хэл
import { I18nModule }          from '../common/i18n/i18n.module';
import { I18nInterceptor }     from '../common/i18n/i18n.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: true,
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    RedisModule,
    AppCacheModule,
    I18nModule,
    AuthModule,
    GatewayModule,             // Sprint 1: @Global() → DynamicIngressRouterService + DrainingInterceptor
    MaterialRequisitionModule,
    RouteIngressModule,        // Sprint 1
    WorkflowModule,             // Sprint 2
    EventBusModule,            // Sprint 3
    TenantAdminModule,         // Sprint 4
    HealthModule,              // Sprint 5
    BudgetModule,              // Phase 4.1
    InventoryModule,           // Phase 4.2 (lite)
    VendorModule,              // Phase 4.3 (lite)
    ReportModule,              // Phase 4.4 (lite)
    CoreModule,                // v0.2.2 H1 — байгууллагууд (ADR-006)
    HrModule,                  // v0.2.2 H1 — HR суурь модуль (ADR-006)
    CampModule,                // Camp Module — Шат 2
  ],
  controllers: [AppController],
  providers: [
    AppService,
    EnvConfig,
    // RULE-07: useExisting (биш useClass) — module аль хэдийн instantiate хийсэн
    { provide: APP_GUARD,       useExisting: TenantAuthGuard },
    { provide: APP_GUARD,       useClass: TenantRateLimitGuard },
    { provide: APP_INTERCEPTOR, useExisting: TenantContextInterceptor },
    { provide: APP_INTERCEPTOR, useExisting: DrainingInterceptor },  // Sprint 1 RULE-07
    { provide: APP_INTERCEPTOR, useExisting: I18nInterceptor },      // v0.2.0 §0.7
  ],
  exports: [EnvConfig],
})
export class AppModule {}
