import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { reqUser } from '../../camp/common/camp-request';
import { CreateSiteDto, QuerySitesDto, UpdateSiteDto } from './core-sites.dto';
import { CoreSitesService } from './core-sites.service';

@Controller('core/sites')
export class CoreSitesController {
  constructor(private readonly sites: CoreSitesService) {}

  @Get()
  list(@Req() req: FastifyRequest, @Query() query: QuerySitesDto) {
    const user = reqUser(req);
    return this.sites.list(user.tenantId, user.id, query);
  }

  @Post()
  create(@Req() req: FastifyRequest, @Body() dto: CreateSiteDto) {
    const user = reqUser(req);
    return this.sites.create(user.tenantId, user.id, dto);
  }

  @Patch(':id')
  update(@Req() req: FastifyRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateSiteDto) {
    const user = reqUser(req);
    return this.sites.update(user.tenantId, user.id, id, dto);
  }

  @Delete(':id')
  archive(@Req() req: FastifyRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    const user = reqUser(req);
    return this.sites.archive(user.tenantId, user.id, id);
  }
}
