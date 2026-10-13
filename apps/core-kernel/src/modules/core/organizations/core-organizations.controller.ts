import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { reqUser } from '../../camp/common/camp-request';
import { CoreOrganizationsService } from './core-organizations.service';
import { CreateOrganizationDto, QueryOrganizationsDto, UpdateOrganizationDto } from './core-organizations.dto';

const uuid = () => new ParseUUIDPipe();

/** Байгууллагууд (tenant түвшин) — /api/v1/core/organizations (v0.2.2 H1; өмнө нь /camp/organizations) */
@Controller('core/organizations')
export class CoreOrganizationsController {
  constructor(private readonly orgs: CoreOrganizationsService) {}

  @Get()
  list(@Req() req: FastifyRequest, @Query() q: QueryOrganizationsDto) {
    const u = reqUser(req);
    return this.orgs.list(u.tenantId, u.id, q);
  }

  @Post()
  @HttpCode(201)
  create(@Req() req: FastifyRequest, @Body() dto: CreateOrganizationDto) {
    const u = reqUser(req);
    return this.orgs.create(u.tenantId, u.id, dto);
  }

  @Patch(':id')
  update(@Req() req: FastifyRequest, @Param('id', uuid()) id: string, @Body() dto: UpdateOrganizationDto) {
    const u = reqUser(req);
    return this.orgs.update(u.tenantId, u.id, id, dto);
  }
}
