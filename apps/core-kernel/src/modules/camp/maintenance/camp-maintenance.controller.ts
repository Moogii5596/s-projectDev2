import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { reqUser } from '../common/camp-request';
import { CampMaintenanceService } from './camp-maintenance.service';
import { CancelMaintenanceDto, CreateMaintenanceDto, CreatePartDto, QueryMaintenanceDto, UpdateMaintenanceDto, UpdatePartDto } from './camp-maintenance.dto';

const uuid = () => new ParseUUIDPipe();

/** Шат 4.4 — /api/v1/camp/camps/:campId/maintenance */
@Controller('camp/camps/:campId/maintenance')
export class CampMaintenanceController {
  constructor(private readonly maintenance: CampMaintenanceService) {}

  @Get()
  list(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Query() q: QueryMaintenanceDto) {
    const u = reqUser(req);
    return this.maintenance.list(u.tenantId, u.id, campId, q);
  }

  @Post()
  @HttpCode(201)
  create(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Body() dto: CreateMaintenanceDto) {
    const u = reqUser(req);
    return this.maintenance.create(u.tenantId, u.id, campId, dto);
  }

  @Get(':id')
  get(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string) {
    const u = reqUser(req);
    return this.maintenance.get(u.tenantId, u.id, campId, id);
  }

  @Patch(':id')
  update(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string, @Body() dto: UpdateMaintenanceDto) {
    const u = reqUser(req);
    return this.maintenance.update(u.tenantId, u.id, campId, id, dto);
  }

  @Post(':id/start')
  @HttpCode(200)
  start(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string) {
    const u = reqUser(req);
    return this.maintenance.transition(u.tenantId, u.id, campId, id, 'start');
  }

  @Post(':id/complete')
  @HttpCode(200)
  complete(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string) {
    const u = reqUser(req);
    return this.maintenance.transition(u.tenantId, u.id, campId, id, 'complete');
  }

  @Post(':id/reopen')
  @HttpCode(200)
  reopen(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string) {
    const u = reqUser(req);
    return this.maintenance.transition(u.tenantId, u.id, campId, id, 'reopen');
  }

  @Post(':id/close')
  @HttpCode(200)
  close(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string) {
    const u = reqUser(req);
    return this.maintenance.transition(u.tenantId, u.id, campId, id, 'close');
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string, @Body() dto: CancelMaintenanceDto) {
    const u = reqUser(req);
    return this.maintenance.transition(u.tenantId, u.id, campId, id, 'cancel', dto);
  }

  @Post(':id/parts')
  @HttpCode(201)
  addPart(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string, @Body() dto: CreatePartDto) {
    const u = reqUser(req);
    return this.maintenance.addPart(u.tenantId, u.id, campId, id, dto);
  }

  @Patch(':id/parts/:partId')
  updatePart(
    @Req() req: FastifyRequest,
    @Param('campId', uuid()) campId: string,
    @Param('id', uuid()) id: string,
    @Param('partId', uuid()) partId: string,
    @Body() dto: UpdatePartDto,
  ) {
    const u = reqUser(req);
    return this.maintenance.updatePart(u.tenantId, u.id, campId, id, partId, dto);
  }

  @Delete(':id/parts/:partId')
  removePart(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string, @Param('partId', uuid()) partId: string) {
    const u = reqUser(req);
    return this.maintenance.removePart(u.tenantId, u.id, campId, id, partId);
  }
}
