import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OutboxPollerService } from './outbox-poller.service';

// RULE-10: new OutboxPollerService(mockDep as never) шууд instantiate

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const EVENT_ID  = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const makePendingEvent = (retryCount = 0) => ({
  id:                  EVENT_ID,
  tenant_id:           TENANT_ID,
  event_type:          'mn.s-project.requisition.submitted',
  cloud_event_type:    'mn.s-project.requisition.submitted',
  cloud_event_source:  '/s-project/core-kernel',
  payload:             { mrId: 'cccc' },
  retry_count:         retryCount,
});

describe('OutboxPollerService', () => {
  let service: OutboxPollerService;
  let mockPrisma: any;
  let mockPublisher: any;
  let mockDlqService: any;
  let mockTx: any;

  beforeEach(() => {
    mockTx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
    };

    mockPrisma = {
      $queryRaw:   vi.fn(),
      $transaction: vi.fn().mockImplementation((fn: (tx: any) => Promise<void>) => fn(mockTx)),
    };

    mockPublisher = {
      publish: vi.fn().mockResolvedValue(undefined),
    };

    mockDlqService = {
      createDlqRecord: vi.fn().mockResolvedValue(undefined),
    };

    service = new OutboxPollerService(
      mockPrisma    as never,
      mockPublisher as never,
      mockDlqService as never,
    );
  });

  it('pollAndPublish() → Redis publish хийгдэнэ', async () => {
    const event = makePendingEvent();
    mockPrisma.$queryRaw.mockResolvedValue([event]);

    await service.pollAndPublish();

    expect(mockPublisher.publish).toHaveBeenCalledOnce();
    // PUBLISHED болгосон эсэх
    expect(mockTx.$executeRaw).toHaveBeenCalled();
  });

  it('pending event байхгүй → publish дуудагдахгүй', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);

    await service.pollAndPublish();

    expect(mockPublisher.publish).not.toHaveBeenCalled();
  });

  it('publish алдаатай → retry_count++, exponential backoff хийгдэнэ', async () => {
    const event = makePendingEvent(0);
    mockPrisma.$queryRaw.mockResolvedValue([event]);
    mockPublisher.publish.mockRejectedValue(new Error('Redis down'));

    await service.pollAndPublish();

    // DLQ руу явсангүй (retry_count=0 → newCount=1 < 3)
    expect(mockDlqService.createDlqRecord).not.toHaveBeenCalled();
    // backoff update хийгдсэн
    expect(mockTx.$executeRaw).toHaveBeenCalled();
  });

  it('retry_count=2 (newCount=3) → status=DLQ + dlqService.createDlqRecord дуудагдана', async () => {
    const event = makePendingEvent(2); // retry_count=2 → newCount=3 → DLQ
    mockPrisma.$queryRaw.mockResolvedValue([event]);
    mockPublisher.publish.mockRejectedValue(new Error('max retries'));

    await service.pollAndPublish();

    expect(mockDlqService.createDlqRecord).toHaveBeenCalledOnce();
    expect(mockDlqService.createDlqRecord).toHaveBeenCalledWith(
      event,
      'max retries',
    );
  });
});
