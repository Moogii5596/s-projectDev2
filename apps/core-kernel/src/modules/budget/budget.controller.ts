import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { RequestUser } from '@s-project/shared-types';
import { BudgetService } from './budget.service';
import {
  CheckBudgetDto,
  CreateBudgetAllocationDto,
  CreateBudgetPeriodDto,
  QueryBudgetAllocationsDto,
  QueryBudgetPeriodsDto,
  UpdateBudgetAllocationDto,
} from './dto/budget.dto';

/**
 * Phase 4.1 — /api/v1/budget
 * RULE-07: TenantAuthGuard + TenantContextInterceptor нь APP_GUARD/APP_INTERCEPTOR — энд decorator хэрэггүй.
 * Бичих үйлдэл: OWNER / ADMIN (BudgetService.requireRole).
 */
@Controller('budget')
export class BudgetController {
  constructor(private readonly budget: BudgetService) {}

  private user(req: FastifyRequest): RequestUser {
    return (req as unknown as { user: RequestUser }).user;
  }

  @Get('periods')
  listPeriods(@Req() req: FastifyRequest, @Query() query: QueryBudgetPeriodsDto) {
    return this.budget.listPeriods(this.user(req).tenantId, query);
  }

  @Post('periods')
  @HttpCode(201)
  createPeriod(@Req() req: FastifyRequest, @Body() dto: CreateBudgetPeriodDto) {
    const u = this.user(req);
    return this.budget.createPeriod(u.tenantId, u.id, dto);
  }

  @Get('allocations')
  listAllocations(@Req() req: FastifyRequest, @Query() query: QueryBudgetAllocationsDto) {
    return this.budget.listAllocations(this.user(req).tenantId, query);
  }

  @Post('allocations')
  @HttpCode(201)
  createAllocation(@Req() req: FastifyRequest, @Body() dto: CreateBudgetAllocationDto) {
    const u = this.user(req);
    return this.budget.createAllocation(u.tenantId, u.id, dto);
  }

  @Patch('allocations/:id')
  updateAllocation(
    @Req() req: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateBudgetAllocationDto,
  ) {
    const u = this.user(req);
    return this.budget.updateAllocation(u.tenantId, u.id, id, dto);
  }

  @Post('check')
  @HttpCode(200)
  check(@Req() req: FastifyRequest, @Body() dto: CheckBudgetDto) {
    return this.budget.check(this.user(req).tenantId, dto);
  }
}
