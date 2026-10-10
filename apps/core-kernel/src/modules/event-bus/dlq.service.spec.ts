import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DlqService } from './dlq.service';

// RULE-10: new DlqService(mockDep as never) шууд instantiate

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const EVENT_ID  = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const ORIGINAL_EVENT = {
  id:          EVENT_ID,
  tenant_id:   TENANT_ID,
  event_type:  'mn.s-project.requisition.submitted',
  payload:     { mrId: 'cccccccc-cccc-cccc-cccc-cccccccccccc' },
  retry_count: 3,
};

describe('DlqService', () => {
  let service: DlqService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      dlqEvent: {
        create: vi.fn().mockResolvedValue({ id: EVENT_ID }),
      },
    };
    service = new DlqService(mockPrisma as never);
  });

  it('tx өгвөл тэр transaction-д бичнэ (Phase 5.0)', async () => {
    const tx = { dlqEvent: { create: vi.fn().mockResolvedValue({}) } };
    await service.createDlqRecord(ORIGINAL_EVENT, 'x', tx as never);
    expect(tx.dlqEvent.create).toHaveBeenCalledOnce();
    expect(mockPrisma.dlqEvent.create).not.toHaveBeenCalled();
  });

  it('createDlqRecord() → dlqEvent.create дуудагдана', async () => {
    await service.createDlqRecord(ORIGINAL_EVENT, 'Redis connection failed');

    expect(mockPrisma.dlqEvent.create).toHaveBeenCalledOnce();
    expect(mockPrisma.dlqEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId:     TENANT_ID,
        errorMessage: 'Redis connection failed',
        status:       'PENDING',
      }),
    });
  });

  it('originalEvent бүтнээрээ хадгалагдана', async () => {
    await service.createDlqRecord(ORIGINAL_EVENT, 'timeout');

    const callArg = mockPrisma.dlqEvent.create.mock.calls[0][0];
    expect(callArg.data.originalEvent).toEqual(ORIGINAL_EVENT);
  });
});
