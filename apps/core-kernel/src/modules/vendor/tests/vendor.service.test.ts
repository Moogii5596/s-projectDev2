import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { VendorService } from '../vendor.service';

describe('VendorService (Phase 4.3)', () => {
  let tx: any;
  let svc: VendorService;
  beforeEach(() => {
    tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      coreUser: { findFirst: vi.fn().mockResolvedValue({ id: 'cu', role: UserRole.OWNER }) },
      vendor: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 'v1' }),
        findFirst: vi.fn().mockResolvedValue({ id: 'v1' }),
        update: vi.fn().mockResolvedValue({ id: 'v1' }),
      },
    };
    svc = new VendorService({ $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)) } as never);
  });

  it('list: activeOnly шүүлт + tenant + set_config', async () => {
    await svc.list('t', { activeOnly: true });
    expect(tx.vendor.findMany).toHaveBeenCalledWith({ where: { tenantId: 't', isActive: true }, orderBy: { name: 'asc' } });
    expect(tx.$executeRaw.mock.calls[0][1]).toBe('t');
  });

  it('create: VIEWER → 403; OWNER → хоосон regNumber = null', async () => {
    tx.coreUser.findFirst.mockResolvedValueOnce({ id: 'cu', role: UserRole.VIEWER });
    await expect(svc.create('t', 'a', { name: 'V' })).rejects.toThrow(ForbiddenException);
    await svc.create('t', 'a', { name: 'V', regNumber: '' });
    expect(tx.vendor.create).toHaveBeenCalledWith({ data: { tenantId: 't', name: 'V', regNumber: null } });
  });

  it('update: өөр tenant / байхгүй → 404; зөвхөн ирсэн талбарууд', async () => {
    tx.vendor.findFirst.mockResolvedValueOnce(null);
    await expect(svc.update('t', 'a', 'x', { name: 'N' })).rejects.toThrow(NotFoundException);
    await svc.update('t', 'a', 'v1', { isActive: false });
    expect(tx.vendor.findFirst).toHaveBeenLastCalledWith({ where: { id: 'v1', tenantId: 't' }, select: { id: true } });
    expect(tx.vendor.update).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { isActive: false } });
  });
});
