/**
 * Phase 3.6.1 + 3.6.3 — MR жагсаалтын cursor: буруу cursor → 400, index-д ээлтэй WHERE
 */
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MaterialRequisitionService } from '../services/material-requisition.service';
import { encodeCursor } from '../../../common/utils/cursor';
import { QueryMrDto } from '../dto/query-mr.dto';

const T = '00000000-0000-0000-0000-000000000003';
const C_ID = '0192a3b4-0000-7000-8000-0000000000c5';
const C_AT = new Date('2026-10-10T00:00:05.000Z');
const mk = (i: number) => ({ id: `0192a3b4-0000-7000-8000-00000000000${i}`, createdAt: new Date(Date.UTC(2026, 9, 10, 0, 0, 5 - i)) });

describe('MaterialRequisitionService.findAll (cursor)', () => {
  let prisma: {
    mrHeader: { findMany: ReturnType<typeof vi.fn> };
    tx: { $executeRaw: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let cache: { buildKey: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };
  let svc: MaterialRequisitionService;
  const q = (v: Partial<QueryMrDto>) => Object.assign(new QueryMrDto(), v);

  beforeEach(() => {
    const mrHeader = { findMany: vi.fn().mockResolvedValue([]) };
    const tx = { mrHeader, $executeRaw: vi.fn().mockResolvedValue(1) };
    // Phase 4.8.3: бүх query tenant transaction (set_config) дотор
    prisma = { mrHeader, tx, $transaction: vi.fn((fn: (t: typeof tx) => unknown) => Promise.resolve(fn(tx))) as ReturnType<typeof vi.fn> };
    cache = { buildKey: vi.fn().mockReturnValue('k'), get: vi.fn().mockResolvedValue(null), set: vi.fn() };
    svc = new MaterialRequisitionService(prisma as never, {} as never, cache as never, {} as never);
  });

  it('буруу cursor (garbage / UUID биш id) → 400, cache болон DB-д хүрэхгүй', async () => {
    await expect(svc.findAll(T, q({ cursor: 'garbage' }))).rejects.toThrow(BadRequestException);
    await expect(svc.findAll(T, q({ cursor: encodeCursor('not-a-uuid', C_AT) }))).rejects.toThrow(BadRequestException);
    expect(cache.get).not.toHaveBeenCalled();
    expect(prisma.mrHeader.findMany).not.toHaveBeenCalled();
  });

  it('desc: created_at <= c AND (created_at < c OR id < cid); limit+1; status шүүлт', async () => {
    prisma.mrHeader.findMany.mockResolvedValueOnce([mk(1), mk(2), mk(3)]);
    const res = await svc.findAll(T, q({ cursor: encodeCursor(C_ID, C_AT), limit: 2, status: 'APPROVED' }));
    const args = prisma.mrHeader.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      tenantId: T,
      status: 'APPROVED',
      createdAt: { lte: C_AT },
      OR: [{ createdAt: { lt: C_AT } }, { id: { lt: C_ID } }],
    });
    expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(prisma.tx.$executeRaw.mock.calls[0][1]).toBe(T); // set_config(app.tenant_id)
    expect(prisma.tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(prisma.mrHeader.findMany.mock.invocationCallOrder[0]);
    expect(args.take).toBe(3);
    expect(res).toMatchObject({ hasMore: true, nextCursor: encodeCursor(mk(2).id, mk(2).createdAt) });
    expect((res as { data: unknown[] }).data).toHaveLength(2);
  });

  it('asc: created_at >= c AND (created_at > c OR id > cid); сүүлийн хуудас → nextCursor null', async () => {
    prisma.mrHeader.findMany.mockResolvedValueOnce([mk(1)]);
    const res = await svc.findAll(T, q({ cursor: encodeCursor(C_ID, C_AT), order: 'asc' }));
    expect(prisma.mrHeader.findMany.mock.calls[0][0].where).toEqual({
      tenantId: T,
      createdAt: { gte: C_AT },
      OR: [{ createdAt: { gt: C_AT } }, { id: { gt: C_ID } }],
    });
    expect(res).toMatchObject({ hasMore: false, nextCursor: null });
  });
});
