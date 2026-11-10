import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { getModuleManifest } from '../modules/module-registry';

type Tx = Prisma.TransactionClient;

export interface AttachmentAccessContext {
  tenantId: string;
  /** core_users.id */
  userId: string;
  entityId: string;
}

/**
 * v0.2.4 Блок 8 (FILE-01) — объектын төрөл бүрийн хавсралтын дүрэм. Модуль бүр өөрийн төрлийг бүртгэнэ.
 * Эрхийг объектын эрхээр шийднэ (хавсралтыг харах = объектыг харах эрх).
 */
export interface AttachmentTypeHandler {
  entityType: string;
  /** `TENANT_MODULES` id — модуль унтраалттай бол 404 */
  module: string;
  maxFiles: number;
  maxBytes: number;
  /** Зөвшөөрөгдсөн бодит төрөл (sniff) */
  mimeTypes: readonly string[];
  /** Хувийн мэдээлэлтэй (PII) — татах бүрийг хандалтын логт бичнэ */
  pii: boolean;
  /** Объект байхгүй эсвэл харах эрхгүй → false (404) */
  canView(tx: Tx, ctx: AttachmentAccessContext): Promise<boolean>;
  /** Оруулах / устгах */
  canManage(tx: Tx, ctx: AttachmentAccessContext): Promise<boolean>;
  /** Оруулсны дараа (жнь лого = тухайн хавсралт) — нэг transaction */
  onUploaded?(tx: Tx, ctx: AttachmentAccessContext, attachmentId: string): Promise<void>;
  /** Map filename object codes to entity IDs for preview/commit bulk uploads. */
  resolveObjects?(tx: Tx, tenantId: string, codes: readonly string[]): Promise<Map<string, string>>;
}

const ENTITY_TYPE_RE = /^[A-Z][A-Z0-9_]{1,59}$/;
export const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const DOCUMENT_MIMES = [
  ...IMAGE_MIMES,
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
] as const;

@Injectable()
export class AttachmentTypeRegistry {
  private readonly handlers = new Map<string, AttachmentTypeHandler>();

  register(h: AttachmentTypeHandler): void {
    if (!ENTITY_TYPE_RE.test(h.entityType)) throw new Error(`Attachment entity type буруу: ${h.entityType}`);
    const manifest = getModuleManifest(h.module);
    if (!manifest) throw new Error(`Attachment module manifest-д байхгүй: ${h.module}`);
    const declared = manifest.attachmentTypes?.find((type) => type.entityType === h.entityType);
    if (!declared) throw new Error(`Attachment type manifest-д бүртгэгдээгүй: ${h.entityType}`);
    if (declared.pii !== h.pii) throw new Error(`Attachment PII тохиргоо manifest-тэй зөрүүтэй: ${h.entityType}`);
    const existing = this.handlers.get(h.entityType);
    if (existing && existing.module !== h.module) throw new Error(`Attachment entity type давхардсан: ${h.entityType}`);
    this.handlers.set(h.entityType, h);
  }

  get(entityType: string): AttachmentTypeHandler | undefined {
    return this.handlers.get(entityType);
  }

  list(): AttachmentTypeHandler[] {
    return [...this.handlers.values()].sort((a, b) => a.entityType.localeCompare(b.entityType));
  }
}
