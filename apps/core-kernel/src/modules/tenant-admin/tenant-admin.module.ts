import { Module } from '@nestjs/common';
import { TenantOnboardingService } from './tenant-onboarding.service';
import { TenantAdminController } from './tenant-admin.controller';
import { SuperAdminGuard } from './guards/super-admin.guard';
import { DatabaseModule } from '../../db/database.module';
// Sprint 6: Schema-per-Tenant
import { SchemaRouterService } from './schema-router.service';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { TenantProvisioningController } from './tenant-provisioning.controller';

/**
 * TenantAdminModule — Sprint 4 + Sprint 6
 * - Sprint 4: Platform-level tenant onboarding (module federation + RULE-13)
 * - Sprint 6: Schema-per-Tenant isolation (SchemaRouterService + TenantProvisioningService)
 */
@Module({
  imports: [DatabaseModule],
  controllers: [TenantAdminController, TenantProvisioningController],
  providers: [
    TenantOnboardingService,
    SuperAdminGuard,
    // Sprint 6: Schema isolation
    SchemaRouterService,
    TenantProvisioningService,
  ],
  exports: [
    TenantOnboardingService,
    // Sprint 6: SchemaRouterService-г бусад module ашиглах (e.g. MR module)
    SchemaRouterService,
  ],
})
export class TenantAdminModule {}
