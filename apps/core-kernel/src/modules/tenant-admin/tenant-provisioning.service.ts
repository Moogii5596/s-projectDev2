import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaTenantClientService } from '../../db/prisma-tenant-client.service';
import { SchemaRouterService } from './schema-router.service';

export interface SchemaHealthResult {
  tenantId: string;
  schemaName: string | null;
  isEnterprise: boolean;
  tables: {
    name: string;
    exists: boolean;
    rowCount?: number;
  }[];
  healthy: boolean;
}

/**
 * TenantProvisioningService — Sprint 6: Schema-per-Tenant
 *
 * Enterprise tier-д шилжүүлэх болон schema health шалгах бизнес логик.
 *
 * Provisioning дараалал:
 *   1. tenants.schema_name тохируулна (provision_tenant_schema SQL function)
 *   2. Хүснэгтүүдийг хуулна (clone_tables_to_schema SQL function)
 *   3. SchemaRouterService cache invalidate хийнэ
 */
@Injectable()
export class TenantProvisioningService {
  private readonly logger = new Logger(TenantProvisioningService.name);

  // Enterprise schema-д байх ёстой хүснэгтүүдийн жагсаалт
  private readonly REQUIRED_TABLES = [
    'mr_headers',
    'mr_items',
    'approval_logs',
    'workflow_instances',
    'workflow_step_logs',
    'outbox_events',
  ] as const;

  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly schemaRouter: SchemaRouterService,
  ) {}

  /**
   * Tenant-г Enterprise tier-д шилжүүлнэ.
   *   - Аль хэдийн enterprise бол ConflictException
   *   - Шинэ schema provision хийнэ (provision_tenant_schema)
   *   - Хүснэгтүүдийг хуулна (clone_tables_to_schema)
   *   - Cache invalidate хийнэ
   *
   * @returns Үүссэн schema нэр
   */
  async upgradeToEnterprise(tenantId: string): Promise<{ schemaName: string }> {
    // 1. Tenant олдох эсэхийг шалгах
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, slug: true, schemaName: true },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant олдсонгүй: ${tenantId}`);
    }

    // 2. Аль хэдийн enterprise бол хаана
    if (tenant.schemaName) {
      throw new ConflictException(
        `Tenant аль хэдийн enterprise schema-тай байна: ${tenant.schemaName}`,
      );
    }

    // 3. SQL function дуудах — provision_tenant_schema()
    //    RULE-04: $transaction дотор хоёр SQL function-г дуудна
    const result = await this.prisma.$transaction(async (tx) => {
      // provision_tenant_schema: schema үүсгэж, schema_name хадгалж, нэрийг буцаана
      const provisionResult = await tx.$queryRaw<[{ provision_tenant_schema: string }]>`
        SELECT provision_tenant_schema(${tenantId}::uuid)
      `;

      const schemaName = provisionResult[0].provision_tenant_schema;

      // clone_tables_to_schema: хүснэгтүүдийг хуулж, RLS тохируулна
      await tx.$executeRaw`
        SELECT clone_tables_to_schema(${schemaName}, ${tenantId}::uuid)
      `;

      return { schemaName };
    });

    // 4. SchemaRouter cache invalidate — дараагийн query шинэ schema ашиглана
    this.schemaRouter.invalidateCache(tenantId);

    this.logger.log(
      `Enterprise schema provisioned: tenant=${tenant.slug} → ${result.schemaName}`,
    );

    return result;
  }

  /**
   * Tenant-г Shared tier-д буцаана (Enterprise → Shared downgrade).
   *   - deprovision_tenant_schema: schema + бүх хүснэгтийг устгана (CASCADE)
   *   - ⚠️ Data алдагдана! Ашиглахаасаа өмнө backup хий.
   *
   * @returns void
   */
  async downgradeToShared(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, slug: true, schemaName: true },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant олдсонгүй: ${tenantId}`);
    }

    if (!tenant.schemaName) {
      throw new BadRequestException(
        `Tenant enterprise schema-гүй байна — shared tier дээр аль хэдийн байна`,
      );
    }

    // deprovision: schema + data-г устгана
    await this.prisma.$executeRaw`
      SELECT deprovision_tenant_schema(${tenantId}::uuid)
    `;

    // Cache invalidate
    this.schemaRouter.invalidateCache(tenantId);

    this.logger.log(
      `Enterprise schema deprovisioned: tenant=${tenant.slug}`,
    );
  }

  /**
   * Enterprise schema-н health шалгана.
   *   - Schema байгаа эсэх
   *   - Шаардлагатай хүснэгтүүд байгаа эсэх
   *   - Row count (optional, диагнозтив зорилгоор)
   */
  async checkSchemaHealth(tenantId: string): Promise<SchemaHealthResult> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, schemaName: true },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant олдсонгүй: ${tenantId}`);
    }

    const isEnterprise = !!tenant.schemaName;

    if (!isEnterprise) {
      // Shared tenant — health check: public schema-г ашигладаг
      return {
        tenantId,
        schemaName: null,
        isEnterprise: false,
        tables: [],
        healthy: true,
      };
    }

    const schemaName = tenant.schemaName!;

    // pg_tables-с schema дотор хүснэгтүүдийг хайна
    const existingTables = await this.prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = ${schemaName}
    `;

    const existingTableNames = new Set(existingTables.map((t) => t.tablename));

    const tables = this.REQUIRED_TABLES.map((name) => ({
      name,
      exists: existingTableNames.has(name),
    }));

    const allExist = tables.every((t) => t.exists);

    return {
      tenantId,
      schemaName,
      isEnterprise: true,
      tables,
      healthy: allExist,
    };
  }
}
