import { ApprovalSlaService } from './approval-sla.service';

describe('ApprovalSlaService', () => {
  it('returns summary and step statistics for amount-rule definitions', async () => {
    const from = new Date('2026-09-01T00:00:00.000Z');
    const to = new Date('2026-09-30T00:00:00.000Z');
    const createdAt = new Date('2026-09-10T00:00:00.000Z');
    const completedAt = new Date('2026-09-10T12:00:00.000Z');
    const prisma = {
      workflowSlaLog: {
        findMany: vi.fn().mockResolvedValue([
          {
            stepOrder: 1, status: 'COMPLETED', createdAt, completedAt,
            dueAt: new Date('2026-09-12T00:00:00.000Z'),
            instance: { definition: { stepsConfig: {
              amount_rules: [{ steps: [{ order: 1, role: 'DEPT_MANAGER' }] }],
            } } },
          },
          {
            stepOrder: 1, status: 'ESCALATED', createdAt, completedAt: null,
            dueAt: new Date('2026-09-09T00:00:00.000Z'),
            instance: { definition: { stepsConfig: {
              amount_rules: [{ steps: [{ order: 1, role: 'DEPT_MANAGER' }] }],
            } } },
          },
        ]),
      },
    };

    // Phase 4.8.3: tenant transaction (set_config эхэлж)
    const tx = { ...prisma, $executeRaw: vi.fn().mockResolvedValue(1) };
    const client = { $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };
    const result = await new ApprovalSlaService(client as never).getReport('tenant-id', from, to);
    expect(tx.$executeRaw.mock.calls[0][1]).toBe('tenant-id');
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(prisma.workflowSlaLog.findMany.mock.invocationCallOrder[0]);

    expect(result.summary).toEqual(expect.objectContaining({
      total: 2, completed_on_time: 1, escalated: 1, avg_completion_hours: 12,
    }));
    expect(result.by_step[0]).toEqual(expect.objectContaining({
      step_order: 1, role: 'DEPT_MANAGER', escalation_rate: 0.5,
    }));
    expect(prisma.workflowSlaLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-id', createdAt: { gte: from, lte: to } },
    }));
  });
});