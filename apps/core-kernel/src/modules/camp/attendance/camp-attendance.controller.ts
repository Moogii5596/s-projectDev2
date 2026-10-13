import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { reqUser } from '../common/camp-request';
import { CampStaysService } from './camp-stays.service';
import { CampRoomsService } from './camp-rooms.service';
import { CampPresenceService } from './camp-presence.service';
import { CreateRoomAllocationDto, DateQueryDto, StaysQueryDto, EndRoomAllocationDto, QueryAllocationsDto } from './camp-attendance.dto';

const uuid = () => new ParseUUIDPipe();

/** Шат 3 — /api/v1/camp/camps/:campId/{stays,room-*,presence} (кемп). Ирц/ээлж → HR (`HrAttendanceController`, v0.2.2 H1). */
@Controller('camp/camps/:campId')
export class CampAttendanceController {
  constructor(
    private readonly staysService: CampStaysService,
    private readonly rooms: CampRoomsService,
    private readonly presence: CampPresenceService,
  ) {}

  @Get('stays')
  stays(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Query() q: StaysQueryDto) {
    const u = reqUser(req);
    return this.staysService.listStays(u.tenantId, u.id, campId, q.date, q.shift);
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
