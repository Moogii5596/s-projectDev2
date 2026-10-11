import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { reqUser } from '../common/camp-request';
import { CampRbacService } from './camp-rbac.service';
import { CampEmployeeLoginService } from './camp-employee-login.service';
import {
  AssignUserRoleDto,
  CreateCampRoleDto,
  GrantDirectPermissionDto,
  LinkEmployeeUserDto,
  PositionPreviewQueryDto,
  QueryMyPermissionsDto,
  QueryUserRolesDto,
  SetPositionTemplatesDto,
  SetRolePermissionsDto,
  UpdateCampRoleDto,
} from './camp-rbac.dto';

/** Шат 2.2 — /api/v1/camp/{permissions,me,users,roles,user-roles}; v0.2.2 — user-permissions, positions/:id/role-templates */
@Controller('camp')
export class CampRbacController {
  constructor(
    private readonly rbac: CampRbacService,
    private readonly login: CampEmployeeLoginService,
  ) {}

  @Get('permissions')
  permissions(@Req() req: FastifyRequest) {
    return this.rbac.listPermissions(reqUser(req).tenantId);
  }

  @Get('me/permissions')
  myPermissions(@Req() req: FastifyRequest, @Query() q: QueryMyPermissionsDto) {
    const u = reqUser(req);
    return this.rbac.myPermissions(u.tenantId, u.id, q.campId);
  }

  @Get('users')
  users(@Req() req: FastifyRequest) {
    const u = reqUser(req);
    return this.rbac.listUsers(u.tenantId, u.id);
  }

  @Get('roles')
  roles(@Req() req: FastifyRequest) {
    const u = reqUser(req);
    return this.rbac.listRoles(u.tenantId, u.id);
  }

  @Post('roles')
  @HttpCode(201)
  createRole(@Req() req: FastifyRequest, @Body() dto: CreateCampRoleDto) {
    const u = reqUser(req);
    return this.rbac.createRole(u.tenantId, u.id, dto);
  }

  @Patch('roles/:id')
  updateRole(@Req() req: FastifyRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateCampRoleDto) {
    const u = reqUser(req);
    return this.rbac.updateRole(u.tenantId, u.id, id, dto);
  }

  @Delete('roles/:id')
  deleteRole(@Req() req: FastifyRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    const u = reqUser(req);
    return this.rbac.deleteRole(u.tenantId, u.id, id);
  }

  @Put('roles/:id/permissions')
  setPermissions(@Req() req: FastifyRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: SetRolePermissionsDto) {
    const u = reqUser(req);
    return this.rbac.setRolePermissions(u.tenantId, u.id, id, dto);
  }

  @Get('user-roles')
  userRoles(@Req() req: FastifyRequest, @Query() q: QueryUserRolesDto) {
    const u = reqUser(req);
    return this.rbac.listUserRoles(u.tenantId, u.id, q);
  }

  @Post('user-roles')
  @HttpCode(201)
  assign(@Req() req: FastifyRequest, @Body() dto: AssignUserRoleDto) {
    const u = reqUser(req);
    return this.rbac.assignUserRole(u.tenantId, u.id, dto);
  }

  @Delete('user-roles/:id')
  remove(@Req() req: FastifyRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    const u = reqUser(req);
    return this.rbac.removeUserRole(u.tenantId, u.id, id);
  }

  // ── v0.2.2 Блок 1 (ADR-003 §2.4) ──────────────────────────

  @Get('roles/:id/apply-preview')
  applyPreview(@Req() req: FastifyRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    const u = reqUser(req);
    return this.rbac.previewRoleApply(u.tenantId, u.id, id);
  }

  @Post('roles/:id/apply')
  @HttpCode(200)
  apply(@Req() req: FastifyRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    const u = reqUser(req);
    return this.rbac.applyRoleTemplate(u.tenantId, u.id, id);
  }

  @Get('users/:userId/permissions')
  userPermissions(@Req() req: FastifyRequest, @Param('userId', new ParseUUIDPipe()) userId: string) {
    const u = reqUser(req);
    return this.rbac.listUserPermissions(u.tenantId, u.id, userId);
  }

  @Post('users/:userId/permissions')
  @HttpCode(201)
  grantDirect(@Req() req: FastifyRequest, @Param('userId', new ParseUUIDPipe()) userId: string, @Body() dto: GrantDirectPermissionDto) {
    const u = reqUser(req);
    return this.rbac.grantDirectPermission(u.tenantId, u.id, userId, dto);
  }

  @Delete('user-permissions/:id')
  revokeDirect(@Req() req: FastifyRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    const u = reqUser(req);
    return this.rbac.revokeDirectPermission(u.tenantId, u.id, id);
  }

  @Get('positions/:positionId/role-templates')
  positionTemplates(@Req() req: FastifyRequest, @Param('positionId', new ParseUUIDPipe()) positionId: string) {
    const u = reqUser(req);
    return this.rbac.getPositionTemplates(u.tenantId, u.id, positionId);
  }

  @Put('positions/:positionId/role-templates')
  setPositionTemplates(@Req() req: FastifyRequest, @Param('positionId', new ParseUUIDPipe()) positionId: string, @Body() dto: SetPositionTemplatesDto) {
    const u = reqUser(req);
    return this.rbac.setPositionTemplates(u.tenantId, u.id, positionId, dto);
  }

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

  @Post('positions/:positionId/role-templates/apply')
  @HttpCode(200)
  applyPositionTemplates(@Req() req: FastifyRequest, @Param('positionId', new ParseUUIDPipe()) positionId: string) {
    const u = reqUser(req);
    return this.login.applyPositionTemplates(u.tenantId, u.id, positionId);
  }
}
