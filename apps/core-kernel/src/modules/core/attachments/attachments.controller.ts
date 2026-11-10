import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, Req, Res, StreamableFile } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { reqUser } from '../../camp/common/camp-request';
import { notFound } from '../../../common/i18n/app-error';
import { AttachmentsService, MAX_BULK_ATTACHMENT_FILES } from './attachments.service';
import { AttachmentTypeRegistry } from './attachment-type.registry';
import { readFileUpload } from './file-upload';

class AttachmentTargetDto {
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,59}$/) entityType!: string;
  @IsUUID() entityId!: string;
}

class AttachmentNamePatternDto {
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,59}$/) entityType!: string;
  @IsString() @MaxLength(100) pattern!: string;
}

class AttachmentBulkDto {
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,59}$/) entityType!: string;
}

/** RFC 5987 — файлын нэр (кирилл/хятад) Content-Disposition-д */
const disposition = (name: string) =>
  `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(name)}`;

/** v0.2.4 Блок 8 (FILE-01) — хавсралт. Эрх = тухайн объектын эрх (төрлийн handler) */
@Controller('core/attachments')
export class AttachmentsController {
  constructor(
    private readonly attachments: AttachmentsService,
    private readonly registry: AttachmentTypeRegistry,
  ) {}

  @Get('patterns')
  patterns(@Req() req: FastifyRequest) {
    const u = reqUser(req);
    return this.attachments.listNamePatterns(u.tenantId, u.id);
  }

  @Put('patterns')
  savePattern(@Req() req: FastifyRequest, @Body() dto: AttachmentNamePatternDto) {
    const u = reqUser(req);
    return this.attachments.saveNamePattern(u.tenantId, u.id, dto.entityType, dto.pattern);
  }

  @Post('bulk/preview')
  async previewBulk(@Req() req: FastifyRequest, @Query() q: AttachmentBulkDto) {
    const u = reqUser(req);
    const files = await readFileUpload(req, MAX_BULK_ATTACHMENT_FILES, 10 * 1024 * 1024);
    return this.attachments.previewBulk(u.tenantId, u.id, q.entityType, files);
  }

  @Post('bulk/commit')
  async commitBulk(@Req() req: FastifyRequest, @Query() q: AttachmentBulkDto) {
    const u = reqUser(req);
    const files = await readFileUpload(req, MAX_BULK_ATTACHMENT_FILES, 10 * 1024 * 1024);
    return this.attachments.commitBulk(u.tenantId, u.id, q.entityType, files);
  }

  @Get()
  list(@Req() req: FastifyRequest, @Query() q: AttachmentTargetDto) {
    const u = reqUser(req);
    return this.attachments.list(u.tenantId, u.id, q.entityType, q.entityId);
  }

  @Post()
  async upload(@Req() req: FastifyRequest, @Query() q: AttachmentTargetDto) {
    const u = reqUser(req);
    const h = this.registry.get(q.entityType);
    if (!h) throw notFound('core.files.type_unknown');
    const files = await readFileUpload(req, h.maxFiles, h.maxBytes);
    return this.attachments.upload(u.tenantId, u.id, q.entityType, q.entityId, files);
  }

  @Get(':id/download')
  async download(@Req() req: FastifyRequest, @Param('id', new ParseUUIDPipe()) id: string, @Res({ passthrough: true }) reply: FastifyReply) {
    const u = reqUser(req);
    const file = await this.attachments.download(u.tenantId, u.id, id);
    reply
      .header('Content-Disposition', disposition(file.fileName))
      .header('X-Content-Type-Options', 'nosniff')
      .header('Cache-Control', 'private, no-store')
      .header('Content-Security-Policy', "default-src 'none'; sandbox");
    return new StreamableFile(file.data, { type: file.mimeType, length: file.data.length });
  }

  @Delete(':id')
  remove(@Req() req: FastifyRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    const u = reqUser(req);
    return this.attachments.remove(u.tenantId, u.id, id);
  }
}
