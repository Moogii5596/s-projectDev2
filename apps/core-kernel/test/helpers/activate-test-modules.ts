import type { PrismaClient } from '@prisma/client';

export async function activateTestModules(prisma: PrismaClient, tenantIds: string[], moduleIds: string[]): Promise<void> {
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
