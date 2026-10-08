import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { RequestUser } from '@s-project/shared-types';
import { InventoryService } from './inventory.service';
import { AdjustInventoryDto, CreateInventoryItemDto, QueryInventoryDto } from './inventory.dto';

/** Phase 4.2 — /api/v1/inventory (RULE-07: guard/interceptor global) */
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  private user(req: FastifyRequest): RequestUser {
    return (req as unknown as { user: RequestUser }).user;
  }

  @Get('items')
  list(@Req() req: FastifyRequest, @Query() query: QueryInventoryDto) {
    return this.inventory.list(this.user(req).tenantId, query);
  }

  @Post('items')
  @HttpCode(201)
  create(@Req() req: FastifyRequest, @Body() dto: CreateInventoryItemDto) {
    const u = this.user(req);
    return this.inventory.create(u.tenantId, u.id, dto);
  }

  @Patch('items/:id/adjust')
  adjust(@Req() req: FastifyRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: AdjustInventoryDto) {
    const u = this.user(req);
    return this.inventory.adjust(u.tenantId, u.id, id, dto);
  }
}
