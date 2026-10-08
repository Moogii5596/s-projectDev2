import { Prisma } from '@prisma/client';
import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../db/prisma.service';

/**
 * Pessimistic Lock Service
 *
 * RULE-03: set_config('app.tenant_id', ...) — SET LOCAL ХОРИГЛОНО
 * RULE-04: $executeRaw + model query → нэгдсэн $transaction дотор
 * RULE-13: userId = core_users.id (authId биш)
 */
@Injectable()
export class PessimisticLockService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Workflow instance-д pessimistic lock авах (FOR UPDATE NOWAIT)
   * Өөр transaction барьсан бол ConflictException хаяна
   */
  async acquireLock(
    instanceId: string,
    userId: string,   // RULE-13: core_users.id
    tenantId: string,
  ) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // RULE-03: set_config (SET LOCAL биш)
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

      // FOR UPDATE NOWAIT — өөр transaction барьсан бол PostgreSQL алдаа хаяна
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          locked_by: string | null;
          status: string;
        }>
      >`
        SELECT id, locked_by, status
        FROM workflow_instances
        WHERE id = ${instanceId}::uuid
        FOR UPDATE NOWAIT
      `;

      if (!rows[0]) {
        throw new NotFoundException(`Workflow instance not found: ${instanceId}`);
      }

      if (rows[0].locked_by && rows[0].locked_by !== userId) {
        throw new ConflictException(
          `Instance is locked by another user: ${rows[0].locked_by}`,
        );
      }

      // RULE-04: executeRaw + model query → нэг $transaction дотор
      await tx.$executeRaw`
        UPDATE workflow_instances
        SET locked_by = ${userId}::uuid,
            locked_at = now(),
            updated_at = now()
        WHERE id = ${instanceId}::uuid
      `;

      return rows[0];
    });
  }

  /**
   * Lock суллах
   */
  async releaseLock(instanceId: string, tenantId: string): Promise<void> {
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // RULE-03
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

      await tx.$executeRaw`
        UPDATE workflow_instances
        SET locked_by = NULL,
            locked_at = NULL,
            updated_at = now()
        WHERE id = ${instanceId}::uuid
      `;
    });
  }
}
