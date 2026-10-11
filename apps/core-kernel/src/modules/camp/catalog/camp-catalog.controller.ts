import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { reqUser } from '../common/camp-request';
import { CampCatalogService } from './camp-catalog.service';
import { CreateCatalogItemDto, QueryCatalogDto, UpdateCatalogItemDto, UpsertPositionSettingDto } from './camp-catalog.dto';

const uuid = () => new ParseUUIDPipe();

/** v0.2.1 (C-01) — /api/v1/camp/positions (байгууллагын каталог) */
@Controller('camp/positions')
export class CampPositionsController {
  constructor(private readonly catalog: CampCatalogService) {}

  @Get()
  list(@Req() req: FastifyRequest, @Query() q: QueryCatalogDto) {
    const u = reqUser(req);
    return this.catalog.list(u.tenantId, u.id, 'position', q);
  }

  @Post()
  @HttpCode(201)
  create(@Req() req: FastifyRequest, @Body() dto: CreateCatalogItemDto) {
    const u = reqUser(req);
    return this.catalog.create(u.tenantId, u.id, 'position', dto);
  }

  @Patch(':id')
  update(@Req() req: FastifyRequest, @Param('id', uuid()) id: string, @Body() dto: UpdateCatalogItemDto) {
    const u = reqUser(req);
    return this.catalog.update(u.tenantId, u.id, 'position', id, dto);
  }
}

/** v0.2.1 (C-12) — /api/v1/camp/building-types (байгууллагын каталог) */
@Controller('camp/building-types')
export class CampBuildingTypesController {
  constructor(private readonly catalog: CampCatalogService) {}

  @Get()
  list(@Req() req: FastifyRequest, @Query() q: QueryCatalogDto) {
    const u = reqUser(req);
    return this.catalog.list(u.tenantId, u.id, 'buildingType', q);
  }

  @Post()
  @HttpCode(201)
  create(@Req() req: FastifyRequest, @Body() dto: CreateCatalogItemDto) {
    const u = reqUser(req);
    return this.catalog.create(u.tenantId, u.id, 'buildingType', dto);
  }

  @Patch(':id')
  update(@Req() req: FastifyRequest, @Param('id', uuid()) id: string, @Body() dto: UpdateCatalogItemDto) {
    const u = reqUser(req);
    return this.catalog.update(u.tenantId, u.id, 'buildingType', id, dto);
  }
}

/** v0.2.1 (Q1, Д-1, Д-2) — /api/v1/camp/camps/:campId/position-settings — кемп × албан тушаалын анхдагч */
@Controller('camp/camps/:campId/position-settings')
export class CampPositionSettingsController {
  constructor(private readonly catalog: CampCatalogService) {}

  @Get()
  list(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string) {
    const u = reqUser(req);
    return this.catalog.listSettings(u.tenantId, u.id, campId);
  }

  @Put(':positionId')
  upsert(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('positionId', uuid()) positionId: string, @Body() dto: UpsertPositionSettingDto) {
    const u = reqUser(req);
    return this.catalog.upsertSetting(u.tenantId, u.id, campId, positionId, dto);
  }
}
