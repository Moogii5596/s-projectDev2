import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { reqUser } from '../common/camp-request';
import { CampAssetsService } from './camp-assets.service';
import {
  CreateAssetCategoryDto,
  CreateAssetDto,
  MoveAssetDto,
  QueryAssetsDto,
  QueryCategoriesDto,
  UpdateAssetCategoryDto,
  UpdateAssetDto,
  WriteOffAssetDto,
} from './camp-assets.dto';

const uuid = () => new ParseUUIDPipe();

/** Шат 4.3 — /api/v1/camp/asset-categories (tenant түвшин) */
@Controller('camp/asset-categories')
export class CampAssetCategoriesController {
  constructor(private readonly assets: CampAssetsService) {}

  @Get()
  list(@Req() req: FastifyRequest, @Query() q: QueryCategoriesDto) {
    const u = reqUser(req);
    return this.assets.listCategories(u.tenantId, u.id, q);
  }

  @Post()
  @HttpCode(201)
  create(@Req() req: FastifyRequest, @Body() dto: CreateAssetCategoryDto) {
    const u = reqUser(req);
    return this.assets.createCategory(u.tenantId, u.id, dto);
  }

  @Patch(':id')
  update(@Req() req: FastifyRequest, @Param('id', uuid()) id: string, @Body() dto: UpdateAssetCategoryDto) {
    const u = reqUser(req);
    return this.assets.updateCategory(u.tenantId, u.id, id, dto);
  }
}

/** Шат 4.3 — /api/v1/camp/camps/:campId/assets */
@Controller('camp/camps/:campId/assets')
export class CampAssetsController {
  constructor(private readonly assets: CampAssetsService) {}

  @Get()
  list(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Query() q: QueryAssetsDto) {
    const u = reqUser(req);
    return this.assets.list(u.tenantId, u.id, campId, q);
  }

  @Post()
  @HttpCode(201)
  create(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Body() dto: CreateAssetDto) {
    const u = reqUser(req);
    return this.assets.create(u.tenantId, u.id, campId, dto);
  }

  @Get(':id')
  get(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string) {
    const u = reqUser(req);
    return this.assets.get(u.tenantId, u.id, campId, id);
  }

  @Patch(':id')
  update(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string, @Body() dto: UpdateAssetDto) {
    const u = reqUser(req);
    return this.assets.update(u.tenantId, u.id, campId, id, dto);
  }

  @Post(':id/move')
  @HttpCode(200)
  move(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string, @Body() dto: MoveAssetDto) {
    const u = reqUser(req);
    return this.assets.move(u.tenantId, u.id, campId, id, dto);
  }

  @Post(':id/write-off')
  @HttpCode(200)
  writeOff(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string, @Body() dto: WriteOffAssetDto) {
    const u = reqUser(req);
    return this.assets.writeOff(u.tenantId, u.id, campId, id, dto);
  }

  @Get(':id/movements')
  movements(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string) {
    const u = reqUser(req);
    return this.assets.movements(u.tenantId, u.id, campId, id);
  }
}
