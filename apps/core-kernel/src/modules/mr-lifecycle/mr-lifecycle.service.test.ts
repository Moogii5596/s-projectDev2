import { describe, it, expect, vi } from 'vitest';
import { MrLifecycleService } from './mr-lifecycle.service';

describe('MrLifecycleService (Phase 4.0)', () => {
  const T = 't-1';
  function make() {
    const budget = {
      commitForMr: vi.fn().mockResolvedValue(true),
      markSpentForMr: vi.fn().mockResolvedValue(true),
      releaseForMr: vi.fn().mockResolvedValue(true),
    };
    const order: string[] = [];
    const tx = { $executeRaw: vi.fn(async () => { order.push('set_config'); return 1; }) };
    Object.values(budget).forEach((fn) => fn.mockImplementation(async () => { order.push('budget'); return true; }));
    return { svc: new MrLifecycleService(budget as never), budget, tx, order };
  }

  it('onSubmitted: set_config → budget.commitForMr (ижил tx)', async () => {
    const { svc, budget, tx, order } = make();
    const now = new Date();
    await svc.onSubmitted(tx as never, T, { id: 'mr', department: 'IT', totalAmount: 5 }, now);
    expect(order).toEqual(['set_config', 'budget']);
    expect(budget.commitForMr).toHaveBeenCalledWith(tx, T, { id: 'mr', department: 'IT', totalAmount: 5 }, now);
  });

  it('onApproved → markSpentForMr, onRejected → releaseForMr', async () => {
    const { svc, budget, tx } = make();
    await svc.onApproved(tx as never, T, 'mr');
    await svc.onRejected(tx as never, T, 'mr');
    expect(budget.markSpentForMr).toHaveBeenCalledWith(tx, T, 'mr');
    expect(budget.releaseForMr).toHaveBeenCalledWith(tx, T, 'mr');
  });

  it('budget алдаа шидвэл дээш дамжина (MR transaction rollback)', async () => {
    const { svc, budget, tx } = make();
    budget.commitForMr.mockRejectedValueOnce(new Error('Төсөв хүрэлцэхгүй'));
    await expect(svc.onSubmitted(tx as never, T, { id: 'mr', department: 'IT', totalAmount: 5 })).rejects.toThrow('Төсөв хүрэлцэхгүй');
  });
});
