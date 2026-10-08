import { Prisma } from '@prisma/client';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../db/prisma.service';
import { DynamicIngressRouterService } from '../../gateway/dynamic-ingress-router.service';
import { RegisterRouteDto } from './dto/register-route.dto';
import { tenantStorage } from '../../db/prisma-tenant-client';

@Injectable()
export class RouteIngressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly router: DynamicIngressRouterService,
  ) {}

  async registerRoute(dto: RegisterRouteDto, tenantId: string): Promise<void> {
    const ctx = tenantStorage.getStore();
    if (!ctx) throw new Error('Tenant context missing');

    // RULE-04: нэгдсэн $transaction | RULE-03: set_config
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`
        SELECT set_config('app.tenant_id', ${ctx.tenantId}, true)
      `;
      await tx.tenantRoute.upsert({
        where: {
          tenantId_path_method: {
            tenantId,
            path:   dto.basePath,
            method: '*',
          },
        },
        create: {
          tenantId,
          path:         dto.basePath,
          method:       '*',
          targetModule: dto.moduleId,
          isActive:     true,
        },
        update: {
          isActive:     true,
          targetModule: dto.moduleId,
        },
      });
    });

    this.router.registerModule({
      module_id:    dto.moduleId,
      version:      dto.version,
      dependencies: [],
      api_routes: {
        base_path:   dto.basePath,
        target_port: dto.targetPort,
        target_host: dto.targetHost,
      },
      permissions: [],
    });
  }

  async deactivateRoute(routeId: string, tenantId: string): Promise<void> {
    const ctx = tenantStorage.getStore();
    if (!ctx) throw new Error('Tenant context missing');

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`
        SELECT set_config('app.tenant_id', ${ctx.tenantId}, true)
      `;
      const route = await tx.tenantRoute.findUnique({ where: { id: routeId } });
      if (!route || route.tenantId !== tenantId) {
        throw new NotFoundException(`Route ${routeId} not found`);
      }
      await tx.tenantRoute.update({
        where: { id: routeId },
        data:  { isActive: false },
      });
      this.router.setStatus(route.path, 'DRAINING');
    });
  }
}
