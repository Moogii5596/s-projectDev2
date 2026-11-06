import { Injectable } from '@nestjs/common';
import { FeedReportStatus } from '@prisma/client';
import { PrismaTenantClientService } from '../../db/prisma-tenant-client.service';
import { inTenantTx, type Tx } from '../camp/common/camp-tx';
import { withCampErrors } from '../camp/common/camp-errors';
import { badRequest, conflict, forbidden, notFound } from '../../common/i18n/app-error';
import { MediaService, parseVariants } from '../../storage/media.service';
import { canReport, canView, type FeedContentState, type FeedViewer } from './feed-rules';
import { FeedService, authorDto } from './feed.service';
import type { CreateReportDto, FeedReportItemDto, FeedReportResultDto, ReportListQueryDto, ResolveReportDto } from './feed.dto';

const AUTHOR = { select: { id: true, fullName: true, username: true, email: true } } as const;
const STATE = { authorId: true, deletedAt: true, hiddenAt: true } as const;

/**
 * v0.2.3 Блок 5 (FEED-01) — report.
 *   - Хэрэглэгч бусдын харагдаж буй пост / сэтгэгдлийг нэг удаа мэдээлнэ.
 *   - OPEN тоо ≥ `feed_auto_hide_threshold()` (tenants.settings.feed.autoHideReports, анхдагч 3) → hidden_at (түр нуух).
 *   - Модератор: жагсаалт; DISMISS (нуулт арилна) | REMOVE (агуулга устна) — тухайн агуулгын бүх OPEN report хамт шийдэгдэнэ.
 */
