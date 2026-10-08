import { Prisma } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { PrismaService }          from '../../db/prisma.service';
import { PessimisticLockService } from './pessimistic-lock.service';
import { resolveUserId }          from '../../common/helpers/resolve-user-id.helper';
import { EventBusService }        from '../event-bus/event-bus.service';
import { EventTypes }             from '../event-bus/interfaces/cloud-event.interface';
import { MrLifecycleService }     from '../mr-lifecycle/mr-lifecycle.service';

export interface CreateInstanceParams {
  tenantId:     string;
  definitionId: string;
  entityId:     string;
  entityType?:  string;
}

export interface ApproveStepParams {
  authId:     string;   // Supabase auth_id — RULE-13 input
  tenantId:   string;
  instanceId: string;
  comment?:   string;
}

export type RejectStepParams = ApproveStepParams;

/**
 * WorkflowService
 *
 * RULE-03: set_config (SET LOCAL биш)
 * RULE-04: $executeRaw + Prisma query → нэгдсэн $transaction
 * RULE-13: authId → resolveUserId() → core_users.id
 */
@Injectable()
export class WorkflowService {
  constructor(
    private readonly prisma:       PrismaService,
    private readonly lockSvc:      PessimisticLockService,
    private readonly eventBusSvc:  EventBusService,
    private readonly lifecycle:    MrLifecycleService,  // Phase 4: MR батлах 2 дахь зам
  ) {}

  /**
   * Шинэ workflow instance үүсгэх (PENDING төлөвтэй)
   */
  async createInstance(params: CreateInstanceParams) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // RULE-03
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${params.tenantId}, true)`;

      return tx.workflowInstance.create({
        data: {
          tenantId:    params.tenantId,
          definitionId: params.definitionId,
          entityId:    params.entityId,
          entityType:  params.entityType ?? 'MATERIAL_REQUISITION',
          status:      'PENDING',
          currentStep: 0,
        },
      });
    });
  }

  /**
   * Workflow алхамыг батлах
   *
   * 1. RULE-13: authId → core_users.id
   * 2. Pessimistic lock авах
   * 3. Step log нэмэх
   * 4. Бүх алхам дуусвал → status='APPROVED', mr_headers sync
   */
  async approveStep(params: ApproveStepParams) {
    // RULE-13: authId → core_users.id
    const actorId = await resolveUserId(this.prisma, params.authId, params.tenantId);

    // Pessimistic lock
    await this.lockSvc.acquireLock(params.instanceId, actorId, params.tenantId);

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // RULE-03
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${params.tenantId}, true)`;

      const instance = await tx.workflowInstance.findUniqueOrThrow({
        where:   { id: params.instanceId },
        include: { definition: true },
      });

      const steps     = (instance.resolvedSteps ?? instance.definition.stepsConfig) as Array<{ order: number; role: string; quorum: number }>;
      const nextStep  = instance.currentStep + 1;
      const isLastStep = nextStep >= steps.length;

      // Step log бүртгэх
      await tx.workflowStepLog.create({
        data: {
          tenantId:   params.tenantId,
          instanceId: params.instanceId,
          stepOrder:  instance.currentStep,
          actorId,                           // RULE-13: core_users.id
          action:     'APPROVED',
          comment:    params.comment,
        },
      });

      if (isLastStep) {
        // Бүх алхам дуусав → APPROVED
        await tx.workflowInstance.update({
          where: { id: params.instanceId },
          data:  {
            status:      'APPROVED',
            currentStep: nextStep,
            lockedBy:    null,
            lockedAt:    null,
          },
        });

        // mr_headers sync — RULE-04: executeRaw нь $transaction дотор
        await tx.$executeRaw`
          UPDATE mr_headers
          SET status = 'APPROVED', updated_at = now()
          WHERE workflow_instance_id = ${params.instanceId}::uuid
        `;

        // Phase 4.1: төсөв SPENT (MR-ийн workflow бол)
        if (instance.entityType === 'MATERIAL_REQUISITION' && instance.entityId) {
          await this.lifecycle.onApproved(tx, params.tenantId, instance.entityId);
        }

        // Sprint 3: Transactional Outbox — RULE-04: tx дотор emit
        await this.eventBusSvc.emit({
          tx:          tx as any,
          tenantId:    params.tenantId,
          eventType:   EventTypes.MR_APPROVED,
          aggregateId: params.instanceId,
          data:        { instanceId: params.instanceId, actorId, comment: params.comment },
        });
      } else {
        // Дараагийн алхам руу шилжих
        await tx.workflowInstance.update({
          where: { id: params.instanceId },
          data:  {
            currentStep: nextStep,
            lockedBy:    null,
            lockedAt:    null,
          },
        });
      }
    });
  }

  /**
   * Workflow алхамыг татгалзах
   *
   * 1. RULE-13: authId → core_users.id
   * 2. Pessimistic lock авах
   * 3. Step log нэмэх (REJECTED)
   * 4. status='REJECTED', mr_headers sync
   */
  async rejectStep(params: RejectStepParams) {
    // RULE-13
    const actorId = await resolveUserId(this.prisma, params.authId, params.tenantId);

    // Pessimistic lock
    await this.lockSvc.acquireLock(params.instanceId, actorId, params.tenantId);

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // RULE-03
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${params.tenantId}, true)`;

      const instance = await tx.workflowInstance.findUniqueOrThrow({
        where: { id: params.instanceId },
      });

      await tx.workflowStepLog.create({
        data: {
          tenantId:   params.tenantId,
          instanceId: params.instanceId,
          stepOrder:  instance.currentStep,
          actorId,                           // RULE-13: core_users.id
          action:     'REJECTED',
          comment:    params.comment,
        },
      });

      await tx.workflowInstance.update({
        where: { id: params.instanceId },
        data:  {
          status:   'REJECTED',
          lockedBy: null,
          lockedAt: null,
        },
      });

      // mr_headers sync — RULE-04
      await tx.$executeRaw`
        UPDATE mr_headers
        SET status = 'REJECTED', updated_at = now()
        WHERE workflow_instance_id = ${params.instanceId}::uuid
      `;

      // Phase 4.1: төсөв RELEASED (MR-ийн workflow бол)
      if (instance.entityType === 'MATERIAL_REQUISITION' && instance.entityId) {
        await this.lifecycle.onRejected(tx, params.tenantId, instance.entityId);
      }

      // Sprint 3: Transactional Outbox — RULE-04: tx дотор emit
      await this.eventBusSvc.emit({
        tx:          tx as any,
        tenantId:    params.tenantId,
        eventType:   EventTypes.MR_REJECTED,
        aggregateId: params.instanceId,
        data:        { instanceId: params.instanceId, actorId, comment: params.comment },
      });
    });
  }
}
