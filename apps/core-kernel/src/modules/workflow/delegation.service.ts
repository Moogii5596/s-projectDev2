import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../db/prisma.service';
import { EventBusService } from '../event-bus/event-bus.service';

const DELEGATION_EVENT = 'mn.s-project.workflow.approval-delegated';

export interface CreateDelegationDto {
  delegatorId: string;
  delegateId: string;
  validFrom?: Date | string;
  validUntil: Date | string;
  reason?: string;
}

@Injectable()
export class DelegationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  async listDelegations(tenantId: string) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return tx.workflowDelegation.findMany({
        where: { tenantId },
        orderBy: { validUntil: 'asc' },
      });
    });
  }

  async createDelegation(tenantId: string, dto: CreateDelegationDto) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

      const existing = await tx.workflowDelegation.findFirst({
        where: {
          tenantId,
          delegatorId: dto.delegatorId,
          isActive: true,
          validUntil: { gt: new Date() },
        },
      });

      if (existing) {
        throw new ConflictException('Идэвхтэй delegation аль хэдийн байна');
      }

      const { validFrom, validUntil, ...delegation } = dto;
      return tx.workflowDelegation.create({
        data: {
          tenantId,
          ...delegation,
          validFrom: validFrom ? new Date(validFrom) : undefined,
          validUntil: new Date(validUntil),
        },
      });
    });
  }

  async resolveApprover(tenantId: string, userId: string): Promise<string> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

      const delegation = await tx.workflowDelegation.findFirst({
        where: {
          tenantId,
          delegatorId: userId,
          isActive: true,
          validFrom: { lte: new Date() },
          validUntil: { gt: new Date() },
        },
      });

      if (delegation) {
        await this.eventBus.emit({
          tx,
          tenantId,
          eventType: DELEGATION_EVENT,
          aggregateId: delegation.id,
          data: {
            delegationId: delegation.id,
            delegatorId: userId,
            delegateId: delegation.delegateId,
            notificationType: 'APPROVAL_DELEGATED',
          },
        });
      }

      return delegation?.delegateId ?? userId;
    });
  }

  async revokeDelegation(tenantId: string, delegationId: string) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

      const delegation = await tx.workflowDelegation.findFirst({
        where: { id: delegationId, tenantId, isActive: true },
      });

      if (!delegation) {
        throw new NotFoundException('Delegation олдсонгүй');
      }

      return tx.workflowDelegation.update({
        where: { id: delegationId },
        data: { isActive: false },
      });
    });
  }
}