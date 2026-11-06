import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { reqUser } from '../common/camp-request';
import { MealOrdersService } from './meal-orders.service';
import { AddMealExtraDto, MealReasonDto, PutMealTemplateDto, QueryMealOrdersDto, RequestMealChangeDto, UpsertMealOrderDto } from './meal-orders.dto';

/** V2-03 (Блок 6а) — /api/v1/camp/camps/:campId/meal-orders/:date/… Урсгалын дүрэм = camp_settings.meal_order_* */
@Controller('camp/camps/:campId')
export class MealOrdersController {
  constructor(private readonly orders: MealOrdersService) {}

  @Get('meal-orders')
  list(@Req() req: FastifyRequest, @Param('campId', new ParseUUIDPipe()) campId: string, @Query() q: QueryMealOrdersDto) {
    const u = reqUser(req);
    return this.orders.list(u.tenantId, u.id, campId, q);
  }

  @Get('meal-orders/:date')
  get(@Req() req: FastifyRequest, @Param('campId', new ParseUUIDPipe()) campId: string, @Param('date') date: string) {
    const u = reqUser(req);
    return this.orders.get(u.tenantId, u.id, campId, date);
  }

  @Put('meal-orders/:date')
  upsert(@Req() req: FastifyRequest, @Param('campId', new ParseUUIDPipe()) campId: string, @Param('date') date: string, @Body() dto: UpsertMealOrderDto) {
    const u = reqUser(req);
    return this.orders.upsert(u.tenantId, u.id, campId, date, dto);
  }

  @Delete('meal-orders/:date')
  @HttpCode(204)
  async remove(@Req() req: FastifyRequest, @Param('campId', new ParseUUIDPipe()) campId: string, @Param('date') date: string) {
    const u = reqUser(req);
    await this.orders.remove(u.tenantId, u.id, campId, date);
  }

  @Post('meal-orders/:date/extras')
  @HttpCode(201)
  addExtra(@Req() req: FastifyRequest, @Param('campId', new ParseUUIDPipe()) campId: string, @Param('date') date: string, @Body() dto: AddMealExtraDto) {
    const u = reqUser(req);
    return this.orders.addExtra(u.tenantId, u.id, campId, date, dto);
  }

  @Delete('meal-orders/:date/extras/:extraId')
  removeExtra(
    @Req() req: FastifyRequest,
    @Param('campId', new ParseUUIDPipe()) campId: string,
    @Param('date') date: string,
    @Param('extraId', new ParseUUIDPipe()) extraId: string,
  ) {
    const u = reqUser(req);
    return this.orders.removeExtra(u.tenantId, u.id, campId, date, extraId);
  }

  @Post('meal-orders/:date/submit')
  @HttpCode(200)
  submit(@Req() req: FastifyRequest, @Param('campId', new ParseUUIDPipe()) campId: string, @Param('date') date: string) {
    const u = reqUser(req);
    return this.orders.submit(u.tenantId, u.id, campId, date);
  }

  @Post('meal-orders/:date/accept')
  @HttpCode(200)
  accept(@Req() req: FastifyRequest, @Param('campId', new ParseUUIDPipe()) campId: string, @Param('date') date: string) {
    const u = reqUser(req);
    return this.orders.accept(u.tenantId, u.id, campId, date);
  }

  @Post('meal-orders/:date/reject')
  @HttpCode(200)
  reject(@Req() req: FastifyRequest, @Param('campId', new ParseUUIDPipe()) campId: string, @Param('date') date: string, @Body() dto: MealReasonDto) {
    const u = reqUser(req);
    return this.orders.reject(u.tenantId, u.id, campId, date, dto);
  }

  @Post('meal-orders/:date/request-change')
  @HttpCode(200)
  requestChange(@Req() req: FastifyRequest, @Param('campId', new ParseUUIDPipe()) campId: string, @Param('date') date: string, @Body() dto: RequestMealChangeDto) {
    const u = reqUser(req);
    return this.orders.requestChange(u.tenantId, u.id, campId, date, dto);
  }

  @Post('meal-orders/:date/withdraw-change')
  @HttpCode(200)
  withdrawChange(@Req() req: FastifyRequest, @Param('campId', new ParseUUIDPipe()) campId: string, @Param('date') date: string) {
    const u = reqUser(req);
    return this.orders.withdrawChange(u.tenantId, u.id, campId, date);
  }

  @Post('meal-orders/:date/approve-change')
  @HttpCode(200)
  approveChange(@Req() req: FastifyRequest, @Param('campId', new ParseUUIDPipe()) campId: string, @Param('date') date: string) {
    const u = reqUser(req);
    return this.orders.approveChange(u.tenantId, u.id, campId, date);
  }

  @Post('meal-orders/:date/reject-change')
  @HttpCode(200)
  rejectChange(@Req() req: FastifyRequest, @Param('campId', new ParseUUIDPipe()) campId: string, @Param('date') date: string, @Body() dto: MealReasonDto) {
    const u = reqUser(req);
    return this.orders.rejectChange(u.tenantId, u.id, campId, date, dto);
  }

  /** Тогтмол загвар (meal_order_default_fill = TEMPLATE) */
  @Get('meal-order-template')
  getTemplate(@Req() req: FastifyRequest, @Param('campId', new ParseUUIDPipe()) campId: string) {
    const u = reqUser(req);
    return this.orders.getTemplate(u.tenantId, u.id, campId);
  }

  @Put('meal-order-template')
  putTemplate(@Req() req: FastifyRequest, @Param('campId', new ParseUUIDPipe()) campId: string, @Body() dto: PutMealTemplateDto) {
    const u = reqUser(req);
    return this.orders.putTemplate(u.tenantId, u.id, campId, dto);
  }
}
