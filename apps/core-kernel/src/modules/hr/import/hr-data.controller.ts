import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import { IsBoolean, IsOptional, Matches } from 'class-validator';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { badRequest, payloadTooLarge } from '../../../common/i18n/app-error';
import { TABLE_MAX_ROWS } from '../../../common/xlsx/table-spec';
import { reqUser } from '../../camp/common/camp-request';
import { HrDataImportService, ImportInput } from './hr-data-import.service';

const uuid = () => new ParseUUIDPipe();
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export class ConfirmImportDto {
  @IsOptional() @IsBoolean() skipErrors?: boolean;
}

export class ListImportsDto {
  /** Бүртгэлтэй төрөл эсэхийг service шалгана (модулиуд `registerHandler`-ээр нэмдэг, v0.2.3 Блок D) */
  @IsOptional() @Matches(/^[a-z][a-z-]{1,39}$/) type?: string;
}

type MultipartFile = { filename: string; toBuffer: () => Promise<Buffer> };
const isMultipart = (req: FastifyRequest) => (req as unknown as { isMultipart?: () => boolean }).isMultipart?.() === true;

async function readXlsx(req: FastifyRequest): Promise<{ fileName: string; buffer: Buffer }> {
  const file = await (req as unknown as { file: () => Promise<MultipartFile | undefined> }).file();
  if (!file) throw badRequest('import.not_xlsx');
  try {
    return { fileName: file.filename, buffer: await file.toBuffer() };
  } catch (err) {
    if ((err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') throw payloadTooLarge('import.file_too_large', { max: 2 });
    throw err;
  }
}

/**
 * v0.2.0 §0.5 — HR импорт/экспорт: /api/v1/hr/sites/:campId/data-imports/:type · /export/:type (v0.2.2 H1; өмнө нь /camp/camps/:campId/...).
 * Экспортын нэмэлт төрөл (жишээ нь Кемпийн `rooms`) — `HrDataImportService.registerExport`.
 * POST data-imports/:type: multipart "file" (xlsx) ЭСВЭЛ JSON { rows: [...] } (хүснэгтээр оруулах).
 */
@Controller('hr/sites/:campId')
export class HrDataController {
  constructor(private readonly data: HrDataImportService) {}

  @Get('data-imports/:type/template')
  async template(@Param('campId', uuid()) _campId: string, @Param('type') type: string, @Res({ passthrough: true }) reply: FastifyReply) {
    const file = await this.data.template(type);
    reply.header('Content-Type', XLSX).header('Content-Disposition', `attachment; filename="camp-${type}-template.xlsx"`);
    return file;
  }

  @Get('data-imports')
  list(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Query() q: ListImportsDto) {
    const u = reqUser(req);
    return this.data.list(u.tenantId, u.id, campId, q.type);
  }

  @Post('data-imports/:type')
  @HttpCode(201)
  async upload(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('type') type: string) {
    const u = reqUser(req);
    let input: ImportInput;
    if (isMultipart(req)) {
      input = { kind: 'xlsx', ...(await readXlsx(req)) };
    } else {
      // JSON-ийг энд шалгана (multipart ба JSON нэг route) — ValidationPipe-тэй ижил дүрэм
      const body = req.body as { rows?: unknown } | undefined;
      if (!body || !Array.isArray(body.rows) || body.rows.some((r) => typeof r !== 'object' || r === null || Array.isArray(r))) {
        throw badRequest('import.empty');
      }
      if (body.rows.length > TABLE_MAX_ROWS) throw badRequest('import.too_many_rows', { max: TABLE_MAX_ROWS });
      input = { kind: 'rows', rows: body.rows as Record<string, unknown>[] };
    }
    return this.data.preview(u.tenantId, u.id, campId, type, input);
  }

  @Get('data-imports/:type/:id')
  get(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string) {
    const u = reqUser(req);
    return this.data.get(u.tenantId, u.id, campId, id);
  }

  @Post('data-imports/:type/:id/confirm')
  @HttpCode(200)
  confirm(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string, @Body() dto: ConfirmImportDto) {
    const u = reqUser(req);
    return this.data.confirm(u.tenantId, u.id, campId, id, dto.skipErrors === true);
  }

  @Post('data-imports/:type/:id/cancel')
  @HttpCode(200)
  cancel(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string) {
    const u = reqUser(req);
    return this.data.cancel(u.tenantId, u.id, campId, id);
  }

  @Get('export/:type')
  async export(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('type') type: string, @Res({ passthrough: true }) reply: FastifyReply) {
    const u = reqUser(req);
    const { buffer, fileName } = await this.data.export(u.tenantId, u.id, campId, type);
    reply.header('Content-Type', XLSX).header('Content-Disposition', `attachment; filename="${fileName.replace(/[^A-Za-z0-9._-]/g, '_')}"`);
    return buffer;
  }
}
