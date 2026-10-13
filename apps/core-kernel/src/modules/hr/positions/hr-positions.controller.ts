import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { reqUser } from '../../camp/common/camp-request';
import { HrPositionsService } from './hr-positions.service';
import { CreateCatalogItemDto, QueryCatalogDto, UpdateCatalogItemDto } from '../../camp/common/common.dto';

const uuid = () => new ParseUUIDPipe();

/** HR — албан тушаалын каталог (байгууллагын түвшин): /api/v1/hr/positions (v0.2.1 C-01; өмнө нь /camp/positions) */
@Controller('hr/positions')
export class HrPositionsController {
  constructor(private readonly positions: HrPositionsService) {}

  @Get()
  list(@Req() req: FastifyRequest, @Query() q: QueryCatalogDto) {
    const u = reqUser(req);
    return this.positions.list(u.tenantId, u.id, q);
  }

  @Post()
  @HttpCode(201)
  create(@Req() req: FastifyRequest, @Body() dto: CreateCatalogItemDto) {
    const u = reqUser(req);
    return this.positions.create(u.tenantId, u.id, dto);
  }

  @Patch(':id')
  update(@Req() req: FastifyRequest, @Param('id', uuid()) id: string, @Body() dto: UpdateCatalogItemDto) {
    const u = reqUser(req);
    return this.positions.update(u.tenantId, u.id, id, dto);
  }
}
