import { Body, Controller, Get, Param, Post, Put, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { WorkflowDefinitionInput, WorkflowDefinitionService } from './workflow-definition.service';

@Controller('workflow/definitions')
export class WorkflowDefinitionController {
  constructor(private readonly service: WorkflowDefinitionService) {}

  @Get()
  list(@Req() req: FastifyRequest) {
    return this.service.list((req as any).user.tenantId);
  }

  @Post()
  create(@Req() req: FastifyRequest, @Body() input: WorkflowDefinitionInput) {
    return this.service.create((req as any).user.tenantId, input);
  }

  @Put(':id')
  update(@Req() req: FastifyRequest, @Param('id') id: string, @Body() input: WorkflowDefinitionInput) {
    return this.service.update((req as any).user.tenantId, id, input);
  }
}