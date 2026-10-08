import { ConflictException, NotFoundException } from '@nestjs/common';
import { PessimisticLockService } from './pessimistic-lock.service';

// Unit тест pattern: new Class(mockDep as never) — RULE-10
// Test.createTestingModule ХОРИГЛОНО

const TENANT_ID  = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const INSTANCE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_A     = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const USER_B     = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

function makePrisma(instanceRows: Array<{ id: string; locked_by: string | null; status: string }>) {
  return {
    $transaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn(tx)),
  } as any;

  // eslint-disable-next-line no-var, @typescript-eslint/no-unused-vars
  var tx: any; // hoisted — доор тодорхойлогдоно
}

describe('PessimisticLockService', () => {
  let service: PessimisticLockService;
  let mockTx: any;
  let mockPrisma: any;

  beforeEach(() => {
    mockTx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRaw:   vi.fn(),
    };
    mockPrisma = {
      $transaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn(mockTx)),
    };
    service = new PessimisticLockService(mockPrisma as never);
  });

  describe('acquireLock()', () => {
    it('lock амжилттай авна — locked_by null байвал', async () => {
      mockTx.$queryRaw.mockResolvedValue([
        { id: INSTANCE_ID, locked_by: null, status: 'PENDING' },
      ]);

      await expect(
        service.acquireLock(INSTANCE_ID, USER_A, TENANT_ID),
      ).resolves.not.toThrow();

      // set_config дуудагдсан эсэх — RULE-03
      expect(mockTx.$executeRaw).toHaveBeenCalledTimes(2); // set_config + UPDATE
    });

    it('NotFoundException — instance олдохгүй бол', async () => {
      mockTx.$queryRaw.mockResolvedValue([]);

      await expect(
        service.acquireLock(INSTANCE_ID, USER_A, TENANT_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('ConflictException — өөр хэрэглэгч lock барьсан бол', async () => {
      mockTx.$queryRaw.mockResolvedValue([
        { id: INSTANCE_ID, locked_by: USER_B, status: 'PENDING' },
      ]);

      // USER_A нь USER_B-ийн lock-г авах гэж байна → ConflictException
      await expect(
        service.acquireLock(INSTANCE_ID, USER_A, TENANT_ID),
      ).rejects.toThrow(ConflictException);
    });

    it('өөрийн lock-г дахин авч болно (re-entrant)', async () => {
      mockTx.$queryRaw.mockResolvedValue([
        { id: INSTANCE_ID, locked_by: USER_A, status: 'PENDING' },
      ]);

      await expect(
        service.acquireLock(INSTANCE_ID, USER_A, TENANT_ID),
      ).resolves.not.toThrow();
    });
  });

  describe('releaseLock()', () => {
    it('lock суллана — UPDATE дуудагдана', async () => {
      await service.releaseLock(INSTANCE_ID, TENANT_ID);

      expect(mockTx.$executeRaw).toHaveBeenCalledTimes(2); // set_config + UPDATE
    });
  });
});
