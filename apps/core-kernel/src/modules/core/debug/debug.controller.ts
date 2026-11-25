import { Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { reqUser } from '../../camp/common/camp-request';
import { DebugAccessGuard } from './debug-access.guard';
import { DebugService } from './debug.service';

class LogsQueryDto {
  @IsOptional() @IsIn(['error', 'warn']) level?: 'error' | 'warn';
}

class AuditQueryDto {
  @IsOptional() @IsString() @Matches(/^[a-z_]{2,40}$/) entityType?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
}

/** v0.2.4 Блок 10 (DBG-01) — `/debug/*` дэлгэцийн API. Бүх зам `DebugAccessGuard`-тай; үйлдэл — core.debug.manage + audit */
@Controller('core/debug')
@UseGuards(DebugAccessGuard)
export class DebugController {
  constructor(private readonly debug: DebugService) {}

  @Get('me')
  async me(@Req() req: FastifyRequest) {
    const u = reqUser(req);
    return { canManage: await this.debug.canManage(u.tenantId, u.id) };
  }

  @Get('system')
  system(@Req() req: FastifyRequest) {
    return this.debug.systemInfo(reqUser(req).tenantId);
  }

  @Get('health')
  health(@Req() req: FastifyRequest) {
    return this.debug.health(reqUser(req).tenantId);
  }

  @Get('users')
  users(@Req() req: FastifyRequest) {
    return this.debug.users(reqUser(req).tenantId);
  }

  @Get('permissions/:userId')
  permissions(@Req() req: FastifyRequest, @Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.debug.permissions(reqUser(req).tenantId, userId);
  }

  @Get('logs')
  logs(@Req() req: FastifyRequest, @Query() q: LogsQueryDto) {
    const u = reqUser(req);
    return this.debug.logs(u.tenantId, u.id, q.level);
  }

  @Get('audit')
  audit(@Req() req: FastifyRequest, @Query() q: AuditQueryDto) {
    return this.debug.auditLog(reqUser(req).tenantId, q);
  }

  @Get('i18n-missing')
  i18nMissing(@Req() req: FastifyRequest) {
    return this.debug.i18nMissing(reqUser(req).tenantId);
  }

  @Get('outbox')
  outbox(@Req() req: FastifyRequest) {
    return this.debug.outbox(reqUser(req).tenantId);
  }

  @Post('actions/cache-clear')
  clearCaches(@Req() req: FastifyRequest) {
    const u = reqUser(req);
    return this.debug.clearCaches(u.tenantId, u.id);
  }

  @Post('actions/outbox/:id/retry')
  retryOutbox(@Req() req: FastifyRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    const u = reqUser(req);
    return this.debug.retryOutbox(u.tenantId, u.id, id);
  }
}
