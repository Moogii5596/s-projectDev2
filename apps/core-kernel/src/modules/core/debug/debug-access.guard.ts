import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CoreTenantModulesService } from '../modules/core-tenant-modules.service';

/** D-1: Debug API — deploy флаг + core.debug.view (OWNER автоматаар). Хаалттай үед 404 (байгааг нь ч ил гаргахгүй). */
@Injectable()
export class DebugAccessGuard implements CanActivate {
  constructor(private readonly modules: CoreTenantModulesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest & { user?: { tenantId: string; id: string } }>();
    const user = req.user;
    if (!user?.tenantId || !user.id || !(await this.modules.canViewDebugModules(user.tenantId, user.id))) throw new NotFoundException();
    return true;
  }
}
