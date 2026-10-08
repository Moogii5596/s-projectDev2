import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { SuperAdminGuard } from './guards/super-admin.guard';
import { UseGuards } from '@nestjs/common';

/**
 * TenantProvisioningController — Sprint 6: Schema-per-Tenant
 *
 * RULE-07: Guard = APP_GUARD (useExisting) — controller-д @UseGuards хэрэггүй болно.
 *           Гэхдээ SuperAdminGuard нь нэмэлт guard тул эндэ шууд тавина.
 *
 * Endpoints:
 *   POST   /admin/tenants/:id/upgrade-enterprise  → Enterprise schema provision
 *   DELETE /admin/tenants/:id/enterprise-schema   → Schema deprovision (⚠️ data loss)
 *   GET    /admin/tenants/:id/schema-health       → Schema health check
 */
@Controller('admin/tenants')
@UseGuards(SuperAdminGuard)
export class TenantProvisioningController {
  constructor(
    private readonly provisioningService: TenantProvisioningService,
  ) {}

  /**
   * POST /admin/tenants/:id/upgrade-enterprise
   *
   * Tenant-г Enterprise tier-д шилжүүлж тусдаа PostgreSQL schema provision хийнэ.
   * - Schema үүснэ: tenant_<uuid_prefix>
   * - Хүснэгтүүд хуулагдана: mr_headers, mr_items, approval_logs, ...
   * - RLS тохируулагдана (RULE-12)
   * - Зөвхөн SUPER_ADMIN дуудах эрхтэй
   */
  @Post(':id/upgrade-enterprise')
  @HttpCode(HttpStatus.CREATED)
  async upgradeToEnterprise(
    @Param('id', new ParseUUIDPipe({ version: '4' })) tenantId: string,
  ): Promise<{ success: boolean; schemaName: string; message: string }> {
    const result = await this.provisioningService.upgradeToEnterprise(tenantId);
    return {
      success: true,
      schemaName: result.schemaName,
      message: `Enterprise schema амжилттай үүслээ: ${result.schemaName}`,
    };
  }

  /**
   * DELETE /admin/tenants/:id/enterprise-schema
   *
   * ⚠️ АЮУЛ: Enterprise schema + бүх tenant data-г устгана.
   * Production-д backup хийсний дараа л дуудах!
   * Зөвхөн SUPER_ADMIN дуудах эрхтэй.
   */
  @Delete(':id/enterprise-schema')
  @HttpCode(HttpStatus.OK)
  async downgradeToShared(
    @Param('id', new ParseUUIDPipe({ version: '4' })) tenantId: string,
  ): Promise<{ success: boolean; message: string }> {
    await this.provisioningService.downgradeToShared(tenantId);
    return {
      success: true,
      message: `Enterprise schema устгагдаж, shared tier-д буцлаа`,
    };
  }

  /**
   * GET /admin/tenants/:id/schema-health
   *
   * Enterprise schema-н байдлыг шалгана.
   * - Schema байгаа эсэх
   * - Шаардлагатай хүснэгтүүд байгаа эсэх
   * SUPER_ADMIN болон ADMIN дуудах эрхтэй.
   */
  @Get(':id/schema-health')
  @HttpCode(HttpStatus.OK)
  async checkSchemaHealth(
    @Param('id', new ParseUUIDPipe({ version: '4' })) tenantId: string,
  ) {
    return this.provisioningService.checkSchemaHealth(tenantId);
  }
}
