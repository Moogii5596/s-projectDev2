import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole, WorkflowDefinition } from '@prisma/client';
import { PrismaService } from '../../db/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { requireRole } from '../../common/helpers/require-role.helper';

/** Phase 4.9.1 [SEC-003]: definition үүсгэх/засах — OWNER/ADMIN (жагсаалтыг гишүүн бүр харна) */
export const WORKFLOW_ADMIN_ROLES: UserRole[] = [UserRole.OWNER, UserRole.ADMIN];

export interface WorkflowDefinitionInput {
  name: string;
  stepsConfig: Prisma.InputJsonValue;
  slaHours?: number;
  escalationEnabled?: boolean;
  delegationEnabled?: boolean;
}

@Injectable()
export class WorkflowDefinitionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async list(tenantId: string): Promise<WorkflowDefinition[]> {
    const cacheKey = this.cache.buildKey('workflow', tenantId, 'definitions');
    const cached = await this.cache.get<Awaited<ReturnType<WorkflowDefinitionService['list']>>>(cacheKey);
    if (cached) return cached;

    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return tx.workflowDefinition.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
    });
    await this.cache.set(cacheKey, result, 600);
    return result;
  }

  async create(tenantId: string, authId: string, input: WorkflowDefinitionInput) {
    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      await requireRole(tx, tenantId, authId, WORKFLOW_ADMIN_ROLES);
      return tx.workflowDefinition.create({ data: { tenantId, ...input } });
    });
    await this.cache.invalidateTenant(tenantId);
    return result;
  }

  async update(tenantId: string, authId: string, id: string, input: WorkflowDefinitionInput) {
    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      await requireRole(tx, tenantId, authId, WORKFLOW_ADMIN_ROLES);
      // Phase 4.8.5 [SEC-002]: өмнө нь `where: { id }` — өөр tenant-ийн definition-ийг id-аар засах боломжтой байсан
      // (апп postgres/BYPASSRLS-ээр). Одоо tenant шүүлттэй; олдохгүй → 404 (app_user-д RLS ч мөн хаана)
      const res = await tx.workflowDefinition.updateMany({ where: { id, tenantId }, data: input });
      if (res.count === 0) throw new NotFoundException('Workflow definition олдсонгүй');
      return tx.workflowDefinition.findFirstOrThrow({ where: { id, tenantId } });
    });
    await this.cache.invalidateTenant(tenantId);
    return result;
  }
}