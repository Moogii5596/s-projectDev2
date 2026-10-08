import { EventEmitter2 } from '@nestjs/event-emitter';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../db/prisma.service';

@Injectable()
export class EscalationScheduler {
  private readonly logger = new Logger(EscalationScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  @Cron('*/15 * * * *')
  async checkOverdueSla(): Promise<number> {
    const overdue = await this.prisma.workflowSlaLog.findMany({
      where: { status: 'PENDING', dueAt: { lt: new Date() } },
      include: { instance: { include: { definition: true } } },
    });

    let escalated = 0;
    for (const sla of overdue) {
      try {
        const didEscalate = await this.escalateStep(sla);
        if (didEscalate) escalated += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Escalation failed for SLA ${sla.id}: ${message}`);
      }
    }

    if (escalated > 0) {
      this.logger.log(`Escalated ${escalated} overdue SLA items`);
    }
    return escalated;
  }

  private async escalateStep(sla: any): Promise<boolean> {
    const changed = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${sla.tenantId}, true)`;
      const steps = Array.isArray(sla.instance.resolvedSteps)
        ? sla.instance.resolvedSteps
        : Array.isArray(sla.instance.definition.stepsConfig)
          ? sla.instance.definition.stepsConfig
          : [];
      const nextStep = steps.find((step: { order: number }) => step.order > sla.stepOrder);
      const nextApprover = nextStep
        ? await tx.coreUser.findFirst({
            where: { tenantId: sla.tenantId, isActive: true, role: nextStep.role },
            select: { id: true },
          })
        : null;

      const result = await tx.workflowSlaLog.updateMany({
        where: { id: sla.id, status: 'PENDING' },
        data: {
          status: 'ESCALATED',
          escalatedAt: new Date(),
          escalatedToId: nextApprover?.id,
        },
      });

      if (result.count === 0) return { changed: false, nextStep, nextApprover };

      await tx.workflowInstance.update({
        where: { id: sla.instanceId },
        data: {
          escalationCount: { increment: 1 },
          ...(nextStep ? { currentStep: nextStep.order - 1 } : {}),
        },
      });

      if (nextStep && nextApprover) {
        await tx.workflowSlaLog.create({
          data: {
            tenantId: sla.tenantId,
            instanceId: sla.instanceId,
            stepOrder: nextStep.order,
            assignedToId: nextApprover.id,
            dueAt: new Date(Date.now() + sla.instance.definition.slaHours * 60 * 60 * 1000),
            status: 'PENDING',
          },
        });
      }
      return { changed: true, nextStep, nextApprover };
    });

    if (changed.changed) {
      this.events.emit('workflow.step.escalated', {
        tenantId: sla.tenantId,
        instanceId: sla.instanceId,
        stepOrder: sla.stepOrder,
        originalAssigneeId: sla.assignedToId,
        nextStepOrder: changed.nextStep?.order,
        nextRole: changed.nextStep?.role,
        nextAssigneeId: changed.nextApprover?.id,
      });
    }
    return changed.changed;
  }
}