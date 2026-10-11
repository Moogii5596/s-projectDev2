import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { reqUser } from '../common/camp-request';
import { CampsService } from './camps.service';
import { CampFacilitiesService } from './camp-facilities.service';
import { CampOrganizationsService } from './camp-organizations.service';
import { CampDepartmentsService } from './camp-departments.service';
import { CampCrewsService } from './camp-crews.service';
import { CampEmployeesService } from './camp-employees.service';
import {
  BulkRoomsDto,
  CreateBuildingDto,
  CreateCampDto,
  CreateCrewDto,
  CreateDepartmentDto,
  CreateEmployeeDto,
  CreateOrganizationDto,
  CreateRoomDto,
  QueryActiveOnlyDto,
  QueryEmployeesDto,
  QueryOrganizationsDto,
  QueryRoomsDto,
  SetShiftPatternDto,
  UpdateBuildingDto,
  UpdateCampDto,
  UpdateCrewDto,
  UpdateDepartmentDto,
  UpdateEmployeeDto,
  UpdateOrganizationDto,
  UpdateRoomDto,
} from './camp-master.dto';

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

/** Шат 2.4 — /api/v1/camp/organizations (tenant түвшин) */
@Controller('camp/organizations')
export class CampOrganizationsController {
  constructor(private readonly orgs: CampOrganizationsService) {}

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

/** Шат 2.4 — /api/v1/camp/camps/:campId/{buildings,rooms,departments,crews,employees} */
@Controller('camp/camps/:campId')
export class CampMasterController {
  constructor(
    private readonly facilities: CampFacilitiesService,
    private readonly departments: CampDepartmentsService,
    private readonly crews: CampCrewsService,
    private readonly employees: CampEmployeesService,
  ) {}

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

  // ── Хэлтэс ──
  @Get('departments')
  listDepartments(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Query() q: QueryActiveOnlyDto) {
    const u = reqUser(req);
    return this.departments.list(u.tenantId, u.id, campId, q);
  }

  @Post('departments')
  @HttpCode(201)
  createDepartment(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Body() dto: CreateDepartmentDto) {
    const u = reqUser(req);
    return this.departments.create(u.tenantId, u.id, campId, dto);
  }

  @Patch('departments/:id')
  updateDepartment(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string, @Body() dto: UpdateDepartmentDto) {
    const u = reqUser(req);
    return this.departments.update(u.tenantId, u.id, campId, id, dto);
  }

  @Put('departments/:id/shift-pattern')
  setShiftPattern(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string, @Body() dto: SetShiftPatternDto) {
    const u = reqUser(req);
    return this.departments.setShiftPattern(u.tenantId, u.id, campId, id, dto);
  }

  // ── Баг ──
  @Get('crews')
  listCrews(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Query() q: QueryActiveOnlyDto) {
    const u = reqUser(req);
    return this.crews.list(u.tenantId, u.id, campId, q);
  }

  @Post('crews')
  @HttpCode(201)
  createCrew(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Body() dto: CreateCrewDto) {
    const u = reqUser(req);
    return this.crews.create(u.tenantId, u.id, campId, dto);
  }

  @Patch('crews/:id')
  updateCrew(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string, @Body() dto: UpdateCrewDto) {
    const u = reqUser(req);
    return this.crews.update(u.tenantId, u.id, campId, id, dto);
  }

  // ── Ажилтан ──
  @Get('employees')
  listEmployees(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Query() q: QueryEmployeesDto) {
    const u = reqUser(req);
    return this.employees.list(u.tenantId, u.id, campId, q);
  }

  @Get('employees/:id')
  getEmployee(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string) {
    const u = reqUser(req);
    return this.employees.get(u.tenantId, u.id, campId, id);
  }

  @Post('employees')
  @HttpCode(201)
  createEmployee(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Body() dto: CreateEmployeeDto) {
    const u = reqUser(req);
    return this.employees.create(u.tenantId, u.id, campId, dto);
  }

  @Patch('employees/:id')
  updateEmployee(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string, @Body() dto: UpdateEmployeeDto) {
    const u = reqUser(req);
    return this.employees.update(u.tenantId, u.id, campId, id, dto);
  }
}
