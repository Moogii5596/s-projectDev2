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

    // RLS middleware — Prisma query бүрт tenant_id тохируулна
    this.$use(async (params, next) => {
      // ⚠️ ЗААВАЛ: executeRaw/queryRaw-г дахин дуудвал infinite loop үүснэ!
      // $executeRaw доорх мөрүүд нь $use-г дахин trigger хийдэг тул энэ guard хэрэгтэй.
      if (params.action === 'executeRaw' || params.action === 'queryRaw') {
        return next(params);
      }

      const ctx = tenantStorage.getStore();
      if (ctx) {
        await this.$executeRaw`SELECT set_config('app.tenant_id', ${ctx.tenantId}, true)`;
        await this.$executeRaw`SELECT set_config('app.user_id', ${ctx.userId}, true)`;
      }

      return next(params);
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('✅ Database connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }

  /**
   * Tenant context-тэй transaction ажиллуулна
   * RLS policy-г баталгаажуулахад заавал энийг ашиглах
   */
  async withTenantContext<T>(
    context: TenantContext,
    fn: (prisma: PrismaTenantClientService) => Promise<T>,
  ): Promise<T> {
    return tenantStorage.run(context, () => fn(this));
  }
}
