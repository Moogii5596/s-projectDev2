import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaTenantClientService } from '../../db/prisma-tenant-client.service';

/**
 * SchemaRouterService — Sprint 6: Schema-per-Tenant DB Isolation
 *
 * Enterprise tenant-ууд `tenant_<uuid_prefix>` schema-д тусдаа хүснэгттэй байдаг.
 * Shared (SMB) tenant-ууд `public` schema-г ашигладаг (хуучин зан хэвээр).
 *
 * Гол аргууд:
 *   getSchemaName(tenantId)      → cache → DB → schema нэрийг буцаана
 *   withSchema(tenantId, fn)     → RULE-04: нэгдсэн $transaction() дотор
 *                                   SET search_path + query хоёуланг ажиллуулна
 *   invalidateCache(tenantId)    → tier өөрчлөгдөхөд cache цэвэрлэнэ
 */
@Injectable()
export class SchemaRouterService {
  private readonly logger = new Logger(SchemaRouterService.name);

  // In-memory cache: tenantId → schemaName ('public' | 'tenant_xxxxxxxx')
  // TTL байхгүй — invalidateCache() дуудах үед л цэвэрлэгдэнэ
  private readonly schemaCache = new Map<string, string>();

  constructor(private readonly prisma: PrismaTenantClientService) {}

  /**
   * Tenant-н schema нэрийг буцаана.
   *   - Cache байгаа бол → шууд буцаана
   *   - Cache байхгүй → DB-ээс уншиж cache-д хадгална
   *   - schemaName = null → 'public' (shared tier)
   *   - schemaName = 'tenant_abc12345' → тэрхүү нэр (enterprise tier)
   */
  async getSchemaName(tenantId: string): Promise<string> {
    // 1. Cache шалгах
    if (this.schemaCache.has(tenantId)) {
      return this.schemaCache.get(tenantId)!;
    }

    // 2. DB-ээс унших
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { schemaName: true },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant олдсонгүй: ${tenantId}`);
    }

    // 3. enterprise бол schema нэрийг авна, shared бол 'public'
    const schemaName = tenant.schemaName ?? 'public';

    // 4. Cache-д хадгалах
    this.schemaCache.set(tenantId, schemaName);
    this.logger.debug(`Schema cached: tenant=${tenantId} → schema=${schemaName}`);

    return schemaName;
  }

  /**
   * Schema-тай transaction дотор callback ажиллуулна.
   *
   * RULE-04: SET CONFIG + бодит query нэгдсэн $transaction() дотор байна.
   * set_config(name, value, TRUE) → LOCAL transaction → transaction дуусахад reset болно.
   *
   * search_path тохируулалт:
   *   - enterprise: 'tenant_abc12345,public'  → tenant schema эхлээд, дараа public fallback
   *   - shared:     'public'                  → хуучин зан хэвээр
   *
   * @param tenantId  Tenant UUID
   * @param callback  transaction client-тэй ажиллах функц
   */
  async withSchema<T>(
    tenantId: string,
    callback: (
      tx: Omit<
        PrismaTenantClientService,
        '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
      >,
    ) => Promise<T>,
  ): Promise<T> {
    const schemaName = await this.getSchemaName(tenantId);

    // Enterprise: 'tenant_xxx,public' | Shared: 'public'
    // 'public' нь pg_catalog функцуудыг ашиглахын тулд ЗААВАЛ орно (АНХААР: docs-т тэмдэглэсэн)
    const searchPath =
      schemaName === 'public' ? 'public' : `${schemaName},public`;

    return this.prisma.$transaction(async (tx) => {
      // RULE-04: set_config + query нэгдсэн transaction дотор
      // true = LOCAL to transaction — transaction дуусахад search_path default болно
      await tx.$executeRaw`
        SELECT
          set_config('search_path', ${searchPath}, true),
          set_config('app.tenant_id', ${tenantId}, true)
      `;

      return callback(tx as any);
    });
  }

  /**
   * Cache invalidate — tenant-н tier/schema өөрчлөгдөхөд заавал дуудна.
   * (e.g. upgrade enterprise → дуудна; downgrade → дуудна)
   */
  invalidateCache(tenantId: string): void {
    const existed = this.schemaCache.delete(tenantId);
    if (existed) {
      this.logger.log(`Schema cache invalidated: tenant=${tenantId}`);
    }
  }

  /**
   * Tenant enterprise schema-тай эсэхийг шалгана.
   * Provisioning хийгдсэн эсэхийг (schema_name != null) харуулна.
   */
  async isEnterpriseSchema(tenantId: string): Promise<boolean> {
    const schema = await this.getSchemaName(tenantId);
    return schema !== 'public';
  }
}
