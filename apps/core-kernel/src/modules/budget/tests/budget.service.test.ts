import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { BudgetService, budgetDate } from '../budget.service';

// Phase 4.1 — BudgetService логик (SQL нь PostgreSQL 16 дээр тусад нь шалгагдсан — lessons [BUDGET-*])
// RULE-10: new Service(mock as never)
const T = 'aaaaaaaa-0000-0000-0000-00000000000a';
const MR = 'cccccccc-0000-0000-0000-00000000000c';
const ALLOC = { id: 'al-1', department: 'IT', total_amount: new Prisma.Decimal(1000), committed_amount: new Prisma.Decimal(300), spent_amount: new Prisma.Decimal(200) };

/** $queryRaw дуудлагыг SQL текстээр нь ялгаж хариулна */
function makeTx(opts: { enforced?: boolean; allocation?: typeof ALLOC | null; commitment?: { id: string; allocation_id: string; amount: Prisma.Decimal } | null; role?: UserRole | null }) {
  const sqlOf = (s: TemplateStringsArray) => s.join('?');
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn(async (s: TemplateStringsArray) => {
      const q = sqlOf(s);
      if (q.includes('AS enforced')) return [{ enforced: opts.enforced ?? true }];
      if (q.includes('FROM budget_allocations a JOIN budget_periods')) return opts.allocation ? [opts.allocation] : [];
      if (q.includes('FROM budget_commitments')) return opts.commitment ? [opts.commitment] : [];
      if (q.includes('FROM budget_allocations WHERE id')) return opts.allocation ? [opts.allocation] : [];
      throw new Error('unexpected SQL: ' + q);
    }),
    budgetCommitment: { create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
    budgetPeriod: { create: vi.fn().mockResolvedValue({ id: 'p1' }), findFirst: vi.fn().mockResolvedValue({ id: 'p1' }), findMany: vi.fn().mockResolvedValue([]) },
    budgetAllocation: { create: vi.fn().mockResolvedValue({ id: 'a1' }), update: vi.fn().mockResolvedValue({ id: 'a1' }), findMany: vi.fn().mockResolvedValue([]) },
    coreUser: { findFirst: vi.fn().mockResolvedValue(opts.role === null ? null : { id: 'cu-1', role: opts.role ?? UserRole.ADMIN }) },
  };
  return tx;
}
const executedSql = (tx: ReturnType<typeof makeTx>) => tx.$executeRaw.mock.calls.map((c) => (c[0] as TemplateStringsArray).join('?'));

describe('BudgetService — ledger (MR transaction дотор)', () => {
  const svc = new BudgetService({} as never);
  const now = new Date('2026-10-08T03:00:00Z');

  it('идэвхтэй хугацаагүй tenant → хяналтгүй (false), юу ч бичихгүй', async () => {
    const tx = makeTx({ enforced: false });
    await expect(svc.commitForMr(tx as never, T, { id: MR, department: null, totalAmount: 1e9 }, now)).resolves.toBe(false);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.budgetCommitment.create).not.toHaveBeenCalled();
  });

  it.each([null, '', '   '])('хяналттай + хэлтэс "%s" → 400', async (department) => {
    await expect(svc.commitForMr(makeTx({}) as never, T, { id: MR, department, totalAmount: 1 }, now)).rejects.toThrow(/хэлтэс \(department\) заавал/);
  });

  it('хэлтсийн төсөв олдохгүй → 400 (огноо дурдана)', async () => {
    await expect(
      svc.commitForMr(makeTx({ allocation: null }) as never, T, { id: MR, department: 'HR', totalAmount: 1 }, now),
    ).rejects.toThrow(/"HR" хэлтэст 2026-10-08/);
  });

  it('хүрэлцэхгүй (үлдэгдэл 500 < 501) → 400, бичихгүй', async () => {
    const tx = makeTx({ allocation: ALLOC });
    await expect(svc.commitForMr(tx as never, T, { id: MR, department: 'IT', totalAmount: 501 }, now)).rejects.toThrow(BadRequestException);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('яг үлдэгдэлтэй тэнцүү (500) → commit: committed += 500, COMMITTED бичлэг', async () => {
    const tx = makeTx({ allocation: ALLOC });
    await expect(svc.commitForMr(tx as never, T, { id: MR, department: 'IT', totalAmount: '500.00' }, now)).resolves.toBe(true);
    expect(executedSql(tx)[0]).toContain('committed_amount = committed_amount +');
    expect(tx.$executeRaw.mock.calls[0][1]).toBe('500');
    expect(tx.budgetCommitment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: T, allocationId: 'al-1', mrHeaderId: MR, status: 'COMMITTED' }),
    });
  });

  it('commit үед allocation-ийг FOR UPDATE-ээр түгжинэ', async () => {
    const tx = makeTx({ allocation: ALLOC });
    await svc.commitForMr(tx as never, T, { id: MR, department: 'IT', totalAmount: 1 }, now);
    const lockSql = tx.$queryRaw.mock.calls.map((c) => (c[0] as TemplateStringsArray).join('?')).find((q) => q.includes('JOIN budget_periods'));
    expect(lockSql).toContain('FOR UPDATE OF a');
    expect(lockSql).toContain('lower(btrim(a.department)) = lower(btrim(');
  });

  it('0 дүнтэй MR → төсөв шалгана, гэхдээ commitment үүсгэхгүй', async () => {
    const tx = makeTx({ allocation: ALLOC });
    await expect(svc.commitForMr(tx as never, T, { id: MR, department: 'IT', totalAmount: 0 }, now)).resolves.toBe(false);
    expect(tx.budgetCommitment.create).not.toHaveBeenCalled();
  });

  it('markSpentForMr: COMMITTED → SPENT (committed −, spent +)', async () => {
    const tx = makeTx({ commitment: { id: 'c1', allocation_id: 'al-1', amount: new Prisma.Decimal(250) } });
    await expect(svc.markSpentForMr(tx as never, T, MR)).resolves.toBe(true);
    expect(executedSql(tx)[0]).toMatch(/committed_amount = committed_amount -[\s\S]*spent_amount\s+= spent_amount \+/);
    expect(tx.budgetCommitment.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { status: 'SPENT' } });
  });

  it('releaseForMr: COMMITTED → RELEASED (зөвхөн committed −)', async () => {
    const tx = makeTx({ commitment: { id: 'c1', allocation_id: 'al-1', amount: new Prisma.Decimal(250) } });
    await expect(svc.releaseForMr(tx as never, T, MR)).resolves.toBe(true);
    expect(executedSql(tx)[0]).not.toContain('spent_amount');
    expect(tx.budgetCommitment.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { status: 'RELEASED' } });
  });

  it('commitment байхгүй (хяналтгүй / аль хэдийн шийдэгдсэн) → false, idempotent', async () => {
    const tx = makeTx({ commitment: null });
    await expect(svc.markSpentForMr(tx as never, T, MR)).resolves.toBe(false);
    await expect(svc.releaseForMr(tx as never, T, MR)).resolves.toBe(false);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});

