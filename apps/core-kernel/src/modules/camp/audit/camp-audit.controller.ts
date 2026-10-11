import { Controller, Get, Param, ParseUUIDPipe, Query, Req } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import type { FastifyRequest } from 'fastify';
import { reqUser } from '../common/camp-request';
import { CAMP_AUDIT_ENTITIES, CampAuditService } from '../common/camp-audit.service';

export class QueryAuditDto {
  @IsOptional() @IsIn(CAMP_AUDIT_ENTITIES) entityType?: string;
  @IsOptional() @IsUUID() entityId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
  @IsOptional() @IsString() cursor?: string;
}

/** v0.2.0 §0.4 — GET /api/v1/camp/camps/:campId/audit (харах UI: v0.2.2 FB-09) */
@Controller('camp/camps/:campId/audit')
export class CampAuditController {
  constructor(private readonly audit: CampAuditService) {}

  @Get()
  list(@Req() req: FastifyRequest, @Param('campId', new ParseUUIDPipe()) campId: string, @Query() q: QueryAuditDto) {
    const u = reqUser(req);
    return this.audit.list(u.tenantId, u.id, campId, q);
  }
}
