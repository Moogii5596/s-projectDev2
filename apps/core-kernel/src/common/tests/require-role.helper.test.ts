import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { requireRole } from '../helpers/require-role.helper';

describe('requireRole()', () => {
  const prisma = (user: unknown) => ({ coreUser: { findFirst: vi.fn().mockResolvedValue(user) } });

  it('зөв role → core_users.id (RULE-13: authId биш)', async () => {
    const p = prisma({ id: 'cu-1', role: UserRole.OWNER });
    await expect(requireRole(p as never, 't', 'auth-1', [UserRole.OWNER, UserRole.ADMIN])).resolves.toBe('cu-1');
    expect(p.coreUser.findFirst).toHaveBeenCalledWith({ where: { authId: 'auth-1', tenantId: 't', isActive: true }, select: { id: true, role: true } });
  });

  it('role таарахгүй / хэрэглэгч алга → 403', async () => {
    await expect(requireRole(prisma({ id: 'x', role: UserRole.REQUESTER }) as never, 't', 'a', [UserRole.ADMIN])).rejects.toThrow(ForbiddenException);
    await expect(requireRole(prisma(null) as never, 't', 'a', [UserRole.ADMIN])).rejects.toThrow(ForbiddenException);
  });
});
