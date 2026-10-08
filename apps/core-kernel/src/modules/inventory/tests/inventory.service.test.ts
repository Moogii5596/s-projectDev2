import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { InventoryService } from '../inventory.service';
import { encodeCursor } from '../../../common/utils/cursor';

// Phase 4.2 — логик (SQL нь PostgreSQL 16 дээр тусад нь 10 сценариар шалгагдсан)
const T = 't-1';
const row = (sku: string, q = 5, min = 0) => ({
  id: `00000000-0000-0000-0000-0000000000${sku.slice(-2)}`, sku, name: sku, unit: 'EA',
  quantity: new Prisma.Decimal(q), min_threshold: new Prisma.Decimal(min), created_at: new Date('2026-10-01T00:00:00Z'),
});

describe('InventoryService', () => {
  let tx: any;
  let cache: { buildKey: any; get: any; set: any; invalidateTenant: any };
  let svc: InventoryService;

  beforeEach(() => {
    tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRaw: vi.fn().mockResolvedValue([]),
      coreUser: { findFirst: vi.fn().mockResolvedValue({ id: 'cu', role: UserRole.ADMIN }) },
      inventoryItem: { create: vi.fn().mockResolvedValue({ id: 'i1' }), findFirst: vi.fn().mockResolvedValue(null) },
    };
    cache = {
      buildKey: vi.fn((...p: string[]) => p.join(':')),
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      invalidateTenant: vi.fn().mockResolvedValue(undefined),
    };
    svc = new InventoryService({ $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)) } as never, cache as never);
  });

  it('list: cache hit → DB рүү хандахгүй', async () => {
    cache.get.mockResolvedValueOnce({ data: [], nextCursor: null, hasMore: false });
    await svc.list(T, {});
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('list: limit+1 мөр → hasMore, nextCursor = сүүлийн мөрийн cursor, 60с cache', async () => {
    tx.$queryRaw.mockResolvedValueOnce([row('S-01'), row('S-02'), row('S-03')]);
    const r = await svc.list(T, { limit: 2 });
    expect(r.data.map((d) => d.sku)).toEqual(['S-01', 'S-02']);
    expect(r.hasMore).toBe(true);
    expect(r.nextCursor).toBe(encodeCursor(row('S-02').id, row('S-02').created_at));
    expect(cache.set).toHaveBeenCalledWith(expect.any(String), r, 60);
  });

  it('list: SQL нь index range-тэй cursor нөхцөл + tenant + set_config (RULE-04)', async () => {
    await svc.list(T, { cursor: encodeCursor(row('S-01').id, new Date()), lowStock: true });
    const q = (tx.$queryRaw.mock.calls[0][0] as string[]).join('?');
    expect(q).toMatch(/created_at <= \?::timestamptz\s+AND \(created_at < \?::timestamptz OR id < \?::uuid\)/);
    expect(q).toContain('quantity <= min_threshold');
    expect((tx.$executeRaw.mock.calls[0][0] as string[]).join('?')).toContain("set_config('app.tenant_id'");
  });

  it('list: lowStock тэмдэг = quantity <= minThreshold', async () => {
    tx.$queryRaw.mockResolvedValueOnce([row('S-01', 2, 5), row('S-02', 5, 5), row('S-03', 6, 5)]);
    expect((await svc.list(T, {})).data.map((d) => d.lowStock)).toEqual([true, true, false]);
  });

  it('list: буруу cursor → 400', async () => {
    await expect(svc.list(T, { cursor: 'garbage' })).rejects.toThrow(BadRequestException);
  });

  it('create: REQUESTER → 403; ADMIN → үүсгээд cache invalidate', async () => {
    tx.coreUser.findFirst.mockResolvedValueOnce({ id: 'cu', role: UserRole.REQUESTER });
    await expect(svc.create(T, 'a', { sku: 'S', name: 'N' })).rejects.toThrow(ForbiddenException);
    await svc.create(T, 'a', { sku: 'S', name: 'N', quantity: 3 });
    expect(tx.inventoryItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tenantId: T, sku: 'S', unit: 'EA' }) });
    expect(cache.invalidateTenant).toHaveBeenCalledWith(T);
  });

  it('create: давхар SKU (P2002) → 409', async () => {
    tx.inventoryItem.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5.22.0' }));
    await expect(svc.create(T, 'a', { sku: 'S', name: 'N' })).rejects.toThrow(ConflictException);
  });

  it('adjust: атомик UPDATE (quantity + delta >= 0) → view + cache invalidate', async () => {
    tx.$queryRaw.mockResolvedValueOnce([row('S-01', 8)]);
    const r = await svc.adjust(T, 'a', 'id', { delta: 3 });
    expect(r.quantity).toBe('8');
    const q = (tx.$queryRaw.mock.calls[0][0] as string[]).join('?');
    expect(q).toMatch(/SET quantity = quantity \+ \?::numeric[\s\S]*quantity \+ \?::numeric >= 0/);
    expect(cache.invalidateTenant).toHaveBeenCalledWith(T);
  });

  it('adjust: 0 мөр + бараа байгаа → 400 (одоогийн үлдэгдэл), байхгүй → 404, cache хөндөхгүй', async () => {
    tx.inventoryItem.findFirst.mockResolvedValueOnce({ quantity: new Prisma.Decimal(2) });
    await expect(svc.adjust(T, 'a', 'id', { delta: -3 })).rejects.toThrow(/одоо 2/);
    await expect(svc.adjust(T, 'a', 'id', { delta: -3 })).rejects.toThrow(NotFoundException);
    expect(cache.invalidateTenant).not.toHaveBeenCalled();
  });
});
