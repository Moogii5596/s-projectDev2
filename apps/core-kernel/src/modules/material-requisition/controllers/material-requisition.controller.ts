import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { TenantAuthGuard } from '../../../auth/tenant-auth.guard';
import { TenantContextInterceptor } from '../../../auth/tenant-context.interceptor';
import { MaterialRequisitionService } from '../services/material-requisition.service';
import { CreateMrDto } from '../dto/create-mr.dto';
import { UpdateMrDto } from '../dto/update-mr.dto';
import { QueryMrDto } from '../dto/query-mr.dto';
import { SubmitMrDto } from '../dto/submit-mr.dto';
import { ApproveMrDto } from '../dto/approve-mr.dto';
import { RejectMrDto } from '../dto/reject-mr.dto';

@Controller('requisitions')
@UseGuards(TenantAuthGuard)
@UseInterceptors(TenantContextInterceptor)
export class MaterialRequisitionController {
  constructor(private readonly mrService: MaterialRequisitionService) {}

  // POST /api/v1/requisitions
  @Post()
  @HttpCode(201)
  async create(@Req() req: FastifyRequest, @Body() dto: CreateMrDto) {
    const user = (req as any).user;
    return this.mrService.create(user.tenantId, user.id, dto);
  }

  // GET /api/v1/requisitions
  @Get()
  async findAll(@Req() req: FastifyRequest, @Query() query: QueryMrDto) {
    const user = (req as any).user;
    return this.mrService.findAll(user.tenantId, query);
  }

  // GET /api/v1/requisitions/:id
  @Get(':id')
  async findOne(@Req() req: FastifyRequest, @Param('id') id: string) {
    const user = (req as any).user;
    return this.mrService.findOne(user.tenantId, id);
  }

  // PUT /api/v1/requisitions/:id
  @Put(':id')
  async update(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() dto: UpdateMrDto,
  ) {
    const user = (req as any).user;
    return this.mrService.update(user.tenantId, id, user.id, dto);
  }

  // DELETE /api/v1/requisitions/:id
  @Delete(':id')
  @HttpCode(204)
  async remove(@Req() req: FastifyRequest, @Param('id') id: string) {
    const user = (req as any).user;
    return this.mrService.remove(user.tenantId, id, user.id);
  }

  // POST /api/v1/requisitions/:id/submit
  @Post(':id/submit')
  @HttpCode(200)
  async submit(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() dto: SubmitMrDto,
  ) {
    const user = (req as any).user;
    return this.mrService.submit(user.tenantId, id, user.id, dto);
  }

  // POST /api/v1/requisitions/:id/approve
  @Post(':id/approve')
  @HttpCode(200)
  async approve(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() dto: ApproveMrDto,
  ) {
    const user = (req as any).user;
    return this.mrService.approve(user.tenantId, id, user.id, dto);
  }

  // POST /api/v1/requisitions/:id/reject
  @Post(':id/reject')
  @HttpCode(200)
  async reject(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() dto: RejectMrDto,
  ) {
    const user = (req as any).user;
    return this.mrService.reject(user.tenantId, id, user.id, dto);
  }
}
