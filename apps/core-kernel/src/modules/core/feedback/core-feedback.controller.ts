import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query, Req, Res, StreamableFile } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { reqUser } from '../../camp/common/camp-request';
import { CoreFeedbackService } from './core-feedback.service';
import { CreateFeedbackDto, QueryFeedbackDto, SetFeedbackStatusDto, UpdateFeedbackDto } from './core-feedback.dto';
import { CoreFeedbackAttachmentsService, FEEDBACK_MAX_IMAGES } from './core-feedback-attachments.service';
import { SkipAuth } from '../../../common/decorators/skip-auth.decorator';
import { badRequest, notFound } from '../../../common/i18n/app-error';
import { readImageUpload } from '../../../storage/image-upload';
import { MediaQueryDto } from '../../feed/feed.dto';

const uuid = () => new ParseUUIDPipe();
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Санал хүсэлт — /api/v1/core/feedback (v0.2.3 Блок F, FB-SYS-01a) */
@Controller('core/feedback')
export class CoreFeedbackController {
  constructor(
    private readonly feedback: CoreFeedbackService,
    private readonly attachments: CoreFeedbackAttachmentsService,
  ) {}

  // ── v0.2.3 Блок 5 (5.7) — дэлгэцийн зураг (`:id`-аас өмнө) ──
  /** Гарын үсэгтэй URL (img src нь Bearer илгээж чадахгүй) */
  @SkipAuth()
  @Get('attachments/:attId/:w')
  async attachment(
    @Param('attId', uuid()) attId: string,
    @Param('w', ParseIntPipe) w: number,
    @Query() q: MediaQueryDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile | undefined> {
    const v = await this.attachments.variant(attId, w, q);
    const etag = `"${v.hash}"`;
    reply.header('Cache-Control', 'private, max-age=31536000, immutable').header('ETag', etag).header('X-Content-Type-Options', 'nosniff');
    if (req.headers['if-none-match'] === etag) {
      reply.status(304);
      return undefined;
    }
    const obj = await this.attachments.open(v.key);
    if (!obj) throw notFound('core.err.feedback.attach_not_found');
    return new StreamableFile(obj.stream, { type: obj.contentType, length: obj.size });
  }

  @Delete('attachments/:attId')
  @HttpCode(204)
  async removeAttachment(@Req() req: FastifyRequest, @Param('attId', uuid()) attId: string): Promise<void> {
    const u = reqUser(req);
    await this.attachments.remove(u.tenantId, u.id, attId);
  }

  /** multipart `images` (нийт ≤3) */
  @Post(':id/attachments')
  @HttpCode(201)
  async addAttachments(@Req() req: FastifyRequest, @Param('id', uuid()) id: string) {
    const u = reqUser(req);
    const upload = await readImageUpload(req, FEEDBACK_MAX_IMAGES);
    if (!upload) throw badRequest('feed.err.upload');
    return this.attachments.add(u.tenantId, u.id, id, upload.files);
  }

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

  /** v0.2.4 FEED-05: Feed-ийн постоос санал хүсэлт */
  @Post('from-post/:postId')
  @HttpCode(201)
  createFromPost(@Req() req: FastifyRequest, @Param('postId', new ParseUUIDPipe()) postId: string, @Body() dto: CreateFeedbackDto) {
    const u = reqUser(req);
    return this.feedback.create(u.tenantId, u.id, dto, postId);
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
