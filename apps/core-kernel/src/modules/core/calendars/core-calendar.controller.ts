import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { reqUser } from '../../camp/common/camp-request';
import { CreateCalendarHolidayDto, CreateHolidayCalendarDto, UpdateHolidayCalendarDto } from './core-calendar.dto';
import { CoreCalendarService } from './core-calendar.service';

@Controller('core/calendars')
export class CoreCalendarController {
  constructor(private readonly calendars: CoreCalendarService) {}

  @Get()
  list(@Req() req: FastifyRequest) {
    const user = reqUser(req);
    return this.calendars.list(user.tenantId, user.id);
  }

  @Post()
  create(@Req() req: FastifyRequest, @Body() dto: CreateHolidayCalendarDto) {
    const user = reqUser(req);
    return this.calendars.create(user.tenantId, user.id, dto);
  }

  @Patch(':id')
  update(@Req() req: FastifyRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateHolidayCalendarDto) {
    const user = reqUser(req);
    return this.calendars.update(user.tenantId, user.id, id, dto);
  }

  @Post(':id/holidays')
  addHoliday(@Req() req: FastifyRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: CreateCalendarHolidayDto) {
    const user = reqUser(req);
    return this.calendars.addHoliday(user.tenantId, user.id, id, dto);
  }

  @Delete(':calendarId/holidays/:id')
  removeHoliday(
    @Req() req: FastifyRequest,
    @Param('calendarId', new ParseUUIDPipe()) calendarId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const user = reqUser(req);
    return this.calendars.removeHoliday(user.tenantId, user.id, calendarId, id);
  }
}
