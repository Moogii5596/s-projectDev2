import { Inject, Injectable } from '@nestjs/common';
import { FeedReactionKind, FeedReportStatus, Prisma } from '@prisma/client';
import { PrismaTenantClientService } from '../../db/prisma-tenant-client.service';
import { CampAccessService } from '../camp/common/camp-access.service';
import { inTenantTx, type Tx } from '../camp/common/camp-tx';
import { withCampErrors } from '../camp/common/camp-errors';
import { PERMISSIONS } from '../core/permissions/permission-registry';
import { displayAuthor } from '../core/feedback/feedback-rules';
import { badRequest, forbidden, notFound } from '../../common/i18n/app-error';
import { MediaService, mediaImageDto, parseVariants, pickVariant, type MediaVariantRef } from '../../storage/media.service';
import { MEDIA_URL_SIGNER, MediaUrlSigner } from '../../storage/media-url';
import {
  COMMENT_PAGE_DEFAULT,
  COMMENT_PAGE_MAX,
  FEED_MAX_IMAGES,
  FEED_PAGE_DEFAULT,
  FEED_PAGE_MAX,
  canDelete,
  canEdit,
  canView,
  clampLimit,
  isEmptyPost,
  pageOf,
  parseCursor,
  type FeedViewer,
} from './feed-rules';
import type {
  CommentListQueryDto,
  FeedAuthorDto,
  FeedCommentDto,
  FeedCommentListDto,
  FeedLikeDto,
  FeedListDto,
  FeedListQueryDto,
  FeedPostDto,
  FeedRevisionListDto,
} from './feed.dto';

export const FEED_MEDIA_BASE = '/api/v1/core/feed/media';

const AUTHOR_SELECT = { id: true, fullName: true, username: true, email: true } as const;
type AuthorRow = { id: string; fullName: string | null; username: string | null; email: string };

const postInclude = (userId: string) =>
  ({
    author: { select: AUTHOR_SELECT },
    media: { orderBy: { sortOrder: 'asc' } },
    reactions: { where: { userId, kind: FeedReactionKind.LIKE }, select: { id: true } },
    reports: { where: { reporterId: userId }, select: { id: true } },
  }) satisfies Prisma.FeedPostInclude;
type PostRow = Prisma.FeedPostGetPayload<{ include: ReturnType<typeof postInclude> }>;

const commentInclude = (userId: string) =>
  ({
    author: { select: AUTHOR_SELECT },
    reports: { where: { reporterId: userId }, select: { id: true } },
  }) satisfies Prisma.FeedCommentInclude;
type CommentRow = Prisma.FeedCommentGetPayload<{ include: ReturnType<typeof commentInclude> }>;

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
export const authorDto = (a: AuthorRow): FeedAuthorDto => ({ id: a.id, name: displayAuthor(a) });

/** Харагдах шүүлт (устгаагүй; нуусныг зөвхөн зохиогч / модератор) — пост ба сэтгэгдэлд ижил бүтэц */
function visibleWhere(v: FeedViewer) {
  return v.isModerator
    ? { deletedAt: null }
    : { deletedAt: null, OR: [{ hiddenAt: null }, { authorId: v.userId }] };
}

/**
 * v0.2.3 Блок 5 (FEED-01) — Feed v0: пост (текст + ≤6 зураг), лайк, сэтгэгдэл, засварын түүх.
 *   - Tenant даяар; идэвхтэй бүх хэрэглэгч бичнэ. Засах — зохиогч; устгах — зохиогч эсвэл `feed.content.moderate`.
 *   - Зураг: MediaService (480/1080/2048 WebP), URL — гарын үсэгтэй (MediaUrlSigner). Report → FeedReportsService.
 */
