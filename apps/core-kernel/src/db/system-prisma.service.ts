import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { resolvePrismaLogLevels } from '../config/prisma-log';

/**
 * Phase 4.8.4 — Системийн DB холболт (2026-10-10)
 *
 * Апп-ын хүсэлтүүд `DATABASE_URL` (зорилго: `app_user`, NOBYPASSRLS → RLS идэвхтэй)-ээр,
 * tenant-ээс өмнөх / бүх tenant-ийг хамарсан ажлууд энэ холболтоор (`SYSTEM_DATABASE_URL`, BYPASSRLS):
 *   - TenantCacheService (slug → tenant, membership), AuthService.login (authId → tenant)
 *   - SuperAdminGuard, TenantOnboardingService (tenants / super_admins — app_user-д эрхгүй)
 *   - OutboxPollerService + DlqService, EscalationScheduler (бүх tenant-ийг скан)
 * `SYSTEM_DATABASE_URL` тохируулаагүй бол `DATABASE_URL`-ийг ашиглана (шилжилтийн үе: хоёулаа `postgres`).
 * ⚠️ Хэрэглэгчийн хүсэлтийн tenant өгөгдөлд ЭНИЙГ БҮҮ ашигла — `PrismaTenantClientService` + `inTenantTx`.
 */
export function resolveSystemDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const system = env.SYSTEM_DATABASE_URL?.trim();
  return system ? system : env.DATABASE_URL;
}

@Injectable()
export class SystemPrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SystemPrismaService.name);

  constructor() {
    const url = resolveSystemDatabaseUrl();
    super({
      ...(url ? { datasources: { db: { url } } } : {}),
      log: resolvePrismaLogLevels(),
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log(
      process.env.SYSTEM_DATABASE_URL?.trim()
        ? '✅ System DB connected (SYSTEM_DATABASE_URL)'
        : '✅ System DB connected (SYSTEM_DATABASE_URL алга → DATABASE_URL)',
    );
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
