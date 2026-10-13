import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { reqUser } from '../common/camp-request';
import { CampsService } from './camps.service';
import { CampFacilitiesService } from './camp-facilities.service';
import { BulkRoomsDto, CreateBuildingDto, CreateCampDto, CreateRoomDto, QueryRoomsDto, UpdateBuildingDto, UpdateCampDto, UpdateRoomDto } from './camp-master.dto';
import { QueryActiveOnlyDto } from '../common/common.dto';

const uuid = () => new ParseUUIDPipe();

/** Шат 2.4 — /api/v1/camp/camps */
@Controller('camp/camps')
export class CampsController {
  constructor(private readonly camps: CampsService) {}

  @Get()
  list(@Req() req: FastifyRequest, @Query() q: QueryActiveOnlyDto) {
    const u = reqUser(req);
    return this.camps.list(u.tenantId, u.id, q);
  }

  @Post()
  @HttpCode(201)
  create(@Req() req: FastifyRequest, @Body() dto: CreateCampDto) {
    const u = reqUser(req);
    return this.camps.create(u.tenantId, u.id, dto);
  }

  @Get(':campId')
  get(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string) {
    const u = reqUser(req);
    return this.camps.get(u.tenantId, u.id, campId);
  }

  @Patch(':campId')
  update(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Body() dto: UpdateCampDto) {
    const u = reqUser(req);
    return this.camps.update(u.tenantId, u.id, campId, dto);
  }
}


/** Шат 2.4 — /api/v1/camp/camps/:campId/{buildings,rooms,departments,crews,employees} */
@Controller('camp/camps/:campId')
export class CampMasterController {
  constructor(private readonly facilities: CampFacilitiesService) {}

  // ── Байр ──
  @Get('buildings')
  listBuildings(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Query() q: QueryActiveOnlyDto) {
    const u = reqUser(req);
    return this.facilities.listBuildings(u.tenantId, u.id, campId, q);
  }

  @Post('buildings')
  @HttpCode(201)
  createBuilding(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Body() dto: CreateBuildingDto) {
    const u = reqUser(req);
    return this.facilities.createBuilding(u.tenantId, u.id, campId, dto);
  }

  /** FB-07 (v0.2.0) — олон өрөө нэг дор */
  @Post('buildings/:id/rooms/bulk')
  @HttpCode(201)
  bulkRooms(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string, @Body() dto: BulkRoomsDto) {
    const u = reqUser(req);
    return this.facilities.bulkRooms(u.tenantId, u.id, campId, id, dto);
  }

  @Patch('buildings/:id')
  updateBuilding(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string, @Body() dto: UpdateBuildingDto) {
    const u = reqUser(req);
    return this.facilities.updateBuilding(u.tenantId, u.id, campId, id, dto);
  }

  // ── Өрөө ──
  @Get('rooms')
  listRooms(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Query() q: QueryRoomsDto) {
    const u = reqUser(req);
    return this.facilities.listRooms(u.tenantId, u.id, campId, q);
  }

  @Post('rooms')
  @HttpCode(201)
  createRoom(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Body() dto: CreateRoomDto) {
    const u = reqUser(req);
    return this.facilities.createRoom(u.tenantId, u.id, campId, dto);
  }

  @Patch('rooms/:id')
  updateRoom(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string, @Body() dto: UpdateRoomDto) {
    const u = reqUser(req);
    return this.facilities.updateRoom(u.tenantId, u.id, campId, id, dto);
  }
}
