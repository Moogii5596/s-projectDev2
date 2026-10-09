import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { reqUser } from '../common/camp-request';
import { CampRbacService } from './camp-rbac.service';
import {
  AssignUserRoleDto,
  CreateCampRoleDto,
  QueryMyPermissionsDto,
  QueryUserRolesDto,
  SetRolePermissionsDto,
  UpdateCampRoleDto,
} from './camp-rbac.dto';

/** Шат 2.2 — /api/v1/camp/{permissions,me,users,roles,user-roles} */
@Controller('camp')
export class CampRbacController {
  constructor(private readonly rbac: CampRbacService) {}

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
}
