import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Put, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { reqUser } from '../../camp/common/camp-request';
import { ExchangeRatesService } from './exchange-rates.service';
import { QueryExchangeRatesDto, UpsertExchangeRateDto } from './exchange-rates.dto';

/** v0.2.3 Блок 6б (V2-07) — ханш (tenant түвшин): /api/v1/core/exchange-rates */
@Controller('core/exchange-rates')
export class ExchangeRatesController {
  constructor(private readonly rates: ExchangeRatesService) {}

  @Get()
  list(@Req() req: FastifyRequest, @Query() q: QueryExchangeRatesDto) {
    const u = reqUser(req);
    return this.rates.list(u.tenantId, u.id, q);
  }

  @Put()
  upsert(@Req() req: FastifyRequest, @Body() dto: UpsertExchangeRateDto) {
    const u = reqUser(req);
    return this.rates.upsert(u.tenantId, u.id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Req() req: FastifyRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    const u = reqUser(req);
    await this.rates.remove(u.tenantId, u.id, id);
  }
}
