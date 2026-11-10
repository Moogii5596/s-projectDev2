import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OutboxPollerService, OUTBOX_BATCH, outboxBackoffSeconds } from './outbox-poller.service';

// RULE-10: new OutboxPollerService(mockDep as never) шууд instantiate
// Phase 5.0 [EVT-001]: event бүр transaction дотор (SELECT … FOR UPDATE SKIP LOCKED → publish → UPDATE)

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const EVENT_ID  = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CE_ID     = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const makePendingEvent = (retryCount = 0, extra: Record<string, unknown> = {}) => ({
  id:                  EVENT_ID,
  tenant_id:           TENANT_ID,
  event_type:          'MR_SUBMITTED',
  cloud_event_id:      CE_ID,
  cloud_event_type:    'mn.s-project.requisition.submitted',
  cloud_event_source:  '/s-project/core-kernel',
  payload:             { mrId: 'cccc' },
  retry_count:         retryCount,
  created_at:          new Date('2026-10-10T00:00:00.000Z'),
  ...extra,
});

const sql = (call: unknown[]) => (call[0] as string[]).join('?');

describe('OutboxPollerService', () => {
  let service: OutboxPollerService;
  let mockPrisma: any;
  let mockPublisher: any;
  let mockDlqService: any;
  let mockTx: any;
  let mockJobs: any;
  let queue: unknown[][];

  beforeEach(() => {
    queue = [];
    mockTx = {
      $queryRaw:   vi.fn(async () => queue.shift() ?? []),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    mockPrisma = {
      $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    };
    mockPublisher = { publish: vi.fn().mockResolvedValue(undefined) };
    mockDlqService = { createDlqRecord: vi.fn().mockResolvedValue(undefined) };
    mockJobs = {
      register: vi.fn(),
      run: vi.fn((_id: string, task: () => Promise<unknown>) => task()),
    };
    const config = { get: (key: string) => process.env[key] };
    service = new OutboxPollerService(mockPrisma as never, mockPublisher as never, mockDlqService as never, mockJobs as never, config as never);
  });

  it('сонголт нь transaction ДОТОР, FOR UPDATE SKIP LOCKED LIMIT 1 [EVT-001]', async () => {
    queue.push([makePendingEvent()]);
    expect(await service.pollAndPublish()).toBe(1);
    const q = sql(mockTx.$queryRaw.mock.calls[0]);
    expect(q).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(q).toMatch(/LIMIT 1/);
    expect(q).toMatch(/status = 'PENDING'/);
    // event бүр өөрийн transaction: 1 event + хоосон шалгалт = 2 transaction
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('publish → хадгалсан CloudEvent id/type/time-тай, дараа нь PUBLISHED [EVT-002]', async () => {
    queue.push([makePendingEvent()]);
    await service.pollAndPublish();
    const ce = mockPublisher.publish.mock.calls[0][0];
    expect(ce).toMatchObject({ id: CE_ID, type: 'mn.s-project.requisition.submitted', tenantid: TENANT_ID, time: '2026-10-10T00:00:00.000Z', data: { mrId: 'cccc' } });
    expect(sql(mockTx.$executeRaw.mock.calls[0])).toMatch(/status = 'PUBLISHED'/);
    expect(mockPublisher.publish.mock.invocationCallOrder[0]).toBeLessThan(mockTx.$executeRaw.mock.invocationCallOrder[0]);
  });

  it('хуучин мөр (cloud_event_id байхгүй) → outbox id-г CloudEvent id болгоно (тогтвортой)', async () => {
    queue.push([makePendingEvent(0, { cloud_event_id: null, cloud_event_type: null })]);
    await service.pollAndPublish();
    expect(mockPublisher.publish.mock.calls[0][0]).toMatchObject({ id: EVENT_ID, type: 'MR_SUBMITTED' });
  });

  it('pending event байхгүй → publish дуудагдахгүй, 0', async () => {
    expect(await service.pollAndPublish()).toBe(0);
    expect(mockPublisher.publish).not.toHaveBeenCalled();
  });

  it('нэг tick-д хамгийн ихдээ OUTBOX_BATCH event', async () => {
    for (let i = 0; i < OUTBOX_BATCH + 5; i += 1) queue.push([makePendingEvent(0, { id: `e-${i}` })]);
    expect(await service.pollAndPublish()).toBe(OUTBOX_BATCH);
  });

  it('publish алдаа → retry_count++, backoff 30с, DLQ биш', async () => {
    queue.push([makePendingEvent(0)]);
    mockPublisher.publish.mockRejectedValue(new Error('Redis down'));
    await service.pollAndPublish();
    expect(mockDlqService.createDlqRecord).not.toHaveBeenCalled();
    const call = mockTx.$executeRaw.mock.calls[0];
    expect(sql(call)).toMatch(/next_retry_at/);
    expect(call.slice(1)).toEqual([1, 30, 'Redis down', EVENT_ID]);
  });

  it('retry_count=2 (3 дахь оролдлого) → status=DLQ + DLQ мөр ИЖИЛ transaction-д', async () => {
    const event = makePendingEvent(2);
    queue.push([event]);
    mockPublisher.publish.mockRejectedValue(new Error('max retries'));
    await service.pollAndPublish();
    expect(sql(mockTx.$executeRaw.mock.calls[0])).toMatch(/status = 'DLQ'/);
    expect(mockDlqService.createDlqRecord).toHaveBeenCalledWith(event, 'max retries', mockTx);
  });

  it('DB алдаа → tick зогсоод scheduler-д FAILED тэмдэглэхээр дахин шиднэ', async () => {
    mockPrisma.$transaction.mockRejectedValueOnce(new Error('connection lost'));
    await expect(service.pollAndPublish()).rejects.toThrow('connection lost');
  });

  it('onTick: DB алдаа → registry-д FAILED хүргэнэ', async () => {
    mockPrisma.$transaction.mockRejectedValueOnce(new Error('connection lost'));
    await expect(service.onTick()).rejects.toThrow('connection lost');
    expect(mockJobs.run).toHaveBeenCalledWith('outbox-poller', expect.any(Function));
  });

  it('onTick: OUTBOX_POLLER_CRON=off → алгасна; тохируулаагүй → poll хийнэ', async () => {
    vi.stubEnv('OUTBOX_POLLER_CRON', 'off');
    await service.onTick();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
    await service.onTick();
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });

  it('backoff: 30с, 120с, 480с', () => {
    expect([1, 2, 3].map(outboxBackoffSeconds)).toEqual([30, 120, 480]);
  });
});
