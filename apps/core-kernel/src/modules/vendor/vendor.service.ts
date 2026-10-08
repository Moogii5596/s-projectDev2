import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaTenantClientService } from '../../db/prisma-tenant-client.service';
import { requireRole } from '../../common/helpers/require-role.helper';
import { CreateVendorDto, QueryVendorDto, UpdateVendorDto } from './vendor.dto';

type Tx = Prisma.TransactionClient;
const WRITE_ROLES = [UserRole.OWNER, UserRole.ADMIN];

/**
 * Vendor-lite — Phase 4.3: хамгийн энгийн CRUD + RLS (шинэ модулийн загвар, Module_Template.md).
 */
@Injectable()
export class VendorService {
  constructor(private readonly prisma: PrismaTenantClientService) {}

  private inTenantTx<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx: Tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    });
  }

  list(tenantId: string, query: QueryVendorDto) {
    return this.inTenantTx(tenantId, (tx) =>
      tx.vendor.findMany({
        where: { tenantId, ...(query.activeOnly ? { isActive: true } : {}) },
        orderBy: { name: 'asc' },
      }),
    );
  }

  create(tenantId: string, authId: string, dto: CreateVendorDto) {
    return this.inTenantTx(tenantId, async (tx) => {
      await requireRole(tx, tenantId, authId, WRITE_ROLES);
      return tx.vendor.create({ data: { tenantId, name: dto.name, regNumber: dto.regNumber || null } });
    });
  }

  update(tenantId: string, authId: string, id: string, dto: UpdateVendorDto) {
    return this.inTenantTx(tenantId, async (tx) => {
      await requireRole(tx, tenantId, authId, WRITE_ROLES);
      const existing = await tx.vendor.findFirst({ where: { id, tenantId }, select: { id: true } });
      if (!existing) throw new NotFoundException('Нийлүүлэгч олдсонгүй');
      return tx.vendor.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.regNumber !== undefined ? { regNumber: dto.regNumber || null } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });
    });
  }
}
