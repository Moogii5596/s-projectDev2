import { UserRole } from '@prisma/client';
import { badRequest } from '../../../common/i18n/app-error';
import { IMAGE_MIMES, type AttachmentTypeHandler } from './attachment-type.registry';

/** v0.2.4 SYS-01 + FILE-01: байгууллагын лого — entityId = tenantId; бүх хэрэглэгч харна, tenant admin солино */
export const TENANT_LOGO_ATTACHMENT: AttachmentTypeHandler = {
  entityType: 'TENANT_LOGO',
  module: 'core',
  maxFiles: 1,
  maxBytes: 2 * 1024 * 1024,
  mimeTypes: IMAGE_MIMES,
  pii: false,
  canView: async (_tx, ctx) => ctx.entityId === ctx.tenantId,
  canManage: async (tx, ctx) => {
    if (ctx.entityId !== ctx.tenantId) return false;
    const u = await tx.coreUser.findFirst({ where: { tenantId: ctx.tenantId, id: ctx.userId, isActive: true }, select: { role: true } });
    return u?.role === UserRole.OWNER || u?.role === UserRole.ADMIN;
  },
  onUploaded: async (tx, ctx, attachmentId) => {
    // Тохиргооны мөрийг /settings/profile уншихад (GET) үүсгэдэг — лого тэр хуудаснаас оруулна
    const n = await tx.$executeRaw`
      UPDATE core_tenant_settings SET logo_path = ${`attachment:${attachmentId}`}, updated_at = now() WHERE tenant_id = ${ctx.tenantId}::uuid`;
    if (n === 0) throw badRequest('core.settings.tenant_not_found');
  },
};
