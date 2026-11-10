import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CoreTenantModulesService } from '../modules/core/modules/core-tenant-modules.service';
import { TENANT_MODULES, TenantModuleId, moduleForApiPath } from '../modules/core/modules/module-registry';

type TenantRequest = FastifyRequest & {
  user?: { tenantId: string; id: string };
};

@Injectable()
export class TenantModuleGuard implements CanActivate {
  constructor(private readonly modules: CoreTenantModulesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TenantRequest>();
    const requestUrl = new URL(request.url, 'http://localhost');
    const path = requestUrl.pathname.replace(/^\/api\/v1(?=\/|$)/, '');
    const moduleId = moduleForApiPath(path) as TenantModuleId | undefined;
    const signedFeedMedia =
      request.method === 'GET' && /^\/core\/feed\/media\/[^/]+\/\d+$/.test(path);
    const tenantId = request.user?.tenantId ?? (signedFeedMedia ? requestUrl.searchParams.get('t') ?? undefined : undefined);
    if (!moduleId) return true;
    const module = TENANT_MODULES.find((item) => item.id === moduleId);
    if (!tenantId || (module?.debugOnly && !request.user?.id) || !(await this.modules.isActive(tenantId, moduleId))) {
      throw new NotFoundException();
    }
    if (module?.debugOnly && !(await this.modules.canViewDebugModules(tenantId, request.user!.id))) {
      throw new NotFoundException();
    }
    return true;
  }
}
