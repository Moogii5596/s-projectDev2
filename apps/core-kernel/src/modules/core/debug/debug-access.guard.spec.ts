import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { DebugAccessGuard } from './debug-access.guard';

const ctx = (user?: object) => ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as never;

describe('DebugAccessGuard (D-1)', () => {
  it('флаг/эрхгүй эсвэл нэвтрээгүй → 404', async () => {
    const no = new DebugAccessGuard({ canViewDebugModules: vi.fn().mockResolvedValue(false) } as never);
    await expect(no.canActivate(ctx({ tenantId: 't', id: 'a' }))).rejects.toBeInstanceOf(NotFoundException);
    await expect(no.canActivate(ctx())).rejects.toBeInstanceOf(NotFoundException);
  });
  it('эрхтэй → зөвшөөрнө', async () => {
    const yes = new DebugAccessGuard({ canViewDebugModules: vi.fn().mockResolvedValue(true) } as never);
    await expect(yes.canActivate(ctx({ tenantId: 't', id: 'a' }))).resolves.toBe(true);
  });
});
