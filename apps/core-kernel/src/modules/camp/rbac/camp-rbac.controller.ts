import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post, Put, Get, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { reqUser } from '../common/camp-request';
import { CampEmployeeLoginService } from './camp-employee-login.service';
import { CampUserAccessService } from './camp-user-access.service';
import { CreateEmployeeUserDto, LinkEmployeeUserDto, PositionPreviewQueryDto } from './camp-rbac.dto';

/**
 * Ажилтны картаас нэвтрэх эрх (ADR-003 §2.1–2.3): `/api/v1/camp/camps/:campId/employees/:id/{user,position-preview,create-user}`.
 * v0.2.3 Блок 3: роль / эрхийн замууд → `CoreRbacController` (`/core/rbac`). Эдгээр нь ажилтанд хамаарах тул энд (HR руу — ARC-01).
 */
@Controller('camp')
export class CampRbacController {
  constructor(
    private readonly login: CampEmployeeLoginService,
    private readonly userAccess: CampUserAccessService,
  ) {}

  // ── v0.2.2 Блок 2: ажилтан ↔ нэвтрэх эрх (ADR-003 §2.1, D-11, D-13) ──

  @Put('camps/:campId/employees/:id/user')
  linkUser(
    @Req() req: FastifyRequest,
    @Param('campId', new ParseUUIDPipe()) campId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: LinkEmployeeUserDto,
  ) {
    const u = reqUser(req);
    return this.login.link(u.tenantId, u.id, campId, id, dto.userId);
  }

  @Get('camps/:campId/employees/:id/position-preview')
  positionPreview(
    @Req() req: FastifyRequest,
    @Param('campId', new ParseUUIDPipe()) campId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() q: PositionPreviewQueryDto,
  ) {
    const u = reqUser(req);
    return this.login.positionPreview(u.tenantId, u.id, campId, id, q.positionId === 'none' ? null : q.positionId);
  }


  @Post('camps/:campId/employees/:id/create-user')
  @HttpCode(201)
  createEmployeeUser(
    @Req() req: FastifyRequest,
    @Param('campId', new ParseUUIDPipe()) campId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateEmployeeUserDto,
  ) {
    const u = reqUser(req);
    return this.userAccess.createUserForEmployee(u.tenantId, u.tenantSlug, u.id, campId, id, dto.email);
  }
}
