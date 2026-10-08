import { ConflictException, NotFoundException } from '@nestjs/common';
import { DelegationService } from './delegation.service';

describe('DelegationService', () => {
  let service: DelegationService;
  let mockTx: any;
  let mockPrisma: any;
  let mockEventBus: any;

  beforeEach(() => {
    mockTx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      workflowDelegation: {
        findFirst: vi.fn(),
        create: vi.fn().mockResolvedValue({ id: 'delegation-id' }),
        update: vi.fn().mockResolvedValue({ id: 'delegation-id', isActive: false }),
      },
      outboxEvent: { create: vi.fn().mockResolvedValue({}) },
    };
    mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: any) => Promise<unknown>) => callback(mockTx)),
    };
    mockEventBus = { emit: vi.fn().mockResolvedValue(undefined) };
    service = new DelegationService(mockPrisma as never, mockEventBus as never);
  });

  it('creates a delegation when no active delegation exists', async () => {
    mockTx.workflowDelegation.findFirst.mockResolvedValue(null);

    await service.createDelegation('tenant-id', {
      delegatorId: 'user-id',
      delegateId: 'delegate-id',
      validUntil: new Date('2026-10-01'),
    });

    expect(mockTx.workflowDelegation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: 'tenant-id', delegatorId: 'user-id' }),
    });
  });

  it('rejects duplicate active delegation', async () => {
    mockTx.workflowDelegation.findFirst.mockResolvedValue({ id: 'existing' });

    await expect(service.createDelegation('tenant-id', {
      delegatorId: 'user-id',
      delegateId: 'delegate-id',
      validUntil: new Date('2026-10-01'),
    })).rejects.toThrow(ConflictException);
  });

  it('resolves an active delegate and otherwise keeps the original approver', async () => {
    mockTx.workflowDelegation.findFirst.mockResolvedValue({ delegateId: 'delegate-id' });
    await expect(service.resolveApprover('tenant-id', 'user-id')).resolves.toBe('delegate-id');
    expect(mockEventBus.emit).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'mn.s-project.workflow.approval-delegated',
      data: expect.objectContaining({ delegateId: 'delegate-id', delegatorId: 'user-id' }),
    }));

    mockTx.workflowDelegation.findFirst.mockResolvedValue(null);
    await expect(service.resolveApprover('tenant-id', 'user-id')).resolves.toBe('user-id');
    expect(mockEventBus.emit).toHaveBeenCalledTimes(1);
  });

  it('revokes an active delegation and rejects an unknown one', async () => {
    mockTx.workflowDelegation.findFirst.mockResolvedValue({ id: 'delegation-id' });
    await service.revokeDelegation('tenant-id', 'delegation-id');
    expect(mockTx.workflowDelegation.update).toHaveBeenCalledWith({
      where: { id: 'delegation-id' },
      data: { isActive: false },
    });

    mockTx.workflowDelegation.findFirst.mockResolvedValue(null);
    await expect(service.revokeDelegation('tenant-id', 'missing')).rejects.toThrow(NotFoundException);
  });
});