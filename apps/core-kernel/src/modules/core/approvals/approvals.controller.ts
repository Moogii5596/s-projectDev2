import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { reqUser } from '../../camp/common/camp-request';
import { ApprovalsService } from './approvals.service';
import { CreateDelegationDto, DecideApprovalDto, DefinitionsQueryDto, SaveApprovalDefinitionDto } from './approvals.dto';

/** v0.2.4 Блок 6 (WF-06) — батлах урсгал: жагсаалт/шийдвэр (бүх хэрэглэгч, эрхээр), тохиргоо (tenant admin) */
@Controller('core/approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get('inbox')
  inbox(@Req() req: FastifyRequest) {
    const u = reqUser(req);
    return this.approvals.inbox(u.tenantId, u.id);
  }

  @Get('mine')
  mine(@Req() req: FastifyRequest) {
    const u = reqUser(req);
    return this.approvals.mine(u.tenantId, u.id);
  }

  @Get('entity-types')
  entityTypes(@Req() req: FastifyRequest) {
    const u = reqUser(req);
    return this.approvals.entityTypes(u.tenantId, u.id);
  }

  @Get('definitions')
  definitions(@Req() req: FastifyRequest, @Query() q: DefinitionsQueryDto) {
    const u = reqUser(req);
    return this.approvals.definitions(u.tenantId, u.id, q.entityType);
  }

  @Post('definitions')
  saveDefinition(@Req() req: FastifyRequest, @Body() dto: SaveApprovalDefinitionDto) {
    const u = reqUser(req);
    return this.approvals.saveDefinition(u.tenantId, u.id, dto);
  }

  @Get('delegates')
  delegates(@Req() req: FastifyRequest) {
    const u = reqUser(req);
    return this.approvals.delegateCandidates(u.tenantId, u.id);
  }

  @Get('delegations')
  delegations(@Req() req: FastifyRequest) {
    const u = reqUser(req);
    return this.approvals.delegations(u.tenantId, u.id);
  }

  @Post('delegations')
  createDelegation(@Req() req: FastifyRequest, @Body() dto: CreateDelegationDto) {
    const u = reqUser(req);
    return this.approvals.createDelegation(u.tenantId, u.id, dto);
  }

  @Delete('delegations/:id')
  revokeDelegation(@Req() req: FastifyRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    const u = reqUser(req);
    return this.approvals.revokeDelegation(u.tenantId, u.id, id);
  }

  @Get('instances/:id')
  detail(@Req() req: FastifyRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    const u = reqUser(req);
    return this.approvals.detail(u.tenantId, u.id, id);
  }

  @Post('instances/:id/decide')
  decide(@Req() req: FastifyRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: DecideApprovalDto) {
    const u = reqUser(req);
    return this.approvals.decide(u.tenantId, u.id, id, dto);
  }
}
