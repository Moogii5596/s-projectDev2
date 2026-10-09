import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { reqUser } from '../common/camp-request';
import { CampSettingsService } from './camp-settings.service';
import { CreateMealLocationDto, QueryActiveDto, UpdateCampSettingsDto, UpdateMealLocationDto } from './camp-settings.dto';

/** Шат 2.3 — /api/v1/camp/camps/:campId/{settings,meal-locations} */
@Controller('camp/camps/:campId')
export class CampSettingsController {
  constructor(private readonly settings: CampSettingsService) {}

  @Get('settings')
  get(@Req() req: FastifyRequest, @Param('campId', new ParseUUIDPipe()) campId: string) {
    const u = reqUser(req);
    return this.settings.getSettings(u.tenantId, u.id, campId);
  }

  @Put('settings')
  put(@Req() req: FastifyRequest, @Param('campId', new ParseUUIDPipe()) campId: string, @Body() dto: UpdateCampSettingsDto) {
    const u = reqUser(req);
    return this.settings.updateSettings(u.tenantId, u.id, campId, dto);
  }

  @Get('meal-locations')
  listLocations(@Req() req: FastifyRequest, @Param('campId', new ParseUUIDPipe()) campId: string, @Query() q: QueryActiveDto) {
    const u = reqUser(req);
    return this.settings.listMealLocations(u.tenantId, u.id, campId, q);
  }

  @Post('meal-locations')
  @HttpCode(201)
  createLocation(@Req() req: FastifyRequest, @Param('campId', new ParseUUIDPipe()) campId: string, @Body() dto: CreateMealLocationDto) {
    const u = reqUser(req);
    return this.settings.createMealLocation(u.tenantId, u.id, campId, dto);
  }

  @Patch('meal-locations/:id')
  updateLocation(
    @Req() req: FastifyRequest,
    @Param('campId', new ParseUUIDPipe()) campId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateMealLocationDto,
  ) {
    const u = reqUser(req);
    return this.settings.updateMealLocation(u.tenantId, u.id, campId, id, dto);
  }
}
