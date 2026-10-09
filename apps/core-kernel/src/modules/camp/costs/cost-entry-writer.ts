import { CampCostSource, Prisma } from '@prisma/client';
import { Tx } from '../common/camp-tx';
import { toDbDate } from '../common/camp-tx';
import { computeVat } from './vat';

/**
 * Нэгдсэн зардлын бичигч (camp_cost_entries) — тайлангийн цорын ганц эх сурвалж, snapshot (засагдахгүй, DB trigger).
 * V1 (Шат 4): засварын сэлбэг (CATERING_PURCHASED). V2 (хойшлуулсан Шат 5–6, D8): бохир ус/хог, хоол (ижил бичигч).
 */
export interface MaintenancePartCost {
  id: string;
  partName: string;
  quantity: Prisma.Decimal | string | number;
  unit: string;
  unitPrice: Prisma.Decimal | string | number;
  vatIncluded: boolean;
}

export async function writeMaintenancePartCosts(
  tx: Tx,
  ctx: { tenantId: string; campId: string; requestNo: string; costDate: string; organizationId: string; vatRate: Prisma.Decimal | string | number; createdBy: string },
  parts: MaintenancePartCost[],
): Promise<number> {
  if (parts.length === 0) return 0;
  const res = await tx.campCostEntry.createMany({
    data: parts.map((p) => {
      const v = computeVat({ quantity: p.quantity, unitPrice: p.unitPrice, vatIncluded: p.vatIncluded, vatRate: ctx.vatRate });
      return {
        tenantId: ctx.tenantId,
        campId: ctx.campId,
        costDate: toDbDate(ctx.costDate),
        source: CampCostSource.MAINTENANCE_PART,
        maintenancePartId: p.id,
        organizationId: ctx.organizationId,
        description: `${ctx.requestNo}: ${p.partName}`.slice(0, 500),
        quantity: new Prisma.Decimal(p.quantity),
        unit: p.unit,
        unitPrice: new Prisma.Decimal(p.unitPrice),
        vatIncluded: p.vatIncluded,
        vatRate: new Prisma.Decimal(ctx.vatRate),
        netAmount: v.net,
        vatAmount: v.vat,
        grossAmount: v.gross,
        createdBy: ctx.createdBy,
      };
    }),
  });
  return res.count;
}
