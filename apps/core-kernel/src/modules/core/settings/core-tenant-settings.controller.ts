import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { reqUser } from '../../camp/common/camp-request';
import { CoreTenantSettingsService } from './core-tenant-settings.service';
import { UpdateTenantProfileDto, UpdateTenantSecurityPolicyDto } from './core-tenant-settings.dto';

@Controller('core/settings')
export class CoreTenantSettingsController {
  constructor(private readonly settings: CoreTenantSettingsService) {}

  @Get()
  get(@Req() req: FastifyRequest) {
    const user = reqUser(req);
    return this.settings.get(user.tenantId, user.id);
  }

  @Patch('profile')
  updateProfile(@Req() req: FastifyRequest, @Body() dto: UpdateTenantProfileDto) {
    const user = reqUser(req);
    return this.settings.updateProfile(user.tenantId, user.id, dto);
  }

  @Patch('security')
  updateSecurity(@Req() req: FastifyRequest, @Body() dto: UpdateTenantSecurityPolicyDto) {
    const user = reqUser(req);
    return this.settings.updateSecurity(user.tenantId, user.id, dto);
  }
}
