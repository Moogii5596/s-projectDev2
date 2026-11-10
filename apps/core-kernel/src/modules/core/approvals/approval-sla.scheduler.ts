import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { UserRole } from '@prisma/client';
import { SystemPrismaService } from '../../../db/system-prisma.service';
import { inTenantTx } from '../../../db/tenant-tx';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { NotificationService } from '../notifications/notification.service';
import { ApprovalEntityRegistry } from './approval-entity.registry';
import { ScheduledJobRegistry } from '../scheduler/scheduled-job.registry';

export const APPROVAL_SLA_CRON = '*/15 * * * *';

/**
 * v0.2.4 Блок 6 (WF-06, WF-01) — SLA хэтэрсэн алхмын escalation.
 *   - Алхмыг АЛГАСАХГҮЙ (WF-01-ийн засвар): SLA мөр ESCALATED, хариуцагч = tenant admin (OWNER/ADMIN — аль ч алхмыг батлах эрхтэй),
 *     admin + алхмын хариуцагчид мэдэгдэл. Урсгал хэвийн шийдвэрээр үргэлжилнэ.
 *   - Зөвхөн `escalation_enabled` урсгал. `ESCALATION_CRON=off` → алгасна (тест `checkOverdue()`-г шууд дуудна).
 */
@Injectable()
export class ApprovalSlaScheduler {
  private readonly logger = new Logger(ApprovalSlaScheduler.name);

  constructor(
    private readonly system: SystemPrismaService,
    private readonly prisma: PrismaTenantClientService,
    private readonly notifications: NotificationService,
    private readonly registry: ApprovalEntityRegistry,
    private readonly jobs: ScheduledJobRegistry,
    private readonly config?: ConfigService,
  ) {
    this.jobs.register({ id: 'approval-sla', module: 'core', cron: APPROVAL_SLA_CRON });
  }

  @Cron(APPROVAL_SLA_CRON, { name: 'approval-sla' })
  async onTick(): Promise<void> {
    if (this.config?.get<string>('ESCALATION_CRON')?.trim().toLowerCase() === 'off') return;
    await this.jobs.run('approval-sla', async () => {
      try {
        return await this.checkOverdue();
      } catch (err) {
        this.logger.error(`SLA escalation: ${(err as Error).message}`);
        throw err;
      }
    });
  }

  async checkOverdue(): Promise<number> {
    const overdue = await this.system.workflowSlaLog.findMany({
      where: { status: 'PENDING', dueAt: { lt: new Date() }, instance: { status: 'PENDING', definition: { escalationEnabled: true } } },
      select: { id: true, tenantId: true, instanceId: true, assignedToId: true, instance: { select: { entityType: true, title: true } } },
      take: 200,
    });
    let escalated = 0;
    for (const sla of overdue) {
      try {
        const done = await inTenantTx(this.prisma, sla.tenantId, async (tx) => {
          const admins = (await tx.coreUser.findMany({
            where: { tenantId: sla.tenantId, isActive: true, role: { in: [UserRole.OWNER, UserRole.ADMIN] } },
            select: { id: true }, orderBy: { createdAt: 'asc' },
          })).map((u) => u.id);
          const res = await tx.workflowSlaLog.updateMany({
            where: { id: sla.id, status: 'PENDING' },
            data: { status: 'ESCALATED', escalatedAt: new Date(), escalatedToId: admins[0] ?? null },
          });
          if (res.count === 0) return false;
          await tx.workflowInstance.update({ where: { id: sla.instanceId }, data: { escalationCount: { increment: 1 } } });
          await this.notifications.notify(tx, sla.tenantId, {
            type: 'core.approval.overdue',
            recipients: [...admins, sla.assignedToId],
            titleKey: 'notify.approval.overdue.title',
            params: { entityKey: this.registry.get(sla.instance.entityType)?.labelKey ?? sla.instance.entityType, title: sla.instance.title ?? '' },
            link: `/approvals/${sla.instanceId}`,
          });
          return true;
        });
        if (done) escalated += 1;
      } catch (err) {
        this.logger.error(`SLA ${sla.id} escalation алдаа: ${(err as Error).message}`);
      }
    }
    if (escalated > 0) this.logger.log(`SLA хэтэрсэн ${escalated} алхам escalate хийв`);
    return escalated;
  }
}
