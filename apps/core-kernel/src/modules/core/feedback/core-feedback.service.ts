import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CoreFeedback, UserRole } from '@prisma/client';
import ExcelJS from 'exceljs';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { inTenantTx, Tx } from '../../camp/common/camp-tx';
import { withCampErrors } from '../../camp/common/camp-errors';
import { badRequest, forbidden, notFound } from '../../../common/i18n/app-error';
import { APP_VERSION } from '../../../config/app-version';
import {
  CreateFeedbackDto,
  FeedbackItemDto,
  FeedbackListDto,
  QueryFeedbackDto,
  SetFeedbackStatusDto,
  UpdateFeedbackDto,
} from './core-feedback.dto';
import { canEditFeedback, displayAuthor, isFeedbackAdmin, resolveDoneVersion } from './feedback-rules';
import { CoreFeedbackAttachmentsService } from './core-feedback-attachments.service';

interface Actor {
  userId: string;
  role: UserRole;
  isAdmin: boolean;
}

const AUTHOR_SELECT = { fullName: true, username: true, email: true } as const;
type Row = CoreFeedback & {
  author: { fullName: string | null; username: string | null; email: string };
  votes: { id: string }[];
  attachments: { id: string; width: number; height: number; thumbhash: string; variants: unknown }[];
};

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

/**
 * v0.2.3 Блок F (FB-SYS-01a) — санал хүсэлт / хөгжүүлэлтийн захиалга.
 *   - Нэвтэрсэн (идэвхтэй) бүх хэрэглэгч: илгээх, бүгдийг харах, «+1».
 *   - Зохиогч: өөрийн «Шинэ» саналаа засах / устгах.
 *   - OWNER / ADMIN: төлөв, хариу, хэрэгжсэн хувилбар, Excel экспорт.
 */
