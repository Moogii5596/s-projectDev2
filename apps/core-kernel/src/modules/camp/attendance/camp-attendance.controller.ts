import { BadRequestException, Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, PayloadTooLargeException, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { reqUser } from '../common/camp-request';
import { CampAttendanceService } from './camp-attendance.service';
import { CampShiftsService } from './camp-shifts.service';
import { CampRoomsService } from './camp-rooms.service';
import { CampPresenceService } from './camp-presence.service';
import {
  CalendarQueryDto,
  CreateMovementDto,
  CreateRoomAllocationDto,
  CreateShiftAdjustmentsDto,
  DateQueryDto,
  EndRoomAllocationDto,
  QueryAllocationsDto,
  QueryImportsDto,
  RangeQueryDto,
} from './camp-attendance.dto';

const uuid = () => new ParseUUIDPipe();

type MultipartFile = { filename: string; toBuffer: () => Promise<Buffer> };

/** @fastify/multipart — нэг файл ("file" талбар) → Buffer (≤ 2 MB) */
async function readUpload(req: FastifyRequest): Promise<{ fileName: string; buffer: Buffer }> {
  const r = req as unknown as { isMultipart?: () => boolean; file?: () => Promise<MultipartFile | undefined> };
  if (typeof r.file !== 'function' || !r.isMultipart?.()) throw new BadRequestException('multipart/form-data хэлбэрээр "file" талбартай илгээнэ үү');
  const file = await r.file();
  if (!file) throw new BadRequestException('Файл алга ("file" талбар)');
  try {
    return { fileName: file.filename, buffer: await file.toBuffer() };
  } catch (err) {
    if ((err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') throw new PayloadTooLargeException('Файл 2 MB-ээс их байна');
    throw err;
  }
}

/** Шат 3 — /api/v1/camp/camps/:campId/{movement-imports,movements,stays,shift-*,room-*,presence} */
@Controller('camp/camps/:campId')
export class CampAttendanceController {
  constructor(
    private readonly attendance: CampAttendanceService,
    private readonly shifts: CampShiftsService,
    private readonly rooms: CampRoomsService,
    private readonly presence: CampPresenceService,
  ) {}

  // ── Ирцийн импорт ──
  @Get('movement-imports/template')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="camp-attendance-template.xlsx"')
  template(@Param('campId', uuid()) _campId: string) {
    return this.attendance.template();
  }

  @Post('movement-imports')
  @HttpCode(201)
  async upload(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string) {
    const u = reqUser(req);
    const { fileName, buffer } = await readUpload(req);
    return this.attendance.preview(u.tenantId, u.id, campId, fileName, buffer);
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

  @Get('stays')
  stays(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Query() q: DateQueryDto) {
    const u = reqUser(req);
    return this.attendance.listStays(u.tenantId, u.id, campId, q.date);
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

  // ── Өрөө ──
  @Get('room-allocations')
  listAllocations(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Query() q: QueryAllocationsDto) {
    const u = reqUser(req);
    return this.rooms.list(u.tenantId, u.id, campId, q);
  }

  @Post('room-allocations')
  @HttpCode(201)
  allocate(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Body() dto: CreateRoomAllocationDto) {
    const u = reqUser(req);
    return this.rooms.allocate(u.tenantId, u.id, campId, dto);
  }

  @Post('room-allocations/:id/end')
  @HttpCode(200)
  endAllocation(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string, @Body() dto: EndRoomAllocationDto) {
    const u = reqUser(req);
    return this.rooms.end(u.tenantId, u.id, campId, id, dto);
  }

  @Get('room-board')
  roomBoard(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Query() q: DateQueryDto) {
    const u = reqUser(req);
    return this.rooms.board(u.tenantId, u.id, campId, q.date);
  }

  // ── Хоолны суурь тоо ──
  @Get('presence')
  presenceOf(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Query() q: DateQueryDto) {
    const u = reqUser(req);
    return this.presence.presence(u.tenantId, u.id, campId, q.date);
  }
}
