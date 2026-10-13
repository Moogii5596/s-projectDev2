import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { reqUser } from '../../camp/common/camp-request';
import { HrEmployeesService } from './hr-employees.service';
import { BulkEmployeesDto, CreateEmployeeDto, QueryEmployeesDto, UpdateEmployeeDto } from './hr-employees.dto';

const uuid = () => new ParseUUIDPipe();

/** HR — ажилтан: /api/v1/hr/sites/:campId/employees. `:campId` = «үндсэн ажлын байр» (одоогоор кемп; v0.3-т site ерөнхий болно — ADR-006 §5) */
@Controller('hr/sites/:campId')
export class HrEmployeesController {
  constructor(private readonly employees: HrEmployeesService) {}

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
}
