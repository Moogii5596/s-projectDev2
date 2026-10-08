import { Controller, Get, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ApprovalSlaService } from './approval-sla.service';

@Controller('reports')
export class ApprovalSlaController {
  constructor(private readonly slaService: ApprovalSlaService) {}

  @Get('approval-sla')
  async getApprovalSla(
    @Req() req: FastifyRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const user = (req as any).user;
    return this.slaService.getReport(
      user.tenantId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }
}