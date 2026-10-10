import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { WorkflowDefinitionService } from './workflow-definition.service';
import { WorkflowDefinitionDto } from './workflow-definition.dto';

/**
 * Phase 4.9.1 [SEC-003]: body = class DTO (stepsConfig-ийн бүтэц, role шалгана),
 * үүсгэх/засах = OWNER/ADMIN (service-д requireRole), `:id` = UUID (4.9.3)
 */
@Controller('workflow/definitions')
export class WorkflowDefinitionController {
  constructor(private readonly service: WorkflowDefinitionService) {}

  @Get()
  list(@Req() req: FastifyRequest) {
    return this.service.list((req as any).user.tenantId);
  }

  @Post()
  create(@Req() req: FastifyRequest, @Body() dto: WorkflowDefinitionDto) {
    const user = (req as any).user;
    return this.service.create(user.tenantId, user.id, toInput(dto));
  }

  @Put(':id')
  update(@Req() req: FastifyRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: WorkflowDefinitionDto) {
    const user = (req as any).user;
    return this.service.update(user.tenantId, user.id, id, toInput(dto));
  }
}

function toInput(dto: WorkflowDefinitionDto) {
  return {
    name: dto.name,
    stepsConfig: dto.stepsConfig as Prisma.InputJsonValue,
    ...(dto.slaHours !== undefined ? { slaHours: dto.slaHours } : {}),
    ...(dto.escalationEnabled !== undefined ? { escalationEnabled: dto.escalationEnabled } : {}),
    ...(dto.delegationEnabled !== undefined ? { delegationEnabled: dto.delegationEnabled } : {}),
  };
}
