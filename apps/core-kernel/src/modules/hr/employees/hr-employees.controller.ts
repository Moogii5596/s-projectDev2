import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { reqUser } from '../../camp/common/camp-request';
import { HrEmployeesService } from './hr-employees.service';
import { HrEmployeeLifecycleService } from './hr-employee-lifecycle.service';
import { BulkEmployeesDto, CreateEmployeeDto, QueryEmployeesDto, QueryPiiViewsDto, RehireEmployeeDto, TerminateEmployeeDto, UpdateEmployeeDto } from './hr-employees.dto';

const uuid = () => new ParseUUIDPipe();

/** HR — ажилтан: /api/v1/hr/sites/:campId/employees. `:campId` = «үндсэн ажлын байр» (одоогоор кемп; v0.3-т site ерөнхий болно — ADR-006 §5) */
@Controller('hr/sites/:campId')
export class HrEmployeesController {
  constructor(
    private readonly employees: HrEmployeesService,
    private readonly lifecycle: HrEmployeeLifecycleService,
  ) {}

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

  /** v0.2.1 (Д-2) — олон ажилтанд нэг дор (хоол авах / хоолны байршил / албан тушаал). ':id'-аас ӨМНӨ */
  @Post('employees/bulk')
  @HttpCode(200)
  bulkEmployees(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Body() dto: BulkEmployeesDto) {
    const u = reqUser(req);
    return this.employees.bulkUpdate(u.tenantId, u.id, campId, dto);
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

  // ── v0.2.2 Блок 5: профайл, ажлаас гаргах, дахин ажилд авах, PII лог ──

  @Get('employees/:id/profile')
  profile(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string) {
    const u = reqUser(req);
    return this.lifecycle.profile(u.tenantId, u.id, campId, id);
  }

  @Get('employees/:id/pii-views')
  piiViews(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string, @Query() q: QueryPiiViewsDto) {
    const u = reqUser(req);
    return this.lifecycle.piiViews(u.tenantId, u.id, campId, id, q);
  }

  @Post('employees/:id/terminate')
  @HttpCode(200)
  terminate(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string, @Body() dto: TerminateEmployeeDto) {
    const u = reqUser(req);
    return this.lifecycle.terminate(u.tenantId, u.id, campId, id, dto);
  }

  @Post('employees/:id/rehire')
  @HttpCode(201)
  rehire(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string, @Body() dto: RehireEmployeeDto) {
    const u = reqUser(req);
    return this.lifecycle.rehire(u.tenantId, u.id, campId, id, dto);
  }
}
