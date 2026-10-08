import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../db/prisma.service';
import { CacheService } from '../../cache/cache.service';

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

  async list(tenantId: string): Promise<Prisma.WorkflowDefinitionGetPayload<{}>[]> {
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

  async create(tenantId: string, input: WorkflowDefinitionInput) {
    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return tx.workflowDefinition.create({ data: { tenantId, ...input } });
    });
    await this.cache.invalidateTenant(tenantId);
    return result;
  }

  async update(tenantId: string, id: string, input: WorkflowDefinitionInput) {
    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return tx.workflowDefinition.update({ where: { id }, data: input });
    });
    await this.cache.invalidateTenant(tenantId);
    return result;
  }
}