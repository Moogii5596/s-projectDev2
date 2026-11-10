import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CampAuditAction, UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { inTenantTx } from '../../../db/tenant-tx';
import { badRequest, conflict, forbidden, notFound } from '../../../common/i18n/app-error';
import { STORAGE_SERVICE, type StorageService } from '../../../storage/storage.service';
import { decryptFile, detectFileType, encryptFile, resolveFileKey, safeFileName, sha256Hex, type FileKey } from '../../../storage/file-crypto';
import { CoreTenantModulesService } from '../modules/core-tenant-modules.service';
import { isTenantModuleId } from '../modules/module-registry';
import { CampAuditService } from '../../camp/common/camp-audit.service';
import { AttachmentTypeRegistry, type AttachmentTypeHandler } from './attachment-type.registry';
import type { UploadedFile } from './file-upload';
import { compileNamePattern, DEFAULT_NAME_PATTERN, parseFileName } from './attachment-name-pattern';

type Tx = Prisma.TransactionClient;

export interface AttachmentView {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  docType: string | null;
  version: number;
  docDate: string | null;
  uploadedByName: string | null;
  createdAt: string;
  canDelete: boolean;
}

export interface AttachmentBulkPreviewItem {
  fileName: string;
  objectCode: string | null;
  docType: string | null;
  docDate: string | null;
  status: 'READY' | 'INVALID_NAME' | 'OBJECT_NOT_FOUND' | 'DUPLICATE_IN_BATCH';
}

export const MAX_BULK_ATTACHMENT_FILES = 20;

/**
 * v0.2.4 Блок 8 (FILE-01, M-7) — ерөнхий хавсралт: шифрлэлттэй хадгалалт, объектын эрхээр хандалт, PII-ийн хандалтын лог.
 * Татах = backend proxy (`/core/attachments/:id/download`) — дискний замыг хэзээ ч ил гаргахгүй.
 */
