import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { reqUser } from '../../camp/common/camp-request';
import { CoreFeedbackService } from './core-feedback.service';
import { CreateFeedbackDto, QueryFeedbackDto, SetFeedbackStatusDto, UpdateFeedbackDto } from './core-feedback.dto';

const uuid = () => new ParseUUIDPipe();
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Санал хүсэлт — /api/v1/core/feedback (v0.2.3 Блок F, FB-SYS-01a) */
@Controller('core/feedback')
export class CoreFeedbackController {
  constructor(private readonly feedback: CoreFeedbackService) {}

  @Get()
  list(@Req() req: FastifyRequest, @Query() q: QueryFeedbackDto) {
    const u = reqUser(req);
    return this.feedback.list(u.tenantId, u.id, q);
  }

  /** Админ: Excel (route `:id`-ээс өмнө) */
  @Get('export')
  async export(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const u = reqUser(req);
    const file = await this.feedback.exportXlsx(u.tenantId, u.id);
    reply.header('Content-Type', XLSX).header('Content-Disposition', 'attachment; filename="feedback.xlsx"');
    return file;
  }

  @Post()
  @HttpCode(201)
  create(@Req() req: FastifyRequest, @Body() dto: CreateFeedbackDto) {
    const u = reqUser(req);
    return this.feedback.create(u.tenantId, u.id, dto);
  }

  @Patch(':id')
  update(@Req() req: FastifyRequest, @Param('id', uuid()) id: string, @Body() dto: UpdateFeedbackDto) {
    const u = reqUser(req);
    return this.feedback.update(u.tenantId, u.id, id, dto);
  }

  @Patch(':id/status')
  setStatus(@Req() req: FastifyRequest, @Param('id', uuid()) id: string, @Body() dto: SetFeedbackStatusDto) {
    const u = reqUser(req);
    return this.feedback.setStatus(u.tenantId, u.id, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: FastifyRequest, @Param('id', uuid()) id: string) {
    const u = reqUser(req);
    return this.feedback.remove(u.tenantId, u.id, id);
  }

  @Post(':id/vote')
  @HttpCode(200)
  vote(@Req() req: FastifyRequest, @Param('id', uuid()) id: string) {
    const u = reqUser(req);
    return this.feedback.vote(u.tenantId, u.id, id, true);
  }

  @Delete(':id/vote')
  unvote(@Req() req: FastifyRequest, @Param('id', uuid()) id: string) {
    const u = reqUser(req);
    return this.feedback.vote(u.tenantId, u.id, id, false);
  }
}
