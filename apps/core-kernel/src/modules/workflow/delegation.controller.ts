import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CreateDelegationDto, DelegationService } from './delegation.service';

@Controller('workflow/delegations')
export class DelegationController {
  constructor(private readonly delegationService: DelegationService) {}

  @Get()
  list(@Req() req: FastifyRequest) {
    return this.delegationService.listDelegations((req as any).user.tenantId);
  }

  @Post()
  create(@Req() req: FastifyRequest, @Body() dto: CreateDelegationDto) {
    return this.delegationService.createDelegation((req as any).user.tenantId, dto);
  }

  @Delete(':id')
  revoke(@Req() req: FastifyRequest, @Param('id') id: string) {
    return this.delegationService.revokeDelegation((req as any).user.tenantId, id);
  }
}