import { Module } from '@nestjs/common';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';

/** Phase 4.4 — Report-lite */
@Module({ controllers: [ReportController], providers: [ReportService] })
export class ReportModule {}
