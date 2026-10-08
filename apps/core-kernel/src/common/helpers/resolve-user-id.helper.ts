import { NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

/**
 * RULE-13: authId (Supabase UUID) → core_users.id (PostgreSQL UUID) хөрвүүлэгч
 *
 * Business table FK-д ЗААВАЛ core_users.id ашиглана.
 * authId-г шууд FK болгон ашиглах ХОРИГЛОНО.
 *
 * @param prisma  - PrismaClient эсвэл tx (transaction client)
 * @param authId  - Supabase auth.users.id
 * @param tenantId - tenant UUID
 * @returns core_users.id
 * @throws NotFoundException хэрэв хэрэглэгч олдохгүй бол
 */
export async function resolveUserId(
  prisma: Pick<PrismaClient, 'coreUser'>,
  authId: string,
  tenantId: string,
): Promise<string> {
  const user = await prisma.coreUser.findFirst({
    where: { authId, tenantId },
    select: { id: true },
  });
  if (!user) {
    throw new NotFoundException(
      `User not found: authId=${authId}, tenantId=${tenantId}`,
    );
  }
  return user.id;
}
