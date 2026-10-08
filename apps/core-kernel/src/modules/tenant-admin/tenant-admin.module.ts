import { Module } from '@nestjs/common';
import { TenantOnboardingService } from './tenant-onboarding.service';
import { TenantAdminController } from './tenant-admin.controller';
import { SuperAdminGuard } from './guards/super-admin.guard';
import { DatabaseModule } from '../../db/database.module';

/**
 * TenantAdminModule — Sprint 4
 * - Platform-level tenant onboarding (module federation + RULE-13)
 *
 * Sprint 6-ийн schema-per-tenant (SchemaRouterService, TenantProvisioning*) 2026-10-08-нд хасагдсан.
 * Шалтгаан: ADR-001 (docs/02_System_Architecture/ADR-001_Tenant_Isolation.md) —
 * shared tenant = RLS, Enterprise VPC = тусдаа DB/deploy (DEPLOYMENT_MODE=dedicated).
 */
@Module({
  imports: [DatabaseModule],
  controllers: [TenantAdminController],
  providers: [TenantOnboardingService, SuperAdminGuard],
  exports: [TenantOnboardingService],
})
export class TenantAdminModule {}
