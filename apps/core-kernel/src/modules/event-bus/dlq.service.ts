import { Prisma } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { SystemPrismaService } from '../../db/system-prisma.service'; // Phase 4.8.4

@Injectable()
export class DlqService {
  constructor(private readonly prisma: SystemPrismaService) {}

  /**
   * Phase 5.0: `tx` өгвөл outbox-ийн DLQ төлөвтэй ижил transaction-д бичнэ (хамт commit/rollback)
   */
  async createDlqRecord(
    originalEvent: Record<string, unknown>,
    errorMessage: string,
    tx?: Pick<Prisma.TransactionClient, 'dlqEvent'>,
  ): Promise<void> {
    await (tx ?? this.prisma).dlqEvent.create({
      data: {
        tenantId:      originalEvent['tenant_id'] as string,
        originalEvent: originalEvent as Prisma.InputJsonValue,
        errorMessage,
        status:        'PENDING',
      },
    });
  }
}
