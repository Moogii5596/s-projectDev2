import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaTenantClientService } from '../../db/prisma-tenant-client.service';

type Tx = Prisma.TransactionClient;
const num = (v: unknown) => Number(v ?? 0);
const money = (v: unknown) => new Prisma.Decimal((v as Prisma.Decimal | string | number | null) ?? 0).toFixed(2);

export interface ReportSummary {
  generatedAt: string;
  requisitions: { total: number; totalAmount: string; byStatus: Record<string, { count: number; amount: string }> };
  budget: {
    enforced: boolean;
    allocations: { department: string; period: string; total: string; committed: string; spent: string; utilizationPct: number }[];
  };
  inventory: { items: number; lowStock: number };
  vendors: { total: number; active: number };
}

/**
 * Report-lite — Phase 4.4: олон модулиас нэг tenant transaction-д уншина (RLS context нэг удаа),
 * JSON + CSV (шинэ dependency-гүй, Excel-д зориулж UTF-8 BOM).
 */
@Injectable()
export class ReportService {
  constructor(private readonly prisma: PrismaTenantClientService) {}

  summary(tenantId: string, now = new Date()): Promise<ReportSummary> {
    return this.prisma.$transaction(async (tx: Tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

      const mr = await tx.$queryRaw<{ status: string; count: bigint; amount: Prisma.Decimal }[]>`
        SELECT status::text AS status, count(*) AS count, COALESCE(sum(total_amount), 0) AS amount
        FROM mr_headers WHERE tenant_id = ${tenantId}::uuid GROUP BY status ORDER BY status
      `;
      const alloc = await tx.$queryRaw<
        { department: string; period: string; total: Prisma.Decimal; committed: Prisma.Decimal; spent: Prisma.Decimal; enforced: boolean }[]
      >`
        SELECT a.department, p.name AS period, a.total_amount AS total, a.committed_amount AS committed,
               a.spent_amount AS spent, true AS enforced
        FROM budget_allocations a JOIN budget_periods p ON p.id = a.period_id
        WHERE a.tenant_id = ${tenantId}::uuid AND p.is_active = true
        ORDER BY p.start_date DESC, a.department
      `;
      const enforced = await tx.$queryRaw<{ enforced: boolean }[]>`
        SELECT EXISTS (SELECT 1 FROM budget_periods WHERE tenant_id = ${tenantId}::uuid AND is_active = true) AS enforced
      `;
      const inv = await tx.$queryRaw<{ items: bigint; low: bigint }[]>`
        SELECT count(*) AS items, count(*) FILTER (WHERE quantity <= min_threshold) AS low
        FROM inventory_items WHERE tenant_id = ${tenantId}::uuid
      `;
      const ven = await tx.$queryRaw<{ total: bigint; active: bigint }[]>`
        SELECT count(*) AS total, count(*) FILTER (WHERE is_active) AS active
        FROM vendors WHERE tenant_id = ${tenantId}::uuid
      `;

      const byStatus: ReportSummary['requisitions']['byStatus'] = {};
      let total = 0;
      let totalAmount = new Prisma.Decimal(0);
      for (const r of mr) {
        byStatus[r.status] = { count: num(r.count), amount: money(r.amount) };
        total += num(r.count);
        totalAmount = totalAmount.plus(new Prisma.Decimal(r.amount ?? 0));
      }

      return {
        generatedAt: now.toISOString(),
        requisitions: { total, totalAmount: totalAmount.toFixed(2), byStatus },
        budget: {
          enforced: enforced[0]?.enforced === true,
          allocations: alloc.map((a) => {
            const t = new Prisma.Decimal(a.total);
            const used = new Prisma.Decimal(a.committed).plus(a.spent);
            return {
              department: a.department,
              period: a.period,
              total: money(a.total),
              committed: money(a.committed),
              spent: money(a.spent),
              utilizationPct: t.isZero() ? 0 : Number(used.div(t).times(100).toFixed(1)),
            };
          }),
        },
        inventory: { items: num(inv[0]?.items), lowStock: num(inv[0]?.low) },
        vendors: { total: num(ven[0]?.total), active: num(ven[0]?.active) },
      };
    });
  }

  /** CSV: section,key,value — Excel-д зөв нээгдэхийн тулд BOM + CRLF */
  async summaryCsv(tenantId: string): Promise<string> {
    const s = await this.summary(tenantId);
    const rows: (string | number)[][] = [['section', 'key', 'value']];
    rows.push(['requisitions', 'total', s.requisitions.total], ['requisitions', 'total_amount', s.requisitions.totalAmount]);
    for (const [status, v] of Object.entries(s.requisitions.byStatus)) {
      rows.push(['requisitions', `${status}.count`, v.count], ['requisitions', `${status}.amount`, v.amount]);
    }
    rows.push(['budget', 'enforced', String(s.budget.enforced)]);
    for (const a of s.budget.allocations) {
      rows.push(['budget', `${a.period} / ${a.department} utilization_pct`, a.utilizationPct]);
    }
    rows.push(['inventory', 'items', s.inventory.items], ['inventory', 'low_stock', s.inventory.lowStock]);
    rows.push(['vendors', 'total', s.vendors.total], ['vendors', 'active', s.vendors.active]);
    return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }
}

/** RFC 4180 + formula injection хамгаалалт (=,+,-,@ эхэлсэн текстийг ' угтна) */
export function csvCell(value: string | number): string {
  let s = String(value);
  if (typeof value === 'string' && /^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
