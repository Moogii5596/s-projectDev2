import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { reqUser } from '../../camp/common/camp-request';
import { HrDepartmentsService } from './hr-departments.service';
import { HrCrewsService } from './hr-crews.service';
import { QueryActiveOnlyDto } from '../../camp/common/common.dto';
import { CreateCrewDto, CreateDepartmentDto, SetShiftPatternDto, UpdateCrewDto, UpdateDepartmentDto } from './hr-org.dto';

const uuid = () => new ParseUUIDPipe();

/** HR — хэлтэс (+ ээлжийн загвар), бригад: /api/v1/hr/sites/:campId/{departments,crews}. `:campId` = «үндсэн ажлын байр» (одоогоор кемп; v0.3-т site ерөнхий болно — ADR-006 §5) */
@Controller('hr/sites/:campId')
export class HrOrgController {
  constructor(
    private readonly departments: HrDepartmentsService,
    private readonly crews: HrCrewsService,
  ) {}

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
}
