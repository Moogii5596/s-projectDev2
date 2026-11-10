import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { Readable } from 'node:stream';
import { PrismaClient, UserRole } from '@prisma/client';
import { AttachmentsService } from '../src/modules/core/attachments/attachments.service';
import { AttachmentTypeRegistry } from '../src/modules/core/attachments/attachment-type.registry';
import type { StorageService } from '../src/storage/storage.service';
import { ADMIN_DB_URL, APP_USER_DB_URL } from './helpers/db-urls';

describe('FILE-01 bulk attachments (integration)', () => {
  const admin = new PrismaClient({ datasources: { db: { url: ADMIN_DB_URL } } });
  const rls = new PrismaClient({ datasources: { db: { url: APP_USER_DB_URL } } });
  const blobs = new Map<string, Buffer>();
  const storage: StorageService = {
    put: async (key, data) => {
      blobs.set(key, Buffer.from(data));
      return { key, size: data.length, contentType: 'application/octet-stream' };
    },
    get: async (key) => {
      const data = blobs.get(key);
      return data ? { key, size: data.length, contentType: 'application/octet-stream', stream: Readable.from(data) } : null;
    },
    exists: async (key) => blobs.has(key),
    delete: async (key) => { blobs.delete(key); },
    usage: async () => ({ files: blobs.size, bytes: [...blobs.values()].reduce((sum, data) => sum + data.length, 0) }),
  };
  const registry = new AttachmentTypeRegistry();
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const modules = { isActive: vi.fn().mockResolvedValue(true) };
  const service = new AttachmentsService(rls as never, storage, registry, modules as never, audit as never);

  const suffix = randomUUID().slice(0, 8);
  const tenantIds: string[] = [];
  let tenantId: string;
  let otherTenantId: string;
  let ownerAuthId: string;
  let otherOwnerAuthId: string;
  let ownerId: string;
  let entityId: string;

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'integration-test-secret-with-at-least-32-characters';
    const makeTenant = async (label: string) =>
      (await admin.tenant.create({ data: { name: `Attachment ${label}`, slug: `attachment-${label}-${suffix}` } })).id;
    tenantId = await makeTenant('a');
    otherTenantId = await makeTenant('b');
    tenantIds.push(tenantId, otherTenantId);
    ownerAuthId = randomUUID();
    const owner = await admin.coreUser.create({
      data: { tenantId, authId: ownerAuthId, email: `${ownerAuthId}@example.com`, fullName: 'Attachment Owner', role: UserRole.OWNER },
    });
    ownerId = owner.id;
    otherOwnerAuthId = randomUUID();
    await admin.coreUser.create({
      data: { tenantId: otherTenantId, authId: otherOwnerAuthId, email: `other-${suffix}@example.com`, fullName: 'Other Owner', role: UserRole.OWNER },
    });
    entityId = randomUUID();

    registry.register({
      entityType: 'CAMP_MAINTENANCE',
      module: 'camp',
      maxFiles: 3,
      maxBytes: 10 * 1024 * 1024,
      mimeTypes: ['application/pdf'],
      pii: false,
      canView: async (_tx, ctx) => ctx.tenantId === tenantId && ctx.userId === ownerId && ctx.entityId === entityId,
      canManage: async (_tx, ctx) => ctx.tenantId === tenantId && ctx.userId === ownerId && ctx.entityId === entityId,
      resolveObjects: async (_tx, id, codes) =>
        id === tenantId && codes.some((code) => code.toUpperCase() === 'REQ-1')
          ? new Map([['REQ-1', entityId]])
          : new Map(),
    });
  });

  afterAll(async () => {
    for (const id of tenantIds) await admin.tenant.delete({ where: { id } }).catch(() => undefined);
    await admin.$disconnect();
    await rls.$disconnect();
  });

  const file = (name: string, body = '%PDF-1.4 test document') => ({ fileName: name, data: Buffer.from(body) });

  it('preview resolves object, type, and date while reporting invalid and unknown names', async () => {
    const preview = await service.previewBulk(tenantId, ownerAuthId, 'CAMP_MAINTENANCE', [
      file('REQ-1_REPORT_20261107.pdf'),
      file('REQ-404_REPORT_20261107.pdf'),
      file('not-a-pattern.pdf'),
    ]);

    expect(preview.items).toEqual([
      expect.objectContaining({ objectCode: 'REQ-1', docType: 'REPORT', docDate: '2026-11-07', status: 'READY' }),
      expect.objectContaining({ objectCode: 'REQ-404', status: 'OBJECT_NOT_FOUND' }),
      expect.objectContaining({ objectCode: null, status: 'INVALID_NAME' }),
    ]);
  });

  it('commits encrypted versions and keeps exactly one current version per document type', async () => {
    const first = file('REQ-1_REPORT_20261107.pdf', '%PDF-1.4 first');
    expect(await service.commitBulk(tenantId, ownerAuthId, 'CAMP_MAINTENANCE', [first])).toEqual({ uploaded: 1 });
    const second = file('REQ-1_REPORT_20261107.pdf', '%PDF-1.4 second');
    expect(await service.commitBulk(tenantId, ownerAuthId, 'CAMP_MAINTENANCE', [second])).toEqual({ uploaded: 1 });

    const rows = await admin.coreAttachment.findMany({
      where: { tenantId, entityType: 'CAMP_MAINTENANCE', entityId, docType: 'REPORT' },
      orderBy: { version: 'asc' },
    });
    expect(rows.map((row) => ({ version: row.version, current: row.supersededAt === null }))).toEqual([
      { version: 1, current: false },
      { version: 2, current: true },
    ]);
    expect(blobs.size).toBe(2);
    const downloaded = await service.download(tenantId, ownerAuthId, rows[1]!.id);
    expect(downloaded.data.toString()).toBe('%PDF-1.4 second');
  });

  it('rejects duplicate object/type pairs in one batch without writing rows', async () => {
    const before = await admin.coreAttachment.count({ where: { tenantId } });
    const storedBefore = blobs.size;

    await expect(service.commitBulk(tenantId, ownerAuthId, 'CAMP_MAINTENANCE', [
      file('REQ-1_REPORT_20261107.pdf'),
      file('REQ-1_REPORT_20261108.pdf'),
    ])).rejects.toMatchObject({ status: 400 });

    expect(await admin.coreAttachment.count({ where: { tenantId } })).toBe(before);
    expect(blobs.size).toBe(storedBefore);
  });

  it('stores tenant-specific name patterns and writes an audit entry', async () => {
    const result = await service.saveNamePattern(tenantId, ownerAuthId, 'CAMP_MAINTENANCE', '{object}_{type}');

    expect(result).toContainEqual({ entityType: 'CAMP_MAINTENANCE', pattern: '{object}_{type}' });
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      entityType: 'attachment_name_pattern',
      action: 'CREATE',
      actorUserId: ownerId,
    }));
    expect(await service.listNamePatterns(otherTenantId, otherOwnerAuthId)).toContainEqual({
      entityType: 'CAMP_MAINTENANCE',
      pattern: '{object}_{type}_{date}',
    });
    expect(await admin.coreAttachmentNamePattern.count({ where: { tenantId: otherTenantId } })).toBe(0);
  });
});
