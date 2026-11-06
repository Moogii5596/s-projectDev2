import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { reqUser } from '../camp/common/camp-request';
import { SkipAuth } from '../../common/decorators/skip-auth.decorator';
import { badRequest, notFound } from '../../common/i18n/app-error';
import { readImageUpload } from '../../storage/image-upload';
import { FEED_MAX_IMAGES, POST_BODY_MAX } from './feed-rules';
import { FeedService } from './feed.service';
import { FeedReportsService } from './feed-reports.service';
import {
  CommentBodyDto,
  CommentListQueryDto,
  CreateReportDto,
  FeedListQueryDto,
  MediaQueryDto,
  ReportListQueryDto,
  ResolveReportDto,
  UpdatePostDto,
} from './feed.dto';

const uuid = () => new ParseUUIDPipe();

/** Нэг жил, хувийн (proxy/CDN кэшлэхгүй) — URL-д агуулгын hash (`v`) тул immutable */
const IMAGE_CACHE = 'private, max-age=31536000, immutable';

/**
 * Feed v0 — /api/v1/core/feed (v0.2.3 Блок 5, FEED-01).
 * Тогтмол замууд (`media`, `reports`, `comments`) `:id`-аас өмнө.
 */
@Controller('core/feed')
export class FeedController {
  constructor(
    private readonly feed: FeedService,
    private readonly reports: FeedReportsService,
  ) {}

  // ── Зураг: гарын үсэгтэй URL (img src нь Bearer илгээж чадахгүй) ──
  @SkipAuth()
  @Get('media/:mediaId/:w')
  async media(
    @Param('mediaId', uuid()) mediaId: string,
    @Param('w', ParseIntPipe) w: number,
    @Query() q: MediaQueryDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile | undefined> {
    const v = await this.feed.mediaVariant(mediaId, w, q);
    const etag = `"${v.hash}"`;
    reply.header('Cache-Control', IMAGE_CACHE).header('ETag', etag).header('X-Content-Type-Options', 'nosniff');
    if (req.headers['if-none-match'] === etag) {
      reply.status(304);
      return undefined;
    }
    const obj = await this.feed.open(v.key);
    if (!obj) throw notFound('feed.err.media_not_found');
    return new StreamableFile(obj.stream, { type: obj.contentType, length: obj.size });
  }

  // ── Report (модератор) ──
  @Post('reports')
  @HttpCode(201)
  report(@Req() req: FastifyRequest, @Body() dto: CreateReportDto) {
    const u = reqUser(req);
    return this.reports.create(u.tenantId, u.id, dto);
  }

  @Get('reports')
  listReports(@Req() req: FastifyRequest, @Query() q: ReportListQueryDto) {
    const u = reqUser(req);
    return this.reports.list(u.tenantId, u.id, q);
  }

  @Patch('reports/:id')
  resolveReport(@Req() req: FastifyRequest, @Param('id', uuid()) id: string, @Body() dto: ResolveReportDto) {
    const u = reqUser(req);
    return this.reports.resolve(u.tenantId, u.id, id, dto);
  }

  // ── Сэтгэгдэл (id-аар) ──
  @Patch('comments/:id')
  updateComment(@Req() req: FastifyRequest, @Param('id', uuid()) id: string, @Body() dto: CommentBodyDto) {
    const u = reqUser(req);
    return this.feed.updateComment(u.tenantId, u.id, id, dto.body);
  }

  @Delete('comments/:id')
  @HttpCode(204)
  async removeComment(@Req() req: FastifyRequest, @Param('id', uuid()) id: string): Promise<void> {
    const u = reqUser(req);
    await this.feed.removeComment(u.tenantId, u.id, id);
  }

  @Get('comments/:id/revisions')
  commentRevisions(@Req() req: FastifyRequest, @Param('id', uuid()) id: string) {
    const u = reqUser(req);
    return this.feed.revisions(u.tenantId, u.id, 'comment', id);
  }

  // ── Пост ──
  @Get()
  list(@Req() req: FastifyRequest, @Query() q: FeedListQueryDto) {
    const u = reqUser(req);
    return this.feed.list(u.tenantId, u.id, q);
  }

  /** JSON `{ body }` эсвэл multipart (`body` талбар + `images` ≤6 файл, тус бүр ≤15 MB) */
  @Post()
  @HttpCode(201)
  async create(@Req() req: FastifyRequest) {
    // @Body() ✖ — multipart үед body байхгүй; JSON-ийг гараар шалгана (POST_BODY_MAX)
    const u = reqUser(req);
    const upload = await readImageUpload(req, FEED_MAX_IMAGES);
    const raw = upload ? upload.fields['body'] : (req.body as { body?: unknown } | undefined)?.body;
    if (raw !== undefined && (typeof raw !== 'string' || raw.length > POST_BODY_MAX)) {
      throw badRequest('feed.err.body', { max: POST_BODY_MAX });
    }
    return this.feed.create(u.tenantId, u.id, raw ?? '', upload?.files ?? []);
  }

  @Get(':id')
  get(@Req() req: FastifyRequest, @Param('id', uuid()) id: string) {
    const u = reqUser(req);
    return this.feed.get(u.tenantId, u.id, id);
  }

  @Patch(':id')
  update(@Req() req: FastifyRequest, @Param('id', uuid()) id: string, @Body() dto: UpdatePostDto) {
    const u = reqUser(req);
    return this.feed.update(u.tenantId, u.id, id, dto.body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Req() req: FastifyRequest, @Param('id', uuid()) id: string): Promise<void> {
    const u = reqUser(req);
    await this.feed.remove(u.tenantId, u.id, id);
  }

  @Get(':id/revisions')
  revisions(@Req() req: FastifyRequest, @Param('id', uuid()) id: string) {
    const u = reqUser(req);
    return this.feed.revisions(u.tenantId, u.id, 'post', id);
  }

  @Post(':id/like')
  @HttpCode(200)
  like(@Req() req: FastifyRequest, @Param('id', uuid()) id: string) {
    const u = reqUser(req);
    return this.feed.like(u.tenantId, u.id, id, true);
  }

  @Delete(':id/like')
  unlike(@Req() req: FastifyRequest, @Param('id', uuid()) id: string) {
    const u = reqUser(req);
    return this.feed.like(u.tenantId, u.id, id, false);
  }

  @Get(':id/comments')
  comments(@Req() req: FastifyRequest, @Param('id', uuid()) id: string, @Query() q: CommentListQueryDto) {
    const u = reqUser(req);
    return this.feed.listComments(u.tenantId, u.id, id, q);
  }

  @Post(':id/comments')
  @HttpCode(201)
  addComment(@Req() req: FastifyRequest, @Param('id', uuid()) id: string, @Body() dto: CommentBodyDto) {
    const u = reqUser(req);
    return this.feed.addComment(u.tenantId, u.id, id, dto.body);
  }
}