@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);
  private keyCache: FileKey | null = null;

  constructor(
    private readonly prisma: PrismaTenantClientService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    private readonly registry: AttachmentTypeRegistry,
    private readonly modules: CoreTenantModulesService,
    private readonly audit: CampAuditService,
  ) {}

  private key(): FileKey {
    if (!this.keyCache) {
      this.keyCache = resolveFileKey();
      if (this.keyCache.derived) this.logger.warn('FILE_ENCRYPTION_KEY тохируулаагүй — JWT_SECRET-ээс гаргасан түлхүүр ашиглаж байна');
    }
    return this.keyCache;
  }

  async list(tenantId: string, authId: string, entityType: string, entityId: string): Promise<{ items: AttachmentView[] }> {
    const h = await this.handler(tenantId, entityType);
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      const userId = await this.me(tx, tenantId, authId);
      const ctx = { tenantId, userId, entityId };
      if (!(await h.canView(tx, ctx))) throw notFound('core.files.not_found');
      const canManage = await h.canManage(tx, ctx);
      const rows = await tx.coreAttachment.findMany({ where: { tenantId, entityType, entityId, deletedAt: null }, orderBy: { createdAt: 'asc' } });
      const names = await this.names(tx, tenantId, rows.map((r) => r.uploadedBy));
      return { items: rows.map((r) => this.view(r, names, canManage || r.uploadedBy === userId)) };
    });
  }

  async upload(tenantId: string, authId: string, entityType: string, entityId: string, files: readonly UploadedFile[]): Promise<{ items: AttachmentView[] }> {
    const h = await this.handler(tenantId, entityType);
    if (files.length > h.maxFiles) throw badRequest('core.files.too_many', { max: h.maxFiles });
    const prepared = files.map((f) => {
      if (f.data.length > h.maxBytes) throw badRequest('core.files.too_large', { max: Math.round(h.maxBytes / 1024 / 1024) });
      const mime = detectFileType(f.data, f.fileName);
      if (!mime || !h.mimeTypes.includes(mime)) throw badRequest('core.files.type_not_allowed', { name: safeFileName(f.fileName) });
      return { fileName: safeFileName(f.fileName), mime, data: f.data, sha: sha256Hex(f.data) };
    });
    const userId = await inTenantTx(this.prisma, tenantId, async (tx) => {
      const me = await this.me(tx, tenantId, authId);
      if (!(await h.canView(tx, { tenantId, userId: me, entityId }))) throw notFound('core.files.not_found');
      if (!(await h.canManage(tx, { tenantId, userId: me, entityId }))) throw forbidden('core.files.forbidden');
      return me;
    });

    // Диск рүү (transaction-ий гадна) → DB-д бичиж чадахгүй бол файлыг устгана
    const key = this.key();
    const stored: Array<(typeof prepared)[number] & { storageKey: string }> = [];
    try {
      for (const p of prepared) {
        const storageKey = `attachments/${tenantId}/${randomUUID()}.bin`;
        await this.storage.put(storageKey, encryptFile(p.data, key));
        stored.push({ ...p, storageKey });
      }
      await inTenantTx(this.prisma, tenantId, async (tx) => {
        const ctx = { tenantId, userId, entityId };
        if (!(await h.canManage(tx, ctx))) throw forbidden('core.files.forbidden');
        const existing = await tx.coreAttachment.count({ where: { tenantId, entityType, entityId, deletedAt: null } });
        if (existing + stored.length > h.maxFiles && h.maxFiles > 1) throw badRequest('core.files.too_many', { max: h.maxFiles });
        if (h.maxFiles === 1 && existing > 0) {
          // Ганц файлтай төрөл (лого) — өмнөхийг солино
          await tx.coreAttachment.updateMany({ where: { tenantId, entityType, entityId, deletedAt: null }, data: { deletedAt: new Date(), deletedBy: userId } });
        }
        for (const s of stored) {
          const row = await tx.coreAttachment.create({
            data: { tenantId, entityType, entityId, fileName: s.fileName, mimeType: s.mime, sizeBytes: s.data.length, sha256: s.sha, storageKey: s.storageKey, keyId: key.id, uploadedBy: userId },
          });
          if (h.pii) await tx.coreAttachmentAccess.create({ data: { tenantId, attachmentId: row.id, userId, action: 'UPLOAD' } });
          await h.onUploaded?.(tx, ctx, row.id);
        }
      });
    } catch (err) {
      for (const s of stored) await this.storage.delete(s.storageKey).catch(() => undefined);
      throw err;
    }
    return this.list(tenantId, authId, entityType, entityId);
  }

  async listNamePatterns(tenantId: string, authId: string) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.tenantAdmin(tx, tenantId, authId);
      const supported: AttachmentTypeHandler[] = [];
      for (const handler of this.registry.list()) {
        if (!handler.resolveObjects) continue;
        if (handler.module !== 'core' && (!isTenantModuleId(handler.module) || !(await this.modules.isActive(tenantId, handler.module)))) continue;
        supported.push(handler);
      }
      const saved = await tx.coreAttachmentNamePattern.findMany({
        where: { tenantId, entityType: { in: supported.map((h) => h.entityType) } },
        select: { entityType: true, pattern: true },
      });
      const byType = new Map(saved.map((row) => [row.entityType, row.pattern]));
      return supported.map((h) => ({ entityType: h.entityType, pattern: byType.get(h.entityType) ?? DEFAULT_NAME_PATTERN }));
    });
  }

  async saveNamePattern(tenantId: string, authId: string, entityType: string, pattern: string) {
    await this.bulkHandler(tenantId, entityType);
    const compiled = compileNamePattern(pattern);
    if (!compiled.ok || !compiled.value.tokens.includes('type')) throw badRequest('core.files.pattern_invalid');
    await inTenantTx(this.prisma, tenantId, async (tx) => {
      const user = await this.tenantAdmin(tx, tenantId, authId);
      const before = await tx.coreAttachmentNamePattern.findUnique({
        where: { tenantId_entityType: { tenantId, entityType } },
      });
      const after = await tx.coreAttachmentNamePattern.upsert({
        where: { tenantId_entityType: { tenantId, entityType } },
        create: { tenantId, entityType, pattern: compiled.value.pattern, updatedBy: user.id },
        update: { pattern: compiled.value.pattern, updatedBy: user.id },
      });
      await this.audit.record(tx, {
        tenantId,
        campId: null,
        entityType: 'attachment_name_pattern',
        entityId: after.id,
        action: before ? CampAuditAction.UPDATE : CampAuditAction.CREATE,
        actorUserId: user.id,
        fields: ['pattern'],
        before,
        after,
      });
    });
    return this.listNamePatterns(tenantId, authId);
  }

  async previewBulk(tenantId: string, authId: string, entityType: string, files: readonly UploadedFile[]): Promise<{ items: AttachmentBulkPreviewItem[] }> {
    const handler = await this.bulkHandler(tenantId, entityType);
    if (files.length > MAX_BULK_ATTACHMENT_FILES) throw badRequest('core.files.too_many', { max: MAX_BULK_ATTACHMENT_FILES });
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      const userId = await this.me(tx, tenantId, authId);
      const plan = await this.bulkPlan(tx, tenantId, userId, handler, files);
      return { items: plan.map(({ fileName, objectCode, docType, docDate, status }) => ({ fileName, objectCode, docType, docDate, status })) };
    });
  }

  async commitBulk(tenantId: string, authId: string, entityType: string, files: readonly UploadedFile[]): Promise<{ uploaded: number }> {
    const handler = await this.bulkHandler(tenantId, entityType);
    if (files.length > MAX_BULK_ATTACHMENT_FILES) throw badRequest('core.files.too_many', { max: MAX_BULK_ATTACHMENT_FILES });
    const initial = await inTenantTx(this.prisma, tenantId, async (tx) => {
      const userId = await this.me(tx, tenantId, authId);
      const plan = await this.bulkPlan(tx, tenantId, userId, handler, files);
      this.assertBulkReady(plan);
      return plan;
    });

    const key = this.key();
    const stored: Array<{ storageKey: string; item: (typeof initial)[number] }> = [];
    try {
      for (const item of initial) {
        const storageKey = `attachments/${tenantId}/${randomUUID()}.bin`;
        await this.storage.put(storageKey, encryptFile(item.data, key));
        stored.push({ storageKey, item });
      }

      await inTenantTx(this.prisma, tenantId, async (tx) => {
        const userId = await this.me(tx, tenantId, authId);
        const plan = await this.bulkPlan(tx, tenantId, userId, handler, files);
        this.assertBulkReady(plan);
        if (plan.some((item, index) =>
          item.entityId !== stored[index]?.item.entityId ||
          item.docType !== stored[index]?.item.docType ||
          item.docDate !== stored[index]?.item.docDate
        )) throw badRequest('core.files.bulk_invalid');
        const locks = [...new Set(plan.map((item) => `${tenantId}:${entityType}:${item.entityId}:${item.docType}`))].sort();
        for (const lock of locks) await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${lock}, 0))`;
        const now = new Date();
        const counts = new Map<string, number>();
        for (const { item } of stored) {
          const entityId = item.entityId;
          const docType = item.docType;
          if (!entityId || !docType) throw badRequest('core.files.bulk_invalid');
          if (!counts.has(entityId)) {
            counts.set(entityId, await tx.coreAttachment.count({
              where: { tenantId, entityType, entityId, deletedAt: null, supersededAt: null },
            }));
          }
          const current = await tx.coreAttachment.findFirst({
            where: { tenantId, entityType, entityId, docType, deletedAt: null, supersededAt: null },
            select: { id: true },
          });
          if (!current) counts.set(entityId, counts.get(entityId)! + 1);
        }
        for (const [entityId, count] of counts) {
          if (count > handler.maxFiles) throw badRequest('core.files.too_many', { max: handler.maxFiles });
          if (!(await handler.canManage(tx, { tenantId, userId, entityId }))) throw notFound('core.files.not_found');
        }

        for (const [index, { storageKey, item: staged }] of stored.entries()) {
          const item = plan[index]!;
          const entityId = item.entityId;
          const docType = item.docType;
          if (!entityId || !docType) throw badRequest('core.files.bulk_invalid');
          const current = await tx.coreAttachment.findFirst({
            where: { tenantId, entityType, entityId, docType, deletedAt: null, supersededAt: null },
            select: { id: true },
          });
          if (current) await tx.coreAttachment.update({ where: { id: current.id }, data: { supersededAt: now } });
          const latest = await tx.coreAttachment.findFirst({
            where: { tenantId, entityType, entityId, docType },
            orderBy: { version: 'desc' },
            select: { version: true },
          });
          const row = await tx.coreAttachment.create({
            data: {
              tenantId, entityType, entityId, docType, version: (latest?.version ?? 0) + 1,
              docDate: item.docDate ? new Date(`${item.docDate}T00:00:00.000Z`) : null,
              fileName: staged.fileName, mimeType: staged.mime, sizeBytes: staged.data.length, sha256: staged.sha,
              storageKey, keyId: key.id, uploadedBy: userId,
            },
          });
          if (handler.pii) await tx.coreAttachmentAccess.create({ data: { tenantId, attachmentId: row.id, userId, action: 'UPLOAD' } });
          await handler.onUploaded?.(tx, { tenantId, userId, entityId }, row.id);
        }
      });
      return { uploaded: stored.length };
    } catch (err) {
      for (const file of stored) {
        try {
          await this.storage.delete(file.storageKey);
        } catch (cleanupError) {
          this.logger.error(`Bulk хавсралтын түр файл устгаж чадсангүй (${file.storageKey}): ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
        }
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw conflict('core.files.bulk_conflict');
      throw err;
    }
  }

  async download(tenantId: string, authId: string, id: string): Promise<{ fileName: string; mimeType: string; data: Buffer }> {
    const row = await inTenantTx(this.prisma, tenantId, async (tx) => {
      const userId = await this.me(tx, tenantId, authId);
      const att = await tx.coreAttachment.findFirst({ where: { id, tenantId, deletedAt: null } });
      if (!att) throw notFound('core.files.not_found');
      const h = await this.handler(tenantId, att.entityType);
      if (!(await h.canView(tx, { tenantId, userId, entityId: att.entityId }))) throw notFound('core.files.not_found');
      if (h.pii) await tx.coreAttachmentAccess.create({ data: { tenantId, attachmentId: att.id, userId, action: 'DOWNLOAD' } });
      return att;
    });
    const obj = await this.storage.get(row.storageKey);
    if (!obj) throw notFound('core.files.not_found');
    const chunks: Buffer[] = [];
    for await (const c of obj.stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c as Uint8Array));
    const key = this.key();
    if (key.id !== row.keyId) this.logger.warn(`Хавсралт ${row.id}: түлхүүр солигдсон (${row.keyId} ≠ ${key.id})`);
    let data: Buffer;
    try {
      data = decryptFile(Buffer.concat(chunks), key);
    } catch (err) {
      this.logger.error(`Хавсралт ${row.id} тайлж чадсангүй: ${(err as Error).message}`);
      throw notFound('core.files.not_found');
    }
    if (sha256Hex(data) !== row.sha256) {
      this.logger.error(`Хавсралт ${row.id}: hash зөрсөн`);
      throw notFound('core.files.not_found');
    }
    return { fileName: row.fileName, mimeType: row.mimeType, data };
  }

  async remove(tenantId: string, authId: string, id: string): Promise<{ ok: true }> {
    await inTenantTx(this.prisma, tenantId, async (tx) => {
      const userId = await this.me(tx, tenantId, authId);
      const att = await tx.coreAttachment.findFirst({ where: { id, tenantId, deletedAt: null } });
      if (!att) throw notFound('core.files.not_found');
      const h = await this.handler(tenantId, att.entityType);
      const ctx = { tenantId, userId, entityId: att.entityId };
      if (!(await h.canView(tx, ctx))) throw notFound('core.files.not_found');
      if (att.uploadedBy !== userId && !(await h.canManage(tx, ctx))) throw forbidden('core.files.forbidden');
      await tx.coreAttachment.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: userId } });
      if (h.pii) await tx.coreAttachmentAccess.create({ data: { tenantId, attachmentId: id, userId, action: 'DELETE' } });
    });
    return { ok: true };
  }

  /** Debug / мониторинг: хавсралтын нийт хэмжээ (DB) */
  async usage(tx: Tx, tenantId: string): Promise<{ files: number; bytes: number }> {
    const agg = await tx.coreAttachment.aggregate({ where: { tenantId, deletedAt: null }, _count: { _all: true }, _sum: { sizeBytes: true } });
    return { files: agg._count._all, bytes: agg._sum.sizeBytes ?? 0 };
  }

  private async handler(tenantId: string, entityType: string): Promise<AttachmentTypeHandler> {
    const h = this.registry.get(entityType);
    if (!h) throw notFound('core.files.type_unknown');
    if (h.module !== 'core' && (!isTenantModuleId(h.module) || !(await this.modules.isActive(tenantId, h.module)))) throw notFound('core.files.type_unknown');
    return h;
  }

  private async bulkHandler(tenantId: string, entityType: string): Promise<AttachmentTypeHandler> {
    const handler = await this.handler(tenantId, entityType);
    if (!handler.resolveObjects) throw notFound('core.files.type_unknown');
    return handler;
  }

  private async bulkPlan(tx: Tx, tenantId: string, userId: string, handler: AttachmentTypeHandler, files: readonly UploadedFile[]) {
    const saved = await tx.coreAttachmentNamePattern.findUnique({
      where: { tenantId_entityType: { tenantId, entityType: handler.entityType } },
      select: { pattern: true },
    });
    const compiled = compileNamePattern(saved?.pattern ?? DEFAULT_NAME_PATTERN);
    if (!compiled.ok || !compiled.value.tokens.includes('type')) throw new Error(`Хавсралтын нэрийн загвар буруу: ${handler.entityType}`);

    const prepared = files.map((file) => {
      if (file.data.length > handler.maxBytes) throw badRequest('core.files.too_large', { max: Math.round(handler.maxBytes / 1024 / 1024) });
      const fileName = safeFileName(file.fileName);
      const mime = detectFileType(file.data, fileName);
      if (!mime || !handler.mimeTypes.includes(mime)) throw badRequest('core.files.type_not_allowed', { name: fileName });
      const parsed = parseFileName(compiled.value, fileName);
      return { fileName, data: file.data, mime, sha: sha256Hex(file.data), parsed };
    });
    const codes = [...new Set(prepared.flatMap((item) => item.parsed ? [item.parsed.object] : []))];
    const objects = await handler.resolveObjects!(tx, tenantId, codes);
    const seen = new Set<string>();
    return Promise.all(prepared.map(async (item) => {
      const objectCode = item.parsed?.object ?? null;
      const entityId = objectCode ? objects.get(objectCode.toUpperCase()) : undefined;
      let status: AttachmentBulkPreviewItem['status'] = 'READY';
      if (!item.parsed || !item.parsed.type) status = 'INVALID_NAME';
      else if (!entityId || !(await handler.canView(tx, { tenantId, userId, entityId })) || !(await handler.canManage(tx, { tenantId, userId, entityId }))) status = 'OBJECT_NOT_FOUND';
      const docType = item.parsed?.type ?? null;
      if (status === 'READY' && entityId && docType) {
        const key = `${entityId}:${docType}`;
        if (seen.has(key)) status = 'DUPLICATE_IN_BATCH';
        seen.add(key);
      }
      return { ...item, objectCode, entityId: entityId ?? null, docType, docDate: item.parsed?.date ?? null, status };
    }));
  }

  private assertBulkReady<T extends { entityId: string | null; docType: string | null; status: AttachmentBulkPreviewItem['status'] }>(
    plan: T[],
  ): asserts plan is Array<T & { entityId: string; docType: string }> {
    if (plan.length === 0 || plan.some((item) => item.status !== 'READY')) throw badRequest('core.files.bulk_invalid');
  }

  private async tenantAdmin(tx: Tx, tenantId: string, authId: string) {
    const user = await tx.coreUser.findFirst({ where: { tenantId, authId, isActive: true }, select: { id: true, role: true } });
    if (!user || (user.role !== UserRole.OWNER && user.role !== UserRole.ADMIN)) throw forbidden('core.files.forbidden');
    return user;
  }

  private async me(tx: Tx, tenantId: string, authId: string): Promise<string> {
    const user = await tx.coreUser.findFirst({ where: { authId, tenantId, isActive: true }, select: { id: true } });
    if (!user) throw forbidden('camp.err.access.1');
    return user.id;
  }

  private async names(tx: Tx, tenantId: string, ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const users = await tx.coreUser.findMany({ where: { tenantId, id: { in: [...new Set(ids)] } }, select: { id: true, fullName: true, email: true } });
    return new Map(users.map((u) => [u.id, u.fullName?.trim() || u.email]));
  }

  private view(r: { id: string; fileName: string; mimeType: string; sizeBytes: number; docType: string | null; version: number; docDate: Date | null; uploadedBy: string; createdAt: Date }, names: Map<string, string>, canDelete: boolean): AttachmentView {
    return {
      id: r.id,
      fileName: r.fileName,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      docType: r.docType,
      version: r.version,
      docDate: r.docDate?.toISOString().slice(0, 10) ?? null,
      uploadedByName: names.get(r.uploadedBy) ?? null,
      createdAt: r.createdAt.toISOString(),
      canDelete,
    };
  }
}
