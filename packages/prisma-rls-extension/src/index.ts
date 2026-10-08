import { Prisma } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContext {
  tenantId: string;
  userId: string;
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

/**
 * Prisma RLS Extension
 * Query бүрт SET LOCAL ашиглан tenant context тохируулна
 * Connection pool-safe: LOCAL keyword нь transaction/statement дотор л хүчинтэй
 */
export function createRlsExtension() {
  return Prisma.defineExtension((client) =>
    client.$extends({
      name: 'rls-tenant-extension',
      query: {
        $allModels: {
          async $allOperations({ args, query }) {
            const ctx = tenantStorage.getStore();

            if (!ctx) {
              return query(args);
            }

            // SET LOCAL — connection pool-д аюулгүй
            const [, , result] = await client.$transaction([
              client.$executeRaw`SELECT set_config('app.tenant_id', ${ctx.tenantId}, true)`,
              client.$executeRaw`SELECT set_config('app.user_id', ${ctx.userId}, true)`,
              query(args) as never,
            ]);

            return result;
          },
        },
      },
    }),
  );
}
