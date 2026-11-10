import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { inTenantTx, type Tx } from '../../camp/common/camp-tx';
import { withCampErrors } from '../../camp/common/camp-errors';
import { badRequest, forbidden, notFound } from '../../../common/i18n/app-error';
import { MediaService, mediaImageDto, parseVariants, pickVariant, type MediaImageDto, type MediaVariantRef } from '../../../storage/media.service';
import { MEDIA_URL_SIGNER, MediaUrlSigner } from '../../../storage/media-url';
import { canEditFeedback, isFeedbackAdmin } from './feedback-rules';

export const FEEDBACK_MAX_IMAGES = 3;
const FEEDBACK_MEDIA_BASE = '/api/v1/core/feedback/attachments';

/**
 * v0.2.3 Блок 5 (5.7) — санал хүсэлтийн дэлгэцийн зураг (≤3). Блок F-ийн үлдэгдэл: Feed-ийн StorageService-ээр.
 * Хавсаргах / устгах — санал засах эрхтэй хүн (зохиогч «Шинэ» үед, админ үргэлж). Харах — бүгд (санал шиг).
 */
@Injectable()
export class CoreFeedbackAttachmentsService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly media: MediaService,
    @Inject(MEDIA_URL_SIGNER) private readonly signer: MediaUrlSigner,
  ) {}

  toDto(tenantId: string, row: { id: string; width: number; height: number; thumbhash: string; variants: unknown }): MediaImageDto {
    return mediaImageDto(this.signer, 'b', FEEDBACK_MEDIA_BASE, tenantId, row);
  }

  private async editable(tx: Tx, tenantId: string, authId: string, feedbackId: string) {
    const u = await tx.coreUser.findFirst({ where: { authId, tenantId, isActive: true }, select: { id: true, role: true } });
    if (!u) throw forbidden('error.forbidden');
    const fb = await tx.coreFeedback.findFirst({ where: { tenantId, id: feedbackId }, select: { id: true, authorId: true, status: true } });
    if (!fb) throw notFound('core.err.feedback.not_found');
    if (!canEditFeedback(fb, { userId: u.id, isAdmin: isFeedbackAdmin(u.role) })) throw forbidden('core.err.feedback.attach_locked');
    return fb;
  }

  async add(tenantId: string, authId: string, feedbackId: string, images: readonly Buffer[]): Promise<MediaImageDto[]> {
    if (images.length === 0) throw badRequest('feed.err.empty');
    const existing = await inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.editable(tx, tenantId, authId, feedbackId);
      return tx.coreFeedbackAttachment.count({ where: { tenantId, feedbackId } });
    });
    if (existing + images.length > FEEDBACK_MAX_IMAGES) throw badRequest('feed.err.too_many_images', { max: FEEDBACK_MAX_IMAGES });
    const stored = await this.media.storeMany(tenantId, 'feedback', images);
    try {
      return await withCampErrors(() =>
        inTenantTx(this.prisma, tenantId, async (tx) => {
          await this.editable(tx, tenantId, authId, feedbackId);
          const used = new Set(
            (await tx.coreFeedbackAttachment.findMany({ where: { tenantId, feedbackId }, select: { sortOrder: true } })).map((a) => a.sortOrder),
          );
          const free = [0, 1, 2].filter((i) => !used.has(i));
          if (free.length < stored.length) throw badRequest('feed.err.too_many_images', { max: FEEDBACK_MAX_IMAGES });
          await tx.coreFeedbackAttachment.createMany({
            data: stored.map((m, i) => ({
              tenantId,
              feedbackId,
              sortOrder: free[i]!,
              width: m.width,
              height: m.height,
              thumbhash: m.thumbhash,
              variants: m.variants as unknown as Prisma.InputJsonValue,
              totalBytes: m.totalBytes,
            })),
          });
          const rows = await tx.coreFeedbackAttachment.findMany({ where: { tenantId, feedbackId }, orderBy: { sortOrder: 'asc' } });
          return rows.map((r) => this.toDto(tenantId, r));
        }),
      );
    } catch (err) {
      await this.media.remove(stored.flatMap((m) => m.variants));
      throw err;
    }
  }

  async remove(tenantId: string, authId: string, attachmentId: string): Promise<void> {
    const variants = await inTenantTx(this.prisma, tenantId, async (tx) => {
      const a = await tx.coreFeedbackAttachment.findFirst({ where: { tenantId, id: attachmentId } });
      if (!a) throw notFound('core.err.feedback.attach_not_found');
      await this.editable(tx, tenantId, authId, a.feedbackId);
      await tx.coreFeedbackAttachment.delete({ where: { id: a.id } });
      return parseVariants(a.variants);
    });
    await this.media.remove(variants);
  }

  /** Санал устгахад (cascade) файлуудыг цэвэрлэх — дуудагч commit-ийн дараа `media.remove` */
  async variantsOf(tx: Tx, tenantId: string, feedbackId: string): Promise<MediaVariantRef[]> {
    const rows = await tx.coreFeedbackAttachment.findMany({ where: { tenantId, feedbackId }, select: { variants: true } });
    return rows.flatMap((r) => parseVariants(r.variants));
  }

  removeFiles(variants: readonly MediaVariantRef[]): Promise<void> {
    return this.media.remove(variants);
  }

  /** Гарын үсэгтэй URL (нэвтрэлтгүй route) */
  async variant(attachmentId: string, w: number, q: { t?: string; e?: string; s?: string }): Promise<MediaVariantRef> {
    const tenantId = this.signer.verify('b', attachmentId, w, q);
    if (!tenantId) throw notFound('core.err.feedback.attach_not_found');
    const a = await inTenantTx(this.prisma, tenantId, (tx) =>
      tx.coreFeedbackAttachment.findFirst({ where: { tenantId, id: attachmentId }, select: { variants: true } }),
    );
    const v = a ? pickVariant(parseVariants(a.variants), w) : null;
    if (!v) throw notFound('core.err.feedback.attach_not_found');
    return v;
  }

  open(key: string) {
    return this.media.open(key);
  }
}
