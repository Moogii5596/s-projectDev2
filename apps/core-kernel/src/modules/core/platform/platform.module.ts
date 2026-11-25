import { Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { AuditService } from './audit.service';

/**
 * Цөмийн platform (ADR-009, C1 / CORE-01) — эрх шалгах, audit: бүх модуль хуваалцана, аль ч бизнес модулиас хамаарахгүй.
 * Эрхийн код, audit-ийн хүснэгт (`camp_audit_log`) нэр CORE-02 хүртэл хуучнаараа.
 */
@Module({
  providers: [AccessService, AuditService],
  exports: [AccessService, AuditService],
})
export class PlatformModule {}