@Injectable()
export class FeedService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
    private readonly media: MediaService,
    @Inject(MEDIA_URL_SIGNER) private readonly signer: MediaUrlSigner,
  ) {}

  /** authId → core_users + модератор эсэх (OWNER/ADMIN = isTenantAdmin → автоматаар) */
  async viewer(tx: Tx, tenantId: string, authId: string): Promise<FeedViewer> {
    const a = await this.access.resolve(tx, tenantId, authId);
    return { userId: a.userId, isModerator: CampAccessService.hasInAnyCamp(a.perms, PERMISSIONS.FEED_MODERATE) };
  }

  // ── DTO ──────────────────────────────────────────────────
  private postDto(tenantId: string, r: PostRow, v: FeedViewer): FeedPostDto {
    return {
      id: r.id,
      author: authorDto(r.author),
      body: r.body,
      images: r.media.map((m) => mediaImageDto(this.signer, 'f', FEED_MEDIA_BASE, tenantId, m)),
      likeCount: r.likeCount,
      commentCount: r.commentCount,
      likedByMe: r.reactions.length > 0,
      reportedByMe: r.reports.length > 0,
      isMine: r.authorId === v.userId,
      canEdit: canEdit(r, v),
      canDelete: canDelete(r, v),
      editedAt: iso(r.editedAt),
      hidden: r.hiddenAt !== null,
      createdAt: r.createdAt.toISOString(),
    };
  }

  private commentDto(r: CommentRow, v: FeedViewer): FeedCommentDto {
    return {
      id: r.id,
      postId: r.postId,
      author: authorDto(r.author),
      body: r.body,
      reportedByMe: r.reports.length > 0,
      isMine: r.authorId === v.userId,
      canEdit: canEdit(r, v),
      canDelete: canDelete(r, v),
      editedAt: iso(r.editedAt),
      hidden: r.hiddenAt !== null,
      createdAt: r.createdAt.toISOString(),
    };
  }

  // ── Ачаалах (харагдах эрхтэй) ──────────────────────────────
  private async loadPost(tx: Tx, tenantId: string, id: string, v: FeedViewer): Promise<PostRow> {
    const r = await tx.feedPost.findFirst({ where: { tenantId, id }, include: postInclude(v.userId) });
    if (!r || !canView(r, v)) throw notFound('feed.err.not_found');
    return r;
  }

  private async loadComment(tx: Tx, tenantId: string, id: string, v: FeedViewer) {
    const c = await tx.feedComment.findFirst({
      where: { tenantId, id },
      include: { ...commentInclude(v.userId), post: { select: { authorId: true, deletedAt: true, hiddenAt: true } } },
    });
    if (!c || !canView(c, v) || !canView(c.post, v)) throw notFound('feed.err.comment_not_found');
    return c;
  }

  // ── Пост ─────────────────────────────────────────────────
  async list(tenantId: string, authId: string, q: FeedListQueryDto): Promise<FeedListDto> {
    const cursor = parseCursor(q.cursor);
    if (cursor === false) throw badRequest('feed.err.cursor');
    const limit = clampLimit(q.limit, FEED_PAGE_DEFAULT, FEED_PAGE_MAX);
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      const v = await this.viewer(tx, tenantId, authId);
      const rows = await tx.feedPost.findMany({
        where: { tenantId, ...visibleWhere(v), ...(cursor ? { id: { lt: cursor } } : {}) },
        include: postInclude(v.userId),
        orderBy: { id: 'desc' },
        take: limit + 1,
      });
      const { items, nextCursor } = pageOf(rows, limit);
      return { data: items.map((r) => this.postDto(tenantId, r, v)), nextCursor, canModerate: v.isModerator };
    });
  }

  async get(tenantId: string, authId: string, id: string): Promise<FeedPostDto> {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      const v = await this.viewer(tx, tenantId, authId);
      return this.postDto(tenantId, await this.loadPost(tx, tenantId, id, v), v);
    });
  }

  /** Зургийг tx-ээс ГАДНА боловсруулж хадгална (CPU); DB алдаа гарвал файлуудыг устгана */
  async create(tenantId: string, authId: string, body: string, images: readonly Buffer[]): Promise<FeedPostDto> {
    const text = body.trim();
    if (images.length > FEED_MAX_IMAGES) throw badRequest('feed.err.too_many_images', { max: FEED_MAX_IMAGES });
    if (isEmptyPost(text, images.length)) throw badRequest('feed.err.empty');
    // Эрх (идэвхтэй хэрэглэгч) — зураг боловсруулахаас өмнө
    await inTenantTx(this.prisma, tenantId, (tx) => this.viewer(tx, tenantId, authId));
    const stored = await this.media.storeMany(tenantId, 'feed', images);
    try {
      return await withCampErrors(() =>
        inTenantTx(this.prisma, tenantId, async (tx) => {
          const v = await this.viewer(tx, tenantId, authId);
          const post = await tx.feedPost.create({
            data: { tenantId, authorId: v.userId, body: text, mediaCount: stored.length },
            select: { id: true },
          });
          if (stored.length > 0) {
            await tx.feedPostMedia.createMany({
              data: stored.map((m, i) => ({
                tenantId,
                postId: post.id,
                sortOrder: i,
                width: m.width,
                height: m.height,
                thumbhash: m.thumbhash,
                variants: m.variants as unknown as Prisma.InputJsonValue,
                totalBytes: m.totalBytes,
              })),
            });
          }
          return this.postDto(tenantId, await this.loadPost(tx, tenantId, post.id, v), v);
        }),
      );
    } catch (err) {
      await this.media.remove(stored.flatMap((m) => m.variants));
      throw err;
    }
  }

  /** Зөвхөн текст; өмнөх текст → feed_revisions */
  async update(tenantId: string, authId: string, id: string, body: string): Promise<FeedPostDto> {
    const text = body.trim();
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const v = await this.viewer(tx, tenantId, authId);
        const cur = await this.loadPost(tx, tenantId, id, v);
        if (!canEdit(cur, v)) throw forbidden('feed.err.edit_own');
        if (text === cur.body) return this.postDto(tenantId, cur, v);
        if (isEmptyPost(text, cur.mediaCount)) throw badRequest('feed.err.empty');
        await tx.feedRevision.create({ data: { tenantId, postId: cur.id, body: cur.body, editedBy: v.userId } });
        await tx.feedPost.update({ where: { id: cur.id }, data: { body: text, editedAt: new Date() } });
        return this.postDto(tenantId, await this.loadPost(tx, tenantId, id, v), v);
      }),
    );
  }

  /** Soft delete (зохиогч / модератор); нээлттэй report → REMOVED; зургийн файлыг commit-ийн дараа устгана */
  async remove(tenantId: string, authId: string, id: string): Promise<void> {
    const variants = await inTenantTx(this.prisma, tenantId, async (tx) => {
      const v = await this.viewer(tx, tenantId, authId);
      const cur = await this.loadPost(tx, tenantId, id, v);
      if (!canDelete(cur, v)) throw forbidden('error.forbidden');
      const now = new Date();
      await tx.feedPost.update({ where: { id: cur.id }, data: { deletedAt: now, deletedBy: v.userId, reportCount: 0 } });
      await tx.feedReport.updateMany({
        where: { tenantId, postId: cur.id, status: FeedReportStatus.OPEN },
        data: { status: FeedReportStatus.REMOVED, resolvedBy: v.userId, resolvedAt: now },
      });
      return cur.media.flatMap((m) => parseVariants(m.variants));
    });
    await this.media.remove(variants);
  }

  // ── Лайк ─────────────────────────────────────────────────
  async like(tenantId: string, authId: string, id: string, on: boolean): Promise<FeedLikeDto> {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      const v = await this.viewer(tx, tenantId, authId);
      await this.loadPost(tx, tenantId, id, v);
      const kind = FeedReactionKind.LIKE;
      const n = on
        ? (await tx.feedReaction.createMany({ data: [{ tenantId, postId: id, userId: v.userId, kind }], skipDuplicates: true })).count
        : -(await tx.feedReaction.deleteMany({ where: { tenantId, postId: id, userId: v.userId, kind } })).count;
      const p =
        n === 0
          ? await tx.feedPost.findFirstOrThrow({ where: { id }, select: { likeCount: true } })
          : await tx.feedPost.update({ where: { id }, data: { likeCount: { increment: n } }, select: { likeCount: true } });
      return { liked: on, likeCount: p.likeCount };
    });
  }

  // ── Сэтгэгдэл ────────────────────────────────────────────
  async listComments(tenantId: string, authId: string, postId: string, q: CommentListQueryDto): Promise<FeedCommentListDto> {
    const cursor = parseCursor(q.cursor);
    if (cursor === false) throw badRequest('feed.err.cursor');
    const limit = clampLimit(q.limit, COMMENT_PAGE_DEFAULT, COMMENT_PAGE_MAX);
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      const v = await this.viewer(tx, tenantId, authId);
      await this.loadPost(tx, tenantId, postId, v);
      const rows = await tx.feedComment.findMany({
        where: { tenantId, postId, ...visibleWhere(v), ...(cursor ? { id: { gt: cursor } } : {}) },
        include: commentInclude(v.userId),
        orderBy: { id: 'asc' },
        take: limit + 1,
      });
      const { items, nextCursor } = pageOf(rows, limit);
      return { data: items.map((r) => this.commentDto(r, v)), nextCursor };
    });
  }

  async addComment(tenantId: string, authId: string, postId: string, body: string): Promise<FeedCommentDto> {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const v = await this.viewer(tx, tenantId, authId);
        await this.loadPost(tx, tenantId, postId, v);
        const c = await tx.feedComment.create({
          data: { tenantId, postId, authorId: v.userId, body: body.trim() },
          include: commentInclude(v.userId),
        });
        await tx.feedPost.update({ where: { id: postId }, data: { commentCount: { increment: 1 } } });
        return this.commentDto(c, v);
      }),
    );
  }

  async updateComment(tenantId: string, authId: string, id: string, body: string): Promise<FeedCommentDto> {
    const text = body.trim();
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const v = await this.viewer(tx, tenantId, authId);
        const cur = await this.loadComment(tx, tenantId, id, v);
        if (!canEdit(cur, v)) throw forbidden('feed.err.edit_own');
        if (text !== cur.body) {
          await tx.feedRevision.create({ data: { tenantId, commentId: cur.id, body: cur.body, editedBy: v.userId } });
          await tx.feedComment.update({ where: { id: cur.id }, data: { body: text, editedAt: new Date() } });
        }
        const r = await tx.feedComment.findFirstOrThrow({ where: { id: cur.id }, include: commentInclude(v.userId) });
        return this.commentDto(r, v);
      }),
    );
  }

  async removeComment(tenantId: string, authId: string, id: string): Promise<void> {
    await inTenantTx(this.prisma, tenantId, async (tx) => {
      const v = await this.viewer(tx, tenantId, authId);
      const cur = await this.loadComment(tx, tenantId, id, v);
      if (!canDelete(cur, v)) throw forbidden('error.forbidden');
      const now = new Date();
      await tx.feedComment.update({ where: { id: cur.id }, data: { deletedAt: now, deletedBy: v.userId, reportCount: 0 } });
      await tx.feedPost.update({ where: { id: cur.postId }, data: { commentCount: { decrement: 1 } } });
      await tx.feedReport.updateMany({
        where: { tenantId, commentId: cur.id, status: FeedReportStatus.OPEN },
        data: { status: FeedReportStatus.REMOVED, resolvedBy: v.userId, resolvedAt: now },
      });
    });
  }

  // ── Засварын түүх ────────────────────────────────────────
  async revisions(tenantId: string, authId: string, target: 'post' | 'comment', id: string): Promise<FeedRevisionListDto> {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      const v = await this.viewer(tx, tenantId, authId);
      const cur = target === 'post' ? await this.loadPost(tx, tenantId, id, v) : await this.loadComment(tx, tenantId, id, v);
      const rows = await tx.feedRevision.findMany({
        where: { tenantId, ...(target === 'post' ? { postId: id } : { commentId: id }) },
        orderBy: { createdAt: 'desc' },
        select: { body: true, createdAt: true },
      });
      return {
        current: cur.body,
        editedAt: iso(cur.editedAt),
        revisions: rows.map((r) => ({ body: r.body, replacedAt: r.createdAt.toISOString() })),
      };
    });
  }

  // ── Зураг (гарын үсэгтэй URL, нэвтрэлтгүй route) ──────────
  async mediaVariant(mediaId: string, w: number, q: { t?: string; e?: string | number; s?: string }): Promise<MediaVariantRef> {
    const tenantId = this.signer.verify('f', mediaId, w, q);
    if (!tenantId) throw notFound('feed.err.media_not_found');
    const m = await inTenantTx(this.prisma, tenantId, (tx) =>
      tx.feedPostMedia.findFirst({ where: { tenantId, id: mediaId }, include: { post: { select: { deletedAt: true } } } }),
    );
    const variant = m && !m.post.deletedAt ? pickVariant(parseVariants(m.variants), w) : null;
    if (!variant) throw notFound('feed.err.media_not_found');
    return variant;
  }

  open(key: string) {
    return this.media.open(key);
  }
}
