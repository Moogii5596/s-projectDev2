import { Prisma } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../db/prisma.service';

@Injectable()
export class DlqService {
  constructor(private readonly prisma: PrismaService) {}

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
