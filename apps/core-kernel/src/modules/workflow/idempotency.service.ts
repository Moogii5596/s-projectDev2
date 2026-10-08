import { Prisma } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../db/prisma.service';

export interface IdempotencyResult {
  code: number;
  body: object;
  cached: boolean;
}

/**
 * Idempotency Service
 *
 * RULE-03: set_config — SET LOCAL ХОРИГЛОНО
 * RULE-04: $executeRaw + Prisma query → нэгдсэн $transaction дотор
 *
 * Ижил (key, tenantId) хосоор 24 цагийн дотор ирсэн хүсэлтэд
 * cached response буцаана.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotency шалгаж, cache-д хадгалах
   *
   * @param key       - Клиентийн илгээсэн idempotency key
   * @param tenantId  - Tenant UUID
   * @param execute   - Хийх ажиллагаа (шинэ хүсэлт бол л дуудагдана)
   */
  async checkAndStore(
    key: string,
    tenantId: string,
    execute: () => Promise<{ code: number; body: object }>,
  ): Promise<IdempotencyResult> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // RULE-03
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

      // Өмнө хадгалсан байвал cached хариу буцаана
      const existing = await tx.idempotencyKey.findUnique({
        where: { key_tenantId: { key, tenantId } },
      });

      if (existing) {
        return {
          code: existing.responseCode,
          body: existing.responseBody as object,
          cached: true,
        };
      }

      // Шинэ хүсэлт — execute хийж, хадгална
      const result = await execute();

      await tx.idempotencyKey.create({
        data: {
          key,
          tenantId,
          responseCode: result.code,
          responseBody: result.body,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      return { ...result, cached: false };
    });
  }
}
