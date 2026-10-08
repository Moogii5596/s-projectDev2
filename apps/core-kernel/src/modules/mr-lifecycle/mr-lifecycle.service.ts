import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BudgetMrInput, BudgetService } from '../budget/budget.service';

type Tx = Prisma.TransactionClient;

/**
 * MrLifecycleService — Phase 4.0 (2026-10-08 шийдвэр: модулиуд transaction дотор шууд)
 *
 * MR-ийн төлөв солигдох ҮЕД (тухайн transaction дотор) бусад модулийг дуудна.
 * MR батлах 2 зам хоёулаа энийг дуудна:
 *   - MaterialRequisitionService.submit / approve / reject
 *   - WorkflowService.approveStep (сүүлийн алхам) / rejectStep
 * Аль нэг модуль алдаа шидвэл бүх transaction rollback (MR төлөв өөрчлөгдөхгүй).
 *
 * Sprint 10-д event consumer руу шилжүүлж болно — интерфэйс нь энэ файл.
 */
@Injectable()
export class MrLifecycleService {
  constructor(private readonly budget: BudgetService) {}

  /** RULE-04: шинэ модулийн хүснэгтүүд FORCE RLS — transaction дотор tenant context заавал */
  private async setTenant(tx: Tx, tenantId: string): Promise<void> {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
  }

  /** DRAFT → PENDING_APPROVAL: төсөв шалгаж commit (хүрэлцэхгүй → 400) */
  async onSubmitted(tx: Tx, tenantId: string, mr: BudgetMrInput, now = new Date()): Promise<void> {
    await this.setTenant(tx, tenantId);
    await this.budget.commitForMr(tx, tenantId, mr, now);
  }

  /** → APPROVED: төсөв SPENT (Phase 4.2: агуулахын нөөцлөлт энд нэмэгдэнэ) */
  async onApproved(tx: Tx, tenantId: string, mrId: string): Promise<void> {
    await this.setTenant(tx, tenantId);
    await this.budget.markSpentForMr(tx, tenantId, mrId);
  }

  /** → REJECTED: төсөв RELEASED */
  async onRejected(tx: Tx, tenantId: string, mrId: string): Promise<void> {
    await this.setTenant(tx, tenantId);
    await this.budget.releaseForMr(tx, tenantId, mrId);
  }
}
