import { EscalationScheduler } from './escalation.scheduler';

describe('EscalationScheduler', () => {
  let scheduler: EscalationScheduler;
  let tx: any;
  let prisma: any;
  let events: any;

  beforeEach(() => {
    tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      workflowSlaLog: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({}),
      },
      workflowInstance: { update: vi.fn().mockResolvedValue({}) },
      coreUser: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    prisma = {
      workflowSlaLog: { findMany: vi.fn() },
      $transaction: vi.fn(async (callback: (client: any) => Promise<unknown>) => callback(tx)),
    };
    events = { emit: vi.fn() };
    scheduler = new EscalationScheduler(prisma as never, events as never);
  });

  it('escalates overdue SLA, increments the instance, and emits an event', async () => {
    prisma.workflowSlaLog.findMany.mockResolvedValue([{
      id: 'sla-id', tenantId: 'tenant-id', instanceId: 'instance-id',
      stepOrder: 2, assignedToId: 'approver-id',
      instance: { resolvedSteps: [], definition: { stepsConfig: [], slaHours: 48 } },
    }]);

    await expect(scheduler.checkOverdueSla()).resolves.toBe(1);
    expect(tx.workflowSlaLog.updateMany).toHaveBeenCalledWith({
      where: { id: 'sla-id', status: 'PENDING' },
      data: expect.objectContaining({ status: 'ESCALATED' }),
    });
    expect(tx.workflowInstance.update).toHaveBeenCalledWith({
      where: { id: 'instance-id' },
      data: { escalationCount: { increment: 1 } },
    });
    expect(events.emit).toHaveBeenCalledWith('workflow.step.escalated', expect.objectContaining({
      tenantId: 'tenant-id', instanceId: 'instance-id', stepOrder: 2,
    }));
  });

  it('continues when one escalation fails', async () => {
    prisma.workflowSlaLog.findMany.mockResolvedValue([
      { id: 'bad', tenantId: 'tenant-id', instanceId: 'one', stepOrder: 1, assignedToId: 'a', instance: { resolvedSteps: [], definition: { stepsConfig: [], slaHours: 48 } } },
      { id: 'good', tenantId: 'tenant-id', instanceId: 'two', stepOrder: 2, assignedToId: 'b', instance: { resolvedSteps: [], definition: { stepsConfig: [], slaHours: 48 } } },
    ]);
    tx.workflowSlaLog.updateMany
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({ count: 1 });

    await expect(scheduler.checkOverdueSla()).resolves.toBe(1);
    expect(events.emit).toHaveBeenCalledTimes(1);
  });

  it('creates the next step SLA and assigns the next role', async () => {
    prisma.workflowSlaLog.findMany.mockResolvedValue([{
      id: 'sla-id', tenantId: 'tenant-id', instanceId: 'instance-id',
      stepOrder: 1, assignedToId: 'manager-id',
      instance: {
        resolvedSteps: [
          { order: 1, role: 'DEPT_MANAGER' },
          { order: 2, role: 'FINANCE_MANAGER' },
        ],
        definition: { stepsConfig: [], slaHours: 48 },
      },
    }]);
    tx.coreUser.findFirst.mockResolvedValue({ id: 'finance-id' });

    await expect(scheduler.checkOverdueSla()).resolves.toBe(1);
    expect(tx.workflowSlaLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ stepOrder: 2, assignedToId: 'finance-id', status: 'PENDING' }),
    });
    expect(events.emit).toHaveBeenCalledWith('workflow.step.escalated', expect.objectContaining({
      nextStepOrder: 2, nextRole: 'FINANCE_MANAGER', nextAssigneeId: 'finance-id',
    }));
  });
});