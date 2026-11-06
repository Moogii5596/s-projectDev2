import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { reqUser } from '../../camp/common/camp-request';
import { badRequest, payloadTooLarge } from '../../../common/i18n/app-error';
import { HrAttendanceService } from './hr-attendance.service';
import { HrShiftsService } from './hr-shifts.service';
import { CalendarQueryDto, CreateMovementDto, CreateShiftAdjustmentsDto, ManualMovementsDto, QueryImportsDto, RangeQueryDto, UpdateImportRowsDto } from './hr-attendance.dto';

const uuid = () => new ParseUUIDPipe();

type MultipartFile = { filename: string; toBuffer: () => Promise<Buffer> };

/** @fastify/multipart — нэг файл ("file" талбар) → Buffer (≤ 2 MB) */
async function readUpload(req: FastifyRequest): Promise<{ fileName: string; buffer: Buffer }> {
  const r = req as unknown as { isMultipart?: () => boolean; file?: () => Promise<MultipartFile | undefined> };
  if (typeof r.file !== 'function' || !r.isMultipart?.()) throw badRequest('camp.err.attendance_ctl.1');
  const file = await r.file();
  if (!file) throw badRequest('camp.err.attendance_ctl.2');
  try {
    return { fileName: file.filename, buffer: await file.toBuffer() };
  } catch (err) {
    if ((err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') throw payloadTooLarge('camp.err.attendance_ctl.3');
    throw err;
  }
}

/**
 * HR — ирц (ирсэн/явсан, xlsx импорт, гараар), ээлжийн өөрчлөлт, ээлжийн календарь:
 * /api/v1/hr/sites/:campId/{movement-imports,movements,shift-adjustments,shift-calendar} (v0.2.2 H1; өмнө нь /camp/camps/:campId/...).
 * `:campId` = «үндсэн ажлын байр» (ADR-006 §5).
 */
@Controller('hr/sites/:campId')
export class HrAttendanceController {
  constructor(
    private readonly attendance: HrAttendanceService,
    private readonly shifts: HrShiftsService,
  ) {}

  // ── Ирцийн импорт ──
  // Phase 4.9.3: @Header нь pipe-ийн өмнө тавигддаг → буруу campId-ийн 400 JSON xlsx Content-Type-тай болж Fastify 500 өгдөг байв.
  // Header-ийг зөвхөн амжилттай үед handler дотор тавина.
  @Get('movement-imports/template')
  async template(@Param('campId', uuid()) _campId: string, @Res({ passthrough: true }) reply: FastifyReply) {
    const file = await this.attendance.template();
    reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', 'attachment; filename="camp-attendance-template.xlsx"');
    return file;
  }

  @Post('movement-imports')
  @HttpCode(201)
  async upload(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string) {
    const u = reqUser(req);
    const { fileName, buffer } = await readUpload(req);
    return this.attendance.preview(u.tenantId, u.id, campId, fileName, buffer);
  }

  /** FB-14 (v0.2.0) — олон ажилтны ирц нэг дор (xlsx-гүй) → PREVIEW */
  @Post('movement-imports/manual')
  @HttpCode(201)
  manual(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Body() dto: ManualMovementsDto) {
    const u = reqUser(req);
    return this.attendance.previewManual(u.tenantId, u.id, campId, dto);
  }

  @Get('movement-imports')
  listImports(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Query() q: QueryImportsDto) {
    const u = reqUser(req);
    return this.attendance.listImports(u.tenantId, u.id, campId, q);
  }

  @Get('movement-imports/:id')
  getImport(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string) {
    const u = reqUser(req);
    return this.attendance.getImport(u.tenantId, u.id, campId, id);
  }

  /** v0.2.3 Блок R4.1 — PREVIEW-ийн мөрийг засах / устгах → шинэ PREVIEW */
  @Patch('movement-imports/:id/rows')
  updateRows(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string, @Body() dto: UpdateImportRowsDto) {
    const u = reqUser(req);
    return this.attendance.updateRows(u.tenantId, u.id, campId, id, dto);
  }

  @Post('movement-imports/:id/confirm')
  @HttpCode(200)
  confirm(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string) {
    const u = reqUser(req);
    return this.attendance.confirm(u.tenantId, u.id, campId, id);
  }

  @Post('movement-imports/:id/cancel')
  @HttpCode(200)
  cancel(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string) {
    const u = reqUser(req);
    return this.attendance.cancel(u.tenantId, u.id, campId, id);
  }

  // ── Ирэлт / явалт, байх хугацаа ──
  @Get('movements')
  listMovements(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Query() q: RangeQueryDto) {
    const u = reqUser(req);
    return this.attendance.listMovements(u.tenantId, u.id, campId, q);
  }

  @Post('movements')
  @HttpCode(201)
  createMovement(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Body() dto: CreateMovementDto) {
    const u = reqUser(req);
    return this.attendance.createMovement(u.tenantId, u.id, campId, dto);
  }

  @Delete('movements/:id')
  deleteMovement(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string) {
    const u = reqUser(req);
    return this.attendance.deleteMovement(u.tenantId, u.id, campId, id);
  }

  // ── Ээлж ──
  @Get('shift-adjustments')
  listAdjustments(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Query() q: RangeQueryDto) {
    const u = reqUser(req);
    return this.shifts.listAdjustments(u.tenantId, u.id, campId, q);
  }

  @Post('shift-adjustments')
  @HttpCode(201)
  createAdjustments(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Body() dto: CreateShiftAdjustmentsDto) {
    const u = reqUser(req);
    return this.shifts.createAdjustments(u.tenantId, u.id, campId, dto);
  }

  @Delete('shift-adjustments/:id')
  deleteAdjustment(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string) {
    const u = reqUser(req);
    return this.shifts.deleteAdjustment(u.tenantId, u.id, campId, id);
  }

  @Get('shift-calendar')
  calendar(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Query() q: CalendarQueryDto) {
    const u = reqUser(req);
    return this.shifts.calendar(u.tenantId, u.id, campId, q);
  }
}
