import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { conflict, notFound } from '../../common/i18n/app-error';
import { getModuleManifest } from '../core/modules/module-registry';

type Tx = Prisma.TransactionClient;

/** Пост дээр харагдах холбоосын мэдээлэл — объектын эрхгүй хүнд зардал, сэлбэг, PII ✖ (зөвхөн төлөв + дугаар) */
export interface FeedLinkDto {
  objectType: string;
  labelKey: string;
  /** Төлөвийн i18n түлхүүр (`feed.link.status.*`) */
  statusKey: string;
  /** Дуусцан (хаагдсан / хийгдсэн) эсэх — UI-д тэмдэглэнэ */
  closed: boolean;
  /** Дугаар (жнь ЗАС-2026-0012) — нууц биш */
  ref: string | null;
  /** Объектыг харах эрхтэй бол апп доторх зам, эс бөгөөс null */
  link: string | null;
}

export interface FeedLinkStatus {
  statusKey: string;
  closed: boolean;
  ref: string | null;
}

/**
 * Модуль бүр өөрийн объектын төрлийг бүртгэнэ. Төлөвийг уншихдаа объектоос (хуулбаргүй);
 * `viewLink` — пост харах эрх ≠ объект харах эрх (FEED-03: объектын эрхийг пост харах эрхээр орлуулахгүй).
 */
export interface FeedLinkHandler {
  objectType: string;
  module: string;
  labelKey: string;
  statuses(tx: Tx, tenantId: string, objectIds: string[]): Promise<Map<string, FeedLinkStatus>>;
  viewLink(tx: Tx, tenantId: string, userId: string, objectId: string): Promise<string | null>;
}

/** v0.2.4 Блок 10б (FEED-04) — пост ↔ объектын ерөнхий холбоос (feed_links) */
@Injectable()
export class FeedLinksService {
  private readonly handlers = new Map<string, FeedLinkHandler>();

  register(h: FeedLinkHandler): void {
    if (!/^[A-Z][A-Z0-9_]{1,59}$/.test(h.objectType)) throw new Error(`Feed link type буруу: ${h.objectType}`);
    const manifest = getModuleManifest(h.module);
    if (!manifest) throw new Error(`Feed object module manifest-д байхгүй: ${h.module}`);
    if (!manifest.feedObjectTypes?.includes(h.objectType)) throw new Error(`Feed object type manifest-д бүртгэгдээгүй: ${h.objectType}`);
    this.handlers.set(h.objectType, h);
  }

  /** Объект үүсгэхээс ӨМНӨ (нэг transaction): пост харагдаж байгаа, энэ төрлийн холбоосгүй */
  async assertLinkable(tx: Tx, tenantId: string, postId: string, userId: string, objectType: string): Promise<{ body: string; authorId: string }> {
    if (!this.handlers.has(objectType)) throw notFound('feed.err.link_type');
    const post = await tx.feedPost.findFirst({
      where: { tenantId, id: postId, deletedAt: null, OR: [{ hiddenAt: null }, { authorId: userId }] },
      select: { body: true, authorId: true },
    });
    if (!post) throw notFound('feed.err.not_found');
    const existing = await tx.feedLink.count({ where: { tenantId, postId, objectType } });
    if (existing > 0) throw conflict('feed.err.link_exists');
    return post;
  }

  async link(tx: Tx, tenantId: string, p: { postId: string; objectType: string; objectId: string; userId: string }): Promise<void> {
    try {
      await tx.feedLink.create({ data: { tenantId, postId: p.postId, objectType: p.objectType, objectId: p.objectId, createdBy: p.userId } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw conflict('feed.err.link_exists');
      throw err;
    }
  }

  /** Feed-ийн хуудсанд — постуудын холбоос (харагч бүрт объектын эрхээр линк) */
  async forPosts(tx: Tx, tenantId: string, postIds: string[], userId: string): Promise<Map<string, FeedLinkDto[]>> {
    const out = new Map<string, FeedLinkDto[]>();
    if (postIds.length === 0 || this.handlers.size === 0) return out;
    const rows = await tx.feedLink.findMany({ where: { tenantId, postId: { in: postIds } }, orderBy: { createdAt: 'asc' } });
    const byType = new Map<string, string[]>();
    for (const r of rows) (byType.get(r.objectType) ?? byType.set(r.objectType, []).get(r.objectType)!).push(r.objectId);
    const statuses = new Map<string, Map<string, FeedLinkStatus>>();
    for (const [type, ids] of byType) {
      const h = this.handlers.get(type);
      if (h) statuses.set(type, await h.statuses(tx, tenantId, ids));
    }
    for (const r of rows) {
      const h = this.handlers.get(r.objectType);
      const st = statuses.get(r.objectType)?.get(r.objectId);
      if (!h || !st) continue;
      const dto: FeedLinkDto = { objectType: r.objectType, labelKey: h.labelKey, ...st, link: await h.viewLink(tx, tenantId, userId, r.objectId) };
      (out.get(r.postId) ?? out.set(r.postId, []).get(r.postId)!).push(dto);
    }
    return out;
  }

  /** Объектын төлөв өөрчлөгдөхөд мэдэгдэх — холбогдсон постын зохиогч(ид) */
  async postAuthors(tx: Tx, tenantId: string, objectType: string, objectId: string): Promise<Array<{ postId: string; authorId: string }>> {
    const rows = await tx.feedLink.findMany({
      where: { tenantId, objectType, objectId, post: { deletedAt: null } },
      select: { postId: true, post: { select: { authorId: true } } },
    });
    return rows.map((r) => ({ postId: r.postId, authorId: r.post.authorId }));
  }
}
