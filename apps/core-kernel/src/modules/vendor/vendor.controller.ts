import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { RequestUser } from '@s-project/shared-types';
import { VendorService } from './vendor.service';
import { CreateVendorDto, QueryVendorDto, UpdateVendorDto } from './vendor.dto';

/** Phase 4.3 — /api/v1/vendors */
@Controller('vendors')
export class VendorController {
  constructor(private readonly vendors: VendorService) {}

  private user(req: FastifyRequest): RequestUser {
    return (req as unknown as { user: RequestUser }).user;
  }

  @Get()
  list(@Req() req: FastifyRequest, @Query() query: QueryVendorDto) {
    return this.vendors.list(this.user(req).tenantId, query);
  }

  @Post()
  @HttpCode(201)
  create(@Req() req: FastifyRequest, @Body() dto: CreateVendorDto) {
    const u = this.user(req);
    return this.vendors.create(u.tenantId, u.id, dto);
  }

  @Patch(':id')
  update(@Req() req: FastifyRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateVendorDto) {
    const u = this.user(req);
    return this.vendors.update(u.tenantId, u.id, id, dto);
  }
}
