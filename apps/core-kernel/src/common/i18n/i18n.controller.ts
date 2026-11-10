import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, Matches, MaxLength, ValidateIf, ValidateNested } from 'class-validator';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { PrismaTenantClientService } from '../../db/prisma-tenant-client.service';
import { badRequest, payloadTooLarge } from './app-error';
import { isLang, LANGS } from './i18n-context';
import { I18nOverridesService } from './i18n-overrides.service';

type ReqUser = { id: string; tenantId: string };
const user = (req: FastifyRequest) => (req as unknown as { user: ReqUser }).user;

export class LocaleDto {
  @IsIn(LANGS) locale!: string;
}

export class I18nChangeDto {
  @IsString() @Matches(/^[A-Za-z0-9_.-]{2,120}$/) key!: string;
  @IsIn(LANGS) lang!: string;
  /** null = анхдагч руу буцаах */
  @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(500) to!: string | null;
}

export class ApplyI18nDto {
  @IsArray() @ArrayMaxSize(5000) @ValidateNested({ each: true }) @Type(() => I18nChangeDto) changes!: I18nChangeDto[];
}

export class HistoryQueryDto {
  @IsOptional() @IsString() @MaxLength(120) key?: string;
}

type MultipartFile = { filename: string; toBuffer: () => Promise<Buffer> };

/** v0.2.0 §0.7 — /api/v1/i18n */
@Controller('i18n')
export class I18nController {
  constructor(
    private readonly overrides: I18nOverridesService,
    private readonly prisma: PrismaTenantClientService,
  ) {}

  /** Frontend-ийн байгууллагын засвар (≤60с тутам; If-None-Match → 304) */
  @Get('web/:lang')
  async web(@Req() req: FastifyRequest, @Param('lang') lang: string, @Res({ passthrough: true }) reply: FastifyReply) {
    if (!isLang(lang)) throw badRequest('i18n.unknown_key', { key: lang });
    const res = await this.overrides.webMessages(user(req).tenantId, lang);
    const etag = `"${res.version}"`;
    reply.header('ETag', etag).header('Cache-Control', 'no-cache');
    if (req.headers['if-none-match'] === etag) {
      reply.code(304);
      return '';
    }
    return res;
  }

  /** Хэрэглэгчийн хэл (профайлд) */
  @Patch('me/locale')
  async setLocale(@Req() req: FastifyRequest, @Body() dto: LocaleDto) {
    const u = user(req);
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${u.tenantId}, true)`;
      await tx.coreUser.updateMany({ where: { authId: u.id, tenantId: u.tenantId }, data: { locale: dto.locale } });
    });
    return { locale: dto.locale };
  }

  @Get('admin/export')
  async export(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const buf = await this.overrides.exportXlsx(user(req).tenantId, user(req).id);
    reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="translations-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    return buf;
  }

  /** multipart "file" (.xlsx / .csv) → өөрчлөлтийн урьдчилсан харагдац */
  @Post('admin/preview')
  @HttpCode(200)
  async preview(@Req() req: FastifyRequest) {
    const r = req as unknown as { isMultipart?: () => boolean; file?: () => Promise<MultipartFile | undefined> };
    if (!r.isMultipart?.() || typeof r.file !== 'function') throw badRequest('i18n.bad_file');
    const file = await r.file();
    if (!file) throw badRequest('i18n.bad_file');
    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch (err) {
      if ((err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') throw payloadTooLarge('import.file_too_large', { max: 2 });
      throw err;
    }
    return this.overrides.preview(user(req).tenantId, user(req).id, buffer, file.filename);
  }

  @Post('admin/apply')
  @HttpCode(200)
  apply(@Req() req: FastifyRequest, @Body() dto: ApplyI18nDto) {
    return this.overrides.apply(user(req).tenantId, user(req).id, dto.changes);
  }

  @Get('admin/overrides')
  list(@Req() req: FastifyRequest) {
    return this.overrides.listOverrides(user(req).tenantId, user(req).id);
  }

  @Get('admin/catalog')
  catalog(@Req() req: FastifyRequest) {
    return this.overrides.listCatalog(user(req).tenantId, user(req).id);
  }

  @Get('admin/history')
  history(@Req() req: FastifyRequest, @Query() q: HistoryQueryDto) {
    return this.overrides.history(user(req).tenantId, user(req).id, q.key);
  }
}