@Injectable()
export class FeedReportsService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly feed: FeedService,
    private readonly media: MediaService,
  ) {}

  private async moderator(tx: Tx, tenantId: string, authId: string): Promise<FeedViewer> {
    const v = await this.feed.viewer(tx, tenantId, authId);
    if (!v.isModerator) throw forbidden('feed.err.moderator_only');
    return v;
  }

  async create(tenantId: string, authId: string, dto: CreateReportDto): Promise<FeedReportResultDto> {
    if (!!dto.postId === !!dto.commentId) throw badRequest('feed.err.report_target');
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const v = await this.feed.viewer(tx, tenantId, authId);
        let target: ({ id: string } & FeedContentState) | null;
        let parentOk = true;
        if (dto.postId) {
          target = await tx.feedPost.findFirst({ where: { tenantId, id: dto.postId }, select: { id: true, ...STATE } });
        } else {
          const c = await tx.feedComment.findFirst({
            where: { tenantId, id: dto.commentId },
            select: { id: true, ...STATE, post: { select: STATE } },
          });
          target = c;
          parentOk = !c || canView(c.post, v);
        }
        if (!target || !canView(target, v) || !parentOk) throw notFound(dto.postId ? 'feed.err.not_found' : 'feed.err.comment_not_found');
        if (!canReport(target, v)) throw badRequest('feed.err.report_own');

        const dup = await tx.feedReport.findFirst({
          where: { tenantId, reporterId: v.userId, ...(dto.postId ? { postId: target.id } : { commentId: target.id }) },
          select: { id: true },
        });
        if (dup) throw conflict('feed.err.report_duplicate');

        await tx.feedReport.create({
          data: {
            tenantId,
            reporterId: v.userId,
            reason: dto.reason,
            note: dto.note ?? null,
            ...(dto.postId ? { postId: target.id } : { commentId: target.id }),
          },
        });
        const [{ n: threshold }] = await tx.$queryRaw<{ n: number }[]>`SELECT feed_auto_hide_threshold() AS n`;
        const bump = (count: number, hiddenAt: Date | null) => ({
          reportCount: { increment: 1 },
          ...(!hiddenAt && count + 1 >= threshold ? { hiddenAt: new Date() } : {}),
        });
        const cur = await (dto.postId
          ? tx.feedPost.findFirstOrThrow({ where: { id: target.id }, select: { reportCount: true, hiddenAt: true } })
          : tx.feedComment.findFirstOrThrow({ where: { id: target.id }, select: { reportCount: true, hiddenAt: true } }));
        const after = dto.postId
          ? await tx.feedPost.update({ where: { id: target.id }, data: bump(cur.reportCount, cur.hiddenAt), select: { reportCount: true, hiddenAt: true } })
          : await tx.feedComment.update({ where: { id: target.id }, data: bump(cur.reportCount, cur.hiddenAt), select: { reportCount: true, hiddenAt: true } });
        return { reportCount: after.reportCount, hidden: after.hiddenAt !== null };
      }),
    );
  }

  async list(tenantId: string, authId: string, q: ReportListQueryDto): Promise<FeedReportItemDto[]> {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.moderator(tx, tenantId, authId);
      const rows = await tx.feedReport.findMany({
        where: { tenantId, status: q.status ?? FeedReportStatus.OPEN },
        include: {
          reporter: AUTHOR,
          post: { select: { id: true, body: true, ...STATE, author: AUTHOR } },
          comment: { select: { id: true, postId: true, body: true, ...STATE, author: AUTHOR } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      return rows.flatMap((r): FeedReportItemDto[] => {
        const c = r.post ?? r.comment;
        if (!c) return [];
        return [
          {
            id: r.id,
            targetType: r.post ? 'POST' : 'COMMENT',
            postId: r.post ? r.post.id : r.comment!.postId,
            commentId: r.comment?.id ?? null,
            excerpt: c.body.slice(0, 200),
            contentAuthor: authorDto(c.author),
            contentHidden: c.hiddenAt !== null,
            contentDeleted: c.deletedAt !== null,
            reporter: authorDto(r.reporter),
            reason: r.reason,
            note: r.note,
            status: r.status,
            createdAt: r.createdAt.toISOString(),
            resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
          },
        ];
      });
    });
  }

  /** Тухайн агуулгын БҮХ OPEN report-ыг шийднэ. Буцаах: шийдэгдсэн report-ын тоо */
  async resolve(tenantId: string, authId: string, id: string, dto: ResolveReportDto): Promise<{ resolved: number }> {
    const { resolved, files } = await inTenantTx(this.prisma, tenantId, async (tx) => {
      const v = await this.moderator(tx, tenantId, authId);
      const rep = await tx.feedReport.findFirst({ where: { tenantId, id }, select: { postId: true, commentId: true, status: true } });
      if (!rep) throw notFound('feed.err.report_not_found');
      if (rep.status !== FeedReportStatus.OPEN) throw conflict('feed.err.report_resolved');
      const now = new Date();
      const remove = dto.action === 'REMOVE';
      const targetWhere = rep.postId ? { postId: rep.postId } : { commentId: rep.commentId };
      const { count } = await tx.feedReport.updateMany({
        where: { tenantId, ...targetWhere, status: FeedReportStatus.OPEN },
        data: { status: remove ? FeedReportStatus.REMOVED : FeedReportStatus.DISMISSED, resolvedBy: v.userId, resolvedAt: now },
      });
      const data = remove
        ? { deletedAt: now, deletedBy: v.userId, reportCount: 0 }
        : { hiddenAt: null, reportCount: 0 };
      let files: { key: string }[] = [];
      if (rep.postId) {
        const p = await tx.feedPost.update({
          where: { id: rep.postId },
          data,
          select: { media: { select: { variants: true } } },
        });
        if (remove) files = p.media.flatMap((m) => parseVariants(m.variants));
      } else if (rep.commentId) {
        const before = await tx.feedComment.findFirstOrThrow({ where: { id: rep.commentId }, select: { deletedAt: true, postId: true } });
        await tx.feedComment.update({ where: { id: rep.commentId }, data });
        if (remove && !before.deletedAt) {
          await tx.feedPost.update({ where: { id: before.postId }, data: { commentCount: { decrement: 1 } } });
        }
      }
      return { resolved: count, files };
    });
    await this.media.remove(files);
    return { resolved };
  }
}
