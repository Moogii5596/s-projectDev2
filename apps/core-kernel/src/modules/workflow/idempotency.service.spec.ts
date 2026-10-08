import { IdempotencyService } from './idempotency.service';

// Unit тест pattern: new Class(mockDep as never) — RULE-10
// vitest 1.6.1: async/await — done() DEPRECATED — RULE (vitest lesson)

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const KEY      = 'idempotency-key-001';

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let mockTx: any;
  let mockPrisma: any;

  beforeEach(() => {
    mockTx = {
      $executeRaw:      vi.fn().mockResolvedValue(1),
      idempotencyKey: {
        findUnique: vi.fn(),
        create:     vi.fn().mockResolvedValue({}),
      },
    };
    mockPrisma = {
      $transaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn(mockTx)),
    };
    service = new IdempotencyService(mockPrisma as never);
  });

  it('шинэ key → execute дуудагдаж, хадгална', async () => {
    mockTx.idempotencyKey.findUnique.mockResolvedValue(null);
    const execute = vi.fn().mockResolvedValue({ code: 201, body: { id: 'abc' } });

    const result = await service.checkAndStore(KEY, TENANT_A, execute);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(mockTx.idempotencyKey.create).toHaveBeenCalledTimes(1);
    expect(result.cached).toBe(false);
    expect(result.code).toBe(201);
  });

  it('ижил key → cached response буцаана (execute дуудагдахгүй)', async () => {
    mockTx.idempotencyKey.findUnique.mockResolvedValue({
      key:          KEY,
      tenantId:     TENANT_A,
      responseCode: 201,
      responseBody: { id: 'cached-abc' },
      expiresAt:    new Date(Date.now() + 1000),
    });
    const execute = vi.fn();

    const result = await service.checkAndStore(KEY, TENANT_A, execute);

    expect(execute).not.toHaveBeenCalled();
    expect(result.cached).toBe(true);
    expect(result.body).toEqual({ id: 'cached-abc' });
  });

  it('өөр tenant-д ижил key → тусдаа хариу (tenant isolation)', async () => {
    // TENANT_B-д ижил KEY-г хадгалаагүй
    mockTx.idempotencyKey.findUnique.mockResolvedValue(null);
    const execute = vi.fn().mockResolvedValue({ code: 201, body: { id: 'tenant-b-result' } });

    const result = await service.checkAndStore(KEY, TENANT_B, execute);

    // TENANT_B-д шинэ хүсэлт болж хадгалагдана
    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.cached).toBe(false);

    // set_config TENANT_B-ийн ID-тэй дуудагдсан эсэх — RULE-03
    // Tagged template literal: $executeRaw`...${tenantId}...` → (strings[], tenantId) — 2 arg
    expect(mockTx.$executeRaw).toHaveBeenCalledWith(
      expect.anything(),  // string[] parts
      TENANT_B,
    );
  });

  it('RULE-03: set_config дуудагдана (SET LOCAL биш)', async () => {
    mockTx.idempotencyKey.findUnique.mockResolvedValue(null);
    const execute = vi.fn().mockResolvedValue({ code: 200, body: {} });

    await service.checkAndStore(KEY, TENANT_A, execute);

    // $executeRaw нэг удаа дуудагдана (set_config)
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
