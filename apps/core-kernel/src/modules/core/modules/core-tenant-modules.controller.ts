import { Body, Controller, Get, Param, Patch, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { reqUser } from '../../camp/common/camp-request';
import { CoreTenantModulesService } from './core-tenant-modules.service';
import { UpdateTenantModuleDto } from './core-tenant-modules.dto';

@Controller()
export class CoreTenantModulesController {
  constructor(private readonly modules: CoreTenantModulesService) {}

  @Get('me/modules')
  myModules(@Req() req: FastifyRequest) {
    const user = reqUser(req);
    return this.modules.getMyModules(user.tenantId, user.id);
  }

  @Get('core/modules')
  list(@Req() req: FastifyRequest) {
    const user = reqUser(req);
    return this.modules.list(user.tenantId, user.id);
  }

  @Patch('core/modules/:moduleId')
  update(@Req() req: FastifyRequest, @Param('moduleId') moduleId: string, @Body() dto: UpdateTenantModuleDto) {
    const user = reqUser(req);
    return this.modules.update(user.tenantId, user.id, moduleId, dto.active);
  }
}