describe('BudgetService — CRUD / эрх', () => {
  function svcWith(tx: ReturnType<typeof makeTx>) {
    const prisma = { $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)) };
    return new BudgetService(prisma as never);
  }

  it('бүх transaction set_config-оор эхэлнэ (RULE-04)', async () => {
    const tx = makeTx({});
    await svcWith(tx).listPeriods(T, {});
    expect(executedSql(tx)[0]).toContain("set_config('app.tenant_id'");
    expect(tx.$executeRaw.mock.calls[0][1]).toBe(T);
  });

  it.each([UserRole.REQUESTER, UserRole.APPROVER, UserRole.VIEWER])('%s → хугацаа үүсгэх 403', async (role) => {
    await expect(
      svcWith(makeTx({ role })).createPeriod(T, 'auth-1', { name: 'x', periodType: 'ANNUAL', startDate: '2026-01-01', endDate: '2026-12-31' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('ADMIN → хугацаа үүсгэнэ (огноо UTC 00:00)', async () => {
    const tx = makeTx({ role: UserRole.ADMIN });
    await svcWith(tx).createPeriod(T, 'auth-1', { name: ' 2026 ', periodType: 'ANNUAL', startDate: '2026-01-01', endDate: '2026-12-31' });
    expect(tx.budgetPeriod.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: '2026', startDate: new Date('2026-01-01T00:00:00.000Z'), isActive: true }),
    });
  });

  it('endDate < startDate → 400', async () => {
    await expect(
      svcWith(makeTx({})).createPeriod(T, 'a', { name: 'x', periodType: 'ANNUAL', startDate: '2026-12-31', endDate: '2026-01-01' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('allocation: хугацаа олдохгүй → 404; давхар хэлтэс (P2002) → 409', async () => {
    const tx = makeTx({});
    tx.budgetPeriod.findFirst.mockResolvedValueOnce(null);
    await expect(svcWith(tx).createAllocation(T, 'a', { periodId: 'p', department: 'IT', totalAmount: 1 })).rejects.toThrow(NotFoundException);
    tx.budgetAllocation.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5.22.0' }));
    await expect(svcWith(tx).createAllocation(T, 'a', { periodId: 'p', department: 'IT', totalAmount: 1 })).rejects.toThrow(ConflictException);
  });

  it('updateAllocation: шинэ дүн < ашигласан (500) → 400', async () => {
    await expect(svcWith(makeTx({ allocation: ALLOC })).updateAllocation(T, 'a', 'al-1', { totalAmount: 499 })).rejects.toThrow(/500\.00/);
  });

  it('check: хяналтгүй / төсөвгүй / хүрэлцэх эсэх', async () => {
    await expect(svcWith(makeTx({ enforced: false })).check(T, { department: 'IT', amount: 1 })).resolves.toEqual({ enforced: false, ok: true });
    await expect(svcWith(makeTx({ allocation: null })).check(T, { department: 'IT', amount: 1 })).resolves.toMatchObject({ ok: false, reason: 'NO_ALLOCATION' });
    const r = await svcWith(makeTx({ allocation: ALLOC })).check(T, { department: 'IT', amount: 501 });
    expect(r).toMatchObject({ enforced: true, ok: false, allocationId: 'al-1' });
    expect(String(r.remainingAmount)).toBe('500');
  });
});

describe('budgetDate()', () => {
  it('Asia/Ulaanbaatar огноо (UTC 16:30 → дараа өдөр)', () => {
    expect(budgetDate(new Date('2026-12-31T16:30:00Z'))).toBe('2027-01-01');
    expect(budgetDate(new Date('2026-12-31T15:30:00Z'))).toBe('2026-12-31');
  });
});
