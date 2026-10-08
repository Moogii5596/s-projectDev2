import { ForbiddenException } from '@nestjs/common';
import type { PrismaClient, UserRole } from '@prisma/client';

/**
 * Phase 4: Хэрэглэгч (Supabase authId) тухайн tenant-д заасан role-той, идэвхтэй эсэхийг шалгана.
 * RULE-13: authId ≠ core_users.id — буцаах утга нь core_users.id.
 * @throws ForbiddenException — role таарахгүй / хэрэглэгч олдохгүй
 */
export async function requireRole(
  prisma: Pick<PrismaClient, 'coreUser'>,
  tenantId: string,
  authId: string,
  roles: UserRole[],
): Promise<string> {
  const user = await prisma.coreUser.findFirst({
    where: { authId, tenantId, isActive: true },
    select: { id: true, role: true },
  });
  if (!user || !roles.includes(user.role)) {
    throw new ForbiddenException(`Энэ үйлдэлд ${roles.join(' / ')} эрх шаардлагатай`);
  }
  return user.id;
}
