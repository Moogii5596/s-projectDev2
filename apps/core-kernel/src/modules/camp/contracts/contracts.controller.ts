import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { reqUser } from '../common/camp-request';
import { ContractCatalogService } from './contract-catalog.service';
import { ContractPricingService } from './contract-pricing.service';
import { ContractsService } from './contracts.service';
import {
  AddAmendmentDto,
  AddContractPriceDto,
  CreateContractDto,
  CreateContractItemDto,
  CreateServiceTypeDto,
  CreateUnitDto,
  QueryContractsDto,
  QuoteDto,
  TerminateContractDto,
  UpdateContractDto,
  UpdateContractItemDto,
  UpdateServiceTypeDto,
  UpdateUnitDto,
} from './contracts.dto';

const uuid = () => new ParseUUIDPipe();

/** v0.2.3 Блок 6б — гэрээний каталог (tenant): /api/v1/camp/contract-catalog */
@Controller('camp/contract-catalog')
export class ContractCatalogController {
  constructor(private readonly catalog: ContractCatalogService) {}

  @Get()
  get(@Req() req: FastifyRequest) {
    const u = reqUser(req);
    return this.catalog.catalog(u.tenantId, u.id);
  }

  @Post('units')
  @HttpCode(201)
  createUnit(@Req() req: FastifyRequest, @Body() dto: CreateUnitDto) {
    const u = reqUser(req);
    return this.catalog.createUnit(u.tenantId, u.id, dto);
  }

  @Patch('units/:id')
  updateUnit(@Req() req: FastifyRequest, @Param('id', uuid()) id: string, @Body() dto: UpdateUnitDto) {
    const u = reqUser(req);
    return this.catalog.updateUnit(u.tenantId, u.id, id, dto);
  }

  @Post('service-types')
  @HttpCode(201)
  createServiceType(@Req() req: FastifyRequest, @Body() dto: CreateServiceTypeDto) {
    const u = reqUser(req);
    return this.catalog.createServiceType(u.tenantId, u.id, dto);
  }

  @Patch('service-types/:id')
  updateServiceType(@Req() req: FastifyRequest, @Param('id', uuid()) id: string, @Body() dto: UpdateServiceTypeDto) {
    const u = reqUser(req);
    return this.catalog.updateServiceType(u.tenantId, u.id, id, dto);
  }
}

/** v0.2.3 Блок 6б (V2-01, G-5) — /api/v1/camp/camps/:campId/contracts/… */
@Controller('camp/camps/:campId/contracts')
export class ContractsController {
  constructor(
    private readonly contracts: ContractsService,
    private readonly pricing: ContractPricingService,
  ) {}

  @Get()
  list(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Query() q: QueryContractsDto) {
    const u = reqUser(req);
    return this.contracts.list(u.tenantId, u.id, campId, q);
  }

  @Post()
  @HttpCode(201)
  create(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Body() dto: CreateContractDto) {
    const u = reqUser(req);
    return this.contracts.create(u.tenantId, u.id, campId, dto);
  }

  @Get(':id')
  get(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string) {
    const u = reqUser(req);
    return this.contracts.get(u.tenantId, u.id, campId, id);
  }

  @Patch(':id')
  update(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string, @Body() dto: UpdateContractDto) {
    const u = reqUser(req);
    return this.contracts.update(u.tenantId, u.id, campId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string) {
    const u = reqUser(req);
    await this.contracts.remove(u.tenantId, u.id, campId, id);
  }

  @Post(':id/activate')
  @HttpCode(200)
  activate(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string) {
    const u = reqUser(req);
    return this.contracts.activate(u.tenantId, u.id, campId, id);
  }

  @Post(':id/terminate')
  @HttpCode(200)
  terminate(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string, @Body() dto: TerminateContractDto) {
    const u = reqUser(req);
    return this.contracts.terminate(u.tenantId, u.id, campId, id, dto);
  }

  @Post(':id/items')
  @HttpCode(201)
  addItem(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string, @Body() dto: CreateContractItemDto) {
    const u = reqUser(req);
    return this.contracts.addItem(u.tenantId, u.id, campId, id, dto);
  }

  @Patch(':id/items/:itemId')
  updateItem(
    @Req() req: FastifyRequest,
    @Param('campId', uuid()) campId: string,
    @Param('id', uuid()) id: string,
    @Param('itemId', uuid()) itemId: string,
    @Body() dto: UpdateContractItemDto,
  ) {
    const u = reqUser(req);
    return this.contracts.updateItem(u.tenantId, u.id, campId, id, itemId, dto);
  }

  @Delete(':id/items/:itemId')
  @HttpCode(204)
  async removeItem(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string, @Param('itemId', uuid()) itemId: string) {
    const u = reqUser(req);
    await this.contracts.removeItem(u.tenantId, u.id, campId, id, itemId);
  }

  @Post(':id/items/:itemId/prices')
  @HttpCode(201)
  addPrice(
    @Req() req: FastifyRequest,
    @Param('campId', uuid()) campId: string,
    @Param('id', uuid()) id: string,
    @Param('itemId', uuid()) itemId: string,
    @Body() dto: AddContractPriceDto,
  ) {
    const u = reqUser(req);
    return this.contracts.addPrice(u.tenantId, u.id, campId, id, itemId, dto);
  }

  @Delete(':id/items/:itemId/prices/:priceId')
  @HttpCode(204)
  async removePrice(
    @Req() req: FastifyRequest,
    @Param('campId', uuid()) campId: string,
    @Param('id', uuid()) id: string,
    @Param('itemId', uuid()) itemId: string,
    @Param('priceId', uuid()) priceId: string,
  ) {
    const u = reqUser(req);
    await this.contracts.removePrice(u.tenantId, u.id, campId, id, itemId, priceId);
  }

  @Post(':id/amendments')
  @HttpCode(201)
  addAmendment(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string, @Body() dto: AddAmendmentDto) {
    const u = reqUser(req);
    return this.contracts.addAmendment(u.tenantId, u.id, campId, id, dto);
  }

  @Get(':id/quote')
  quote(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Param('id', uuid()) id: string, @Query() q: QuoteDto) {
    const u = reqUser(req);
    return this.pricing.quote(u.tenantId, u.id, campId, id, q);
  }
}
