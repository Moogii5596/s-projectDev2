import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { TenantOnboardingService } from './tenant-onboarding.service';
import { SuperAdminGuard } from './guards/super-admin.guard';
import type { CreateTenantDto } from './dto/create-tenant.dto';

/**
 * TenantAdminController
 * Sprint 4: Platform-level tenant onboarding endpoint
 * POST /api/v1/admin/tenants → 201 (super admin only)
 */
@Controller('admin/tenants')
@UseGuards(SuperAdminGuard)  // Super admin бус → 403
export class TenantAdminController {
  constructor(private readonly onboardingService: TenantOnboardingService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createTenant(@Body() dto: CreateTenantDto) {
    return this.onboardingService.createTenant(dto);
  }
}
