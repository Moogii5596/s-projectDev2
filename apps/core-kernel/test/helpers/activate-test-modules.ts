import type { PrismaClient } from '@prisma/client';

export async function activateTestModules(prisma: PrismaClient, tenantIds: string[], moduleIds: string[]): Promise<void> {
  process.env.DEBUG_MENU_ENABLED = 'true';
  await Promise.all(tenantIds.flatMap((tenantId) => moduleIds.map((moduleId) =>
    prisma.installedModule.upsert({
      where: { tenantId_moduleId: { tenantId, moduleId } },
      create: {
        tenantId,
        moduleId,
        version: 'test',
        status: 'ACTIVE',
        manifestSnapshot: { moduleId },
      },
      update: { status: 'ACTIVE' },
    }),
  )));
}

export async function grantTestDebugAccess(prisma: PrismaClient, tenantIds: string[]): Promise<void> {
  const users = await prisma.coreUser.findMany({
    where: { tenantId: { in: tenantIds } },
    select: { tenantId: true, id: true },
  });

  for (const user of users) {
    const existing = await prisma.coreUserPermission.findFirst({
      where: { tenantId: user.tenantId, userId: user.id, permissionCode: 'core.debug.view', campId: null },
      select: { id: true },
    });
    if (!existing) {
      await prisma.coreUserPermission.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          permissionCode: 'core.debug.view',
          source: 'DIRECT',
          createdBy: user.id,
        },
      });
    }
  }
}
