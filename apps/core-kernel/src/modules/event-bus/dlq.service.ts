import { Prisma } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { SystemPrismaService } from '../../db/system-prisma.service'; // Phase 4.8.4

@Injectable()
export class DlqService {
  constructor(private readonly prisma: SystemPrismaService) {}

  async createDlqRecord(originalEvent: Record<string, unknown>, errorMessage: string): Promise<void> {
    await this.prisma.dlqEvent.create({
      data: {
        tenantId:      originalEvent['tenant_id'] as string,
        originalEvent: originalEvent as Prisma.InputJsonValue,
        errorMessage,
        status:        'PENDING',
      },
    });
  }
}