@Injectable()
export class CoreFeedbackService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly attachments: CoreFeedbackAttachmentsService,
  ) {}

  /** authId → идэвхтэй core_users (RULE-13). Кемпийн эрхээс хамаарахгүй — системийн бүх хэрэглэгч. */
  private async actor(tx: Tx, tenantId: string, authId: string): Promise<Actor> {
    const u = await tx.coreUser.findFirst({ where: { authId, tenantId, isActive: true }, select: { id: true, role: true } });
    if (!u) throw forbidden('error.forbidden');
    return { userId: u.id, role: u.role, isAdmin: isFeedbackAdmin(u.role) };
  }

  private toDto(r: Row, a: Actor): FeedbackItemDto {
    return {
      id: r.id,
      kind: r.kind,
      title: r.title,
      body: r.body,
      pagePath: r.pagePath,
      appVersion: r.appVersion,
      status: r.status,
      adminReply: r.adminReply,
      repliedAt: iso(r.repliedAt),
      doneVersion: r.doneVersion,
      voteCount: r.voteCount,
      votedByMe: r.votes.length > 0,
      isMine: r.authorId === a.userId,
      canEdit: canEditFeedback(r, a),
      authorName: displayAuthor(r.author),
      attachments: r.attachments.map((x) => this.attachments.toDto(r.tenantId, x)),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  private include(a: Actor) {
    return {
      author: { select: AUTHOR_SELECT },
      votes: { where: { userId: a.userId }, select: { id: true } },
      attachments: { orderBy: { sortOrder: 'asc' } }, // v0.2.3 Блок 5 (5.7)
    } as const;
  }

  private async load(tx: Tx, tenantId: string, id: string, a: Actor): Promise<Row> {
    const r = await tx.coreFeedback.findFirst({ where: { tenantId, id }, include: this.include(a) });
    if (!r) throw notFound('core.err.feedback.not_found');
    return r;
  }

  async list(tenantId: string, authId: string, q: QueryFeedbackDto): Promise<FeedbackListDto> {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      const a = await this.actor(tx, tenantId, authId);
      const where: Prisma.CoreFeedbackWhereInput = {
        tenantId,
        ...(q.status ? { status: q.status } : {}),
        ...(q.kind ? { kind: q.kind } : {}),
        ...(q.mine ? { authorId: a.userId } : {}),
        ...(q.q
          ? { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { body: { contains: q.q, mode: 'insensitive' } }] }
          : {}),
      };
      const orderBy: Prisma.CoreFeedbackOrderByWithRelationInput[] =
        q.sort === 'votes' ? [{ voteCount: 'desc' }, { createdAt: 'desc' }] : [{ createdAt: 'desc' }];
      const [rows, total] = await Promise.all([
        tx.coreFeedback.findMany({ where, include: this.include(a), orderBy, take: q.limit ?? 200 }),
        tx.coreFeedback.count({ where }),
      ]);
      return { data: rows.map((r) => this.toDto(r, a)), total, canManage: a.isAdmin };
    });
  }

  async create(tenantId: string, authId: string, dto: CreateFeedbackDto): Promise<FeedbackItemDto> {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const a = await this.actor(tx, tenantId, authId);
        const r = await tx.coreFeedback.create({
          data: {
            tenantId,
            authorId: a.userId,
            kind: dto.kind,
            title: dto.title,
            body: dto.body ?? '',
            pagePath: dto.pagePath ?? null,
            appVersion: `v${APP_VERSION}`,
          },
          include: this.include(a),
        });
        return this.toDto(r, a);
      }),
    );
  }

  async update(tenantId: string, authId: string, id: string, dto: UpdateFeedbackDto): Promise<FeedbackItemDto> {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const a = await this.actor(tx, tenantId, authId);
        const cur = await this.load(tx, tenantId, id, a);
        if (!canEditFeedback(cur, a)) throw forbidden('core.err.feedback.edit_locked');
        const r = await tx.coreFeedback.update({
          where: { id: cur.id },
          data: {
            ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
            ...(dto.title !== undefined ? { title: dto.title } : {}),
            ...(dto.body !== undefined ? { body: dto.body } : {}),
          },
          include: this.include(a),
        });
        return this.toDto(r, a);
      }),
    );
  }

  async setStatus(tenantId: string, authId: string, id: string, dto: SetFeedbackStatusDto): Promise<FeedbackItemDto> {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const a = await this.actor(tx, tenantId, authId);
        if (!a.isAdmin) throw forbidden('core.err.feedback.admin_only');
        const cur = await this.load(tx, tenantId, id, a);
        const doneVersion = resolveDoneVersion(dto);
        if (doneVersion === 'invalid') throw badRequest('core.err.feedback.done_version');
        const reply = dto.adminReply === undefined ? cur.adminReply : dto.adminReply;
        const replyChanged = reply !== cur.adminReply;
        const r = await tx.coreFeedback.update({
          where: { id: cur.id },
          data: {
            status: dto.status,
            doneVersion,
            adminReply: reply,
            // Хариу эсвэл төлөв өөрчилсөн админ = «хариулсан» (жагсаалтад хэн, хэзээ)
            ...(replyChanged || dto.status !== cur.status ? { repliedBy: a.userId, repliedAt: new Date() } : {}),
          },
          include: this.include(a),
        });
        return this.toDto(r, a);
      }),
    );
  }

  async remove(tenantId: string, authId: string, id: string): Promise<{ id: string }> {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const a = await this.actor(tx, tenantId, authId);
        const cur = await this.load(tx, tenantId, id, a);
        if (!canEditFeedback(cur, a)) throw forbidden('core.err.feedback.edit_locked');
        const files = await this.attachments.variantsOf(tx, tenantId, cur.id);
        await tx.coreFeedback.delete({ where: { id: cur.id } }); // хавсралтын мөр — cascade
        return { id: cur.id, files };
      }),
    ).then(async ({ id: removed, files }) => {
      await this.attachments.removeFiles(files); // commit-ийн дараа (best-effort)
      return { id: removed };
    });
  }

  /** «+1» (on = true) / буцаах. Давхар дарах нь алдаагүй (idempotent); тоо = votes-ийн бодит тоо (нэг tx). */
  async vote(tenantId: string, authId: string, id: string, on: boolean): Promise<FeedbackItemDto> {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const a = await this.actor(tx, tenantId, authId);
        const cur = await this.load(tx, tenantId, id, a);
        if (on) {
          await tx.coreFeedbackVote.createMany({
            data: [{ tenantId, feedbackId: cur.id, userId: a.userId }],
            skipDuplicates: true,
          });
        } else {
          await tx.coreFeedbackVote.deleteMany({ where: { tenantId, feedbackId: cur.id, userId: a.userId } });
        }
        const voteCount = await tx.coreFeedbackVote.count({ where: { tenantId, feedbackId: cur.id } });
        const r = await tx.coreFeedback.update({ where: { id: cur.id }, data: { voteCount }, include: this.include(a) });
        return this.toDto(r, a);
      }),
    );
  }

  /** Админ: бүх санал Excel-ээр (хөгжүүлэлтийн backlog руу шилжүүлэхэд) */
  async exportXlsx(tenantId: string, authId: string): Promise<Buffer> {
    const rows = await inTenantTx(this.prisma, tenantId, async (tx) => {
      const a = await this.actor(tx, tenantId, authId);
      if (!a.isAdmin) throw forbidden('core.err.feedback.admin_only');
      return tx.coreFeedback.findMany({
        where: { tenantId },
        include: this.include(a),
        orderBy: [{ createdAt: 'asc' }],
      });
    });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Feedback');
    ws.columns = [
      { header: 'No', key: 'no', width: 6 },
      { header: 'Date', key: 'createdAt', width: 18 },
      { header: 'Kind', key: 'kind', width: 10 },
      { header: 'Title', key: 'title', width: 40 },
      { header: 'Description', key: 'body', width: 60 },
      { header: 'Page', key: 'pagePath', width: 24 },
      { header: 'Version', key: 'appVersion', width: 10 },
      { header: 'Author', key: 'author', width: 20 },
      { header: '+1', key: 'voteCount', width: 6 },
      { header: 'Status', key: 'status', width: 10 },
      { header: 'Reply', key: 'adminReply', width: 40 },
      { header: 'Done in', key: 'doneVersion', width: 10 },
      { header: 'ID', key: 'id', width: 38 },
    ];
    ws.getRow(1).font = { bold: true };
    rows.forEach((r, i) =>
      ws.addRow({
        no: i + 1,
        createdAt: r.createdAt.toISOString().slice(0, 16).replace('T', ' '),
        kind: r.kind,
        title: r.title,
        body: r.body,
        pagePath: r.pagePath ?? '',
        appVersion: r.appVersion ?? '',
        author: displayAuthor(r.author),
        voteCount: r.voteCount,
        status: r.status,
        adminReply: r.adminReply ?? '',
        doneVersion: r.doneVersion ?? '',
        id: r.id,
      }),
    );
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}
