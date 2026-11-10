import { Inject, Injectable, Logger } from '@nestjs/common';
import { CampAuditAction } from '@prisma/client';
import Redis from 'ioredis';
import { EnvConfig } from '../../../config/env.config';
import { REDIS_CLIENT } from '../../../db/redis.module';
import { SystemPrismaService } from '../../../db/system-prisma.service';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../../camp/common/camp-access.service';
import { CampAuditService } from '../../camp/common/camp-audit.service';
import { inTenantTx } from '../../camp/common/camp-tx';
import { badRequest, conflict, notFound } from '../../../common/i18n/app-error';
import { PERMISSIONS } from '../permissions/permission-registry';
import { isTenantModuleId, TENANT_MODULES, TenantModuleId } from './module-registry';

const CACHE_TTL_SECONDS = 30;
const CACHE_PREFIX = 'tenant:modules:';
const AUDIT_FIELDS = ['status'] as const;
const MODULE_VERSION = '0.2.4';

type ModuleRow = { moduleId: string; status: string };

@Injectable()
export class CoreTenantModulesService {
  private readonly logger = new Logger(CoreTenantModulesService.name);

  constructor(
    private readonly system: SystemPrismaService,
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
    private readonly audit: CampAuditService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly env: EnvConfig,
  ) {}

  async getMyModules(tenantId: string, authId: string): Promise<{ modules: TenantModuleId[] }> {
    const active = await this.activeModules(tenantId);
    if (!active.some((id) => TENANT_MODULES.find((module) => module.id === id)?.debugOnly)) return { modules: active };
    const canViewDebug = await this.canViewDebugModules(tenantId, authId);
    return {
      modules: canViewDebug ? active : active.filter((id) => !TENANT_MODULES.find((module) => module.id === id)?.debugOnly),
    };
  }

  async canViewDebugModules(tenantId: string, authId: string): Promise<boolean> {
    if (!this.env.DEBUG_MENU_ENABLED) return false;
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      const actor = await this.access.resolve(tx, tenantId, authId);
      if (actor.perms.global.includes(PERMISSIONS.DEBUG_VIEW)) return true;
      const user = await tx.coreUser.findFirst({
        where: { id: actor.userId, tenantId },
        select: { role: true },
      });
      return user?.role === 'OWNER';
    });
  }

  async list(tenantId: string, authId: string) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireTenantAdmin(tx, tenantId, authId);
      const rows = await tx.installedModule.findMany({ where: { tenantId }, select: { moduleId: true, status: true } });
      return this.toViews(rows);
    });
  }

  async update(tenantId: string, authId: string, moduleId: string, active: boolean) {
    if (!isTenantModuleId(moduleId)) throw notFound('core.modules.unknown');
    const module = TENANT_MODULES.find((item) => item.id === moduleId)!;
    if (module.required) throw badRequest('core.modules.required');

    const result = await inTenantTx(this.prisma, tenantId, async (tx) => {
      const actorUserId = await this.access.requireTenantAdmin(tx, tenantId, authId);
      const rows = await tx.installedModule.findMany({ where: { tenantId }, select: { moduleId: true, status: true } });
      const current = new Map(rows.map((row) => [row.moduleId, row]));
      const currentActive = this.isModuleStatusActive(module, current.get(module.id)?.status);
      if (currentActive === active) return this.toViews(rows);

      if (active) {
        const missingDependency = module.requires.find((dependency) => {
          const dependencyModule = TENANT_MODULES.find((item) => item.id === dependency)!;
          return !this.isModuleStatusActive(dependencyModule, current.get(dependency)?.status);
        });
        if (missingDependency) throw badRequest('core.modules.dependency_missing', { dependency: missingDependency });
      } else {
        const dependent = TENANT_MODULES.find((candidate) =>
          (candidate.requires as readonly string[]).includes(module.id) &&
          this.isModuleStatusActive(candidate, current.get(candidate.id)?.status),
        );
        if (dependent) throw conflict('core.modules.dependency_active', { module: dependent.id });
      }

      const status = active ? 'ACTIVE' : 'SUSPENDED';
      const updated = await tx.installedModule.upsert({
        where: { tenantId_moduleId: { tenantId, moduleId } },
        create: {
          tenantId,
          moduleId,
          version: MODULE_VERSION,
          status,
          manifestSnapshot: { moduleId, dependencies: module.requires },
        },
        update: { status, version: MODULE_VERSION },
        select: { id: true },
      });
      await this.audit.record(tx, {
        tenantId,
        campId: null,
        entityType: 'installed_module',
        entityId: updated.id,
        action: CampAuditAction.UPDATE,
        actorUserId,
        fields: AUDIT_FIELDS,
        before: { status: current.get(moduleId)?.status ?? (currentActive ? 'ACTIVE' : 'SUSPENDED') },
        after: { status },
        summaryParams: { moduleId },
      });

      const next = new Map(current);
      next.set(moduleId, { moduleId, status });
      return this.toViews([...next.values()]);
    });
    await this.invalidate(tenantId);
    return result;
  }

  async isActive(tenantId: string, moduleId: TenantModuleId): Promise<boolean> {
    return (await this.activeModules(tenantId)).includes(moduleId);
  }

  async invalidate(tenantId: string): Promise<void> {
    try {
      await this.redis.del(`${CACHE_PREFIX}${tenantId}`);
    } catch (error) {
      this.logger.warn(`Tenant modules cache цэвэрлэгээ алдаа — tenant=${tenantId}: ${(error as Error).message}`);
    }
  }

  private async activeModules(tenantId: string): Promise<TenantModuleId[]> {
    const key = `${CACHE_PREFIX}${tenantId}`;
    try {
      const cached = await this.redis.get(key);
      if (cached) {
        const parsed: unknown = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.every((value) => typeof value === 'string' && isTenantModuleId(value))) {
          return parsed as TenantModuleId[];
        }
        this.logger.warn(`Tenant modules cache буруу бүтэцтэй — tenant=${tenantId}`);
      }
    } catch (error) {
      this.logger.warn(`Tenant modules cache уншилт алдаа — tenant=${tenantId}: ${(error as Error).message}`);
    }

    const rows = await this.system.installedModule.findMany({
      where: { tenantId },
      select: { moduleId: true, status: true },
    });
    const active = this.toViews(rows).filter((module) => module.active).map((module) => module.id);
    try {
      await this.redis.setex(key, CACHE_TTL_SECONDS, JSON.stringify(active));
    } catch (error) {
      this.logger.warn(`Tenant modules cache бичилт алдаа — tenant=${tenantId}: ${(error as Error).message}`);
    }
    return active;
  }

  private toViews(rows: ModuleRow[]) {
    const states = new Map(rows.map((row) => [row.moduleId, row.status]));
    return TENANT_MODULES.map((module) => ({
      id: module.id,
      active: this.isModuleStatusActive(module, states.get(module.id)),
      required: module.required,
      debugOnly: module.debugOnly,
      dependencies: [...module.requires],
    }));
  }

  private isModuleStatusActive(module: (typeof TENANT_MODULES)[number], status: string | undefined): boolean {
    return module.required || (status === undefined ? module.defaultActive : status === 'ACTIVE');
  }
}
