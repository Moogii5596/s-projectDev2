import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { resolvePrismaLogLevels } from '../config/prisma-log';

/**
 * Phase 4.8.4 — Системийн DB холболт (2026-10-10)
 *
 * Апп-ын хүсэлтүүд `DATABASE_URL` (зорилго: `app_user`, NOBYPASSRLS → RLS идэвхтэй)-ээр,
 * tenant-ээс өмнөх / бүх tenant-ийг хамарсан ажлууд энэ холболтоор (`SYSTEM_DATABASE_URL`, BYPASSRLS):
 *   - TenantCacheService (slug → tenant, membership), AuthService.login (authId → tenant)
 *   - SuperAdminGuard, TenantOnboardingService (tenants / super_admins — app_user-д эрхгүй)
 *   - OutboxPollerService + DlqService, ApprovalSlaScheduler, NotificationMailScheduler (бүх tenant-ийг скан)
 * `SYSTEM_DATABASE_URL` заавал тохирсон байна (BYPASSRLS эрхийг санаандгүйгээр app_user-тэй холихгүй).
 * ⚠️ Хэрэглэгчийн хүсэлтийн tenant өгөгдөлд ЭНИЙГ БҮҮ ашигла — `PrismaTenantClientService` + `inTenantTx`.
 */
export function resolveSystemDatabaseUrl(env: NodeJS.ProcessEnv): string {
  const system = env.SYSTEM_DATABASE_URL?.trim();
  if (!system) throw new Error('SYSTEM_DATABASE_URL тохируулаагүй — BYPASSRLS холболт шаардлагатай');
  return system;
}

@Injectable()
export class SystemPrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SystemPrismaService.name);

  constructor(config: ConfigService) {
    const url = resolveSystemDatabaseUrl({ SYSTEM_DATABASE_URL: config.get<string>('SYSTEM_DATABASE_URL') });
    super({
      datasources: { db: { url } },
      log: resolvePrismaLogLevels(config.get<string>('PRISMA_LOG_LEVELS')),
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('✅ System DB connected (SYSTEM_DATABASE_URL)');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
