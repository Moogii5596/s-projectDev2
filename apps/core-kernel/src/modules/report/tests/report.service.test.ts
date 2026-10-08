import { describe, it, expect, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { ReportService, csvCell } from '../report.service';

describe('ReportService (Phase 4.4)', () => {
  const D = (v: number | string) => new Prisma.Decimal(v);
  function svcWith(results: Record<string, unknown[]>) {
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRaw: vi.fn(async (s: string[]) => {
        const q = s.join('?');
        const key = Object.keys(results).find((k) => q.includes(k));
        return key ? results[key] : [];
      }),
    };
    return { svc: new ReportService({ $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)) } as never), tx };
  }
  const base = {
    'FROM mr_headers': [{ status: 'APPROVED', count: 1n, amount: D(1000) }, { status: 'DRAFT', count: 2n, amount: D('150.5') }],
    'JOIN budget_periods': [{ department: 'IT', period: 'FY26', total: D(1000), committed: D(250), spent: D(500), enforced: true }],
    'AS enforced': [{ enforced: true }],
    'FROM inventory_items': [{ items: 25n, low: 7n }],
    'FROM vendors': [{ total: 2n, active: 1n }],
  };

  it('summary: нийлбэр, статусаар, ашиглалт %, bigint → number', async () => {
    const { svc, tx } = svcWith(base);
    const s = await svc.summary('t', new Date('2026-10-08T00:00:00Z'));
    expect(s.requisitions).toEqual({ total: 3, totalAmount: '1150.50', byStatus: { APPROVED: { count: 1, amount: '1000.00' }, DRAFT: { count: 2, amount: '150.50' } } });
    expect(s.budget).toEqual({ enforced: true, allocations: [{ department: 'IT', period: 'FY26', total: '1000.00', committed: '250.00', spent: '500.00', utilizationPct: 75 }] });
    expect([s.inventory, s.vendors]).toEqual([{ items: 25, lowStock: 7 }, { total: 2, active: 1 }]);
    expect(tx.$executeRaw.mock.calls[0][1]).toBe('t'); // RLS context нэг transaction-д
  });

  it('summary: хоосон tenant → 0-ууд', async () => {
    const s = await svcWith({}).svc.summary('t');
    expect([s.requisitions.total, s.requisitions.totalAmount, s.budget.enforced, s.inventory.items]).toEqual([0, '0.00', false, 0]);
  });

  it('CSV: BOM, CRLF, утгууд', async () => {
    const csv = await svcWith(base).svc.summaryCsv('t');
    expect(csv.startsWith('﻿section,key,value\r\n')).toBe(true);
    expect(csv).toContain('requisitions,DRAFT.amount,150.50\r\n');
    expect(csv).toContain('budget,FY26 / IT utilization_pct,75\r\n');
  });

  it.each([
    ['энгийн', 'IT', 'IT'],
    ['таслал', 'a,b', '"a,b"'],
    ['хашилт', 'a"b', '"a""b"'],
    ['formula injection', '=HYPERLINK("x")', `"'=HYPERLINK(""x"")"`],
    ['сөрөг тоо (number) хэвээр', -5, '-5'],
  ])('csvCell: %s', (_l, input, out) => {
    expect(csvCell(input as string | number)).toBe(out);
  });
});
