import { Controller, Get, Header, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { RequestUser } from '@s-project/shared-types';
import { ReportService } from './report.service';

/** Phase 4.4 — /api/v1/reports (approval-sla нь WorkflowModule-д тусдаа) */
@Controller('reports')
export class ReportController {
  constructor(private readonly reports: ReportService) {}

  private user(req: FastifyRequest): RequestUser {
    return (req as unknown as { user: RequestUser }).user;
  }

  @Get('summary')
  summary(@Req() req: FastifyRequest) {
    return this.reports.summary(this.user(req).tenantId);
  }

  @Get('summary.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="s-project-summary.csv"')
  summaryCsv(@Req() req: FastifyRequest) {
    return this.reports.summaryCsv(this.user(req).tenantId);
  }
}
