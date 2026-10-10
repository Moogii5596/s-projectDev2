import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';
import { resolvePrismaLogLevels } from '../config/prisma-log';

export interface TenantContext {
  tenantId: string;
  userId: string;
}

// AsyncLocalStorage — request бүрт tenant context хадгална
export const tenantStorage = new AsyncLocalStorage<TenantContext>();

@Injectable()
export class PrismaTenantClientService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaTenantClientService.name);

  constructor() {
    super({
      // Phase 3.6.6: PRISMA_LOG_LEVELS (default warn,error). 'query' log RAM их иддэг — production-д бүү асаа
      log: resolvePrismaLogLevels(),
    });

    // Phase 4.8.3: өмнөх `$use` middleware УСТСАН — set_config-ийг transaction-ий ГАДНА (тусдаа statement)
    // дууддаг байсан тул дараагийн query-д хүрдэггүй (үр дүнгүй) + query бүрт 2 нэмэлт round-trip.
    // Tenant өгөгдөл = `inTenantTx` (db/tenant-tx.ts) эсвэл camp-tx [RLS-004].
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('✅ Database connected');
    await this.logRlsMode();
  }

  /** Phase 4.8.4: DATABASE_URL-ийн role RLS-ийг алгасдаг эсэхийг эхлэхэд мэдэгдэнэ */
  private async logRlsMode(): Promise<void> {
    try {
      const [r] = await this.$queryRaw<{ role: string; bypass: boolean }[]>`
        SELECT current_user::text AS role, (rolsuper OR rolbypassrls) AS bypass FROM pg_roles WHERE rolname = current_user`;
      if (!r) return;
      if (r.bypass) {
        this.logger.warn(`DB role "${r.role}" BYPASSRLS — RLS хүсэлтийн түвшинд идэвхгүй (зорилго: DATABASE_URL → app_user, Phase 4.8)`);
      } else {
        this.logger.log(`DB role "${r.role}" — RLS идэвхтэй`);
      }
    } catch (err) {
      this.logger.warn(`DB role шалгаж чадсангүй: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }

  /**
   * AsyncLocalStorage-д tenant context тавина (route-ingress гэх мэт `tenantStorage`-оос уншдаг код).
   * ⚠️ DB-д set_config ХИЙХГҮЙ — RLS-д `inTenantTx` ашигла (Phase 4.8.3).
   */
  async withTenantContext<T>(
    context: TenantContext,
    fn: (prisma: PrismaTenantClientService) => Promise<T>,
  ): Promise<T> {
    return tenantStorage.run(context, () => fn(this));
  }
}
