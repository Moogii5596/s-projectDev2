import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import { AttachmentsService } from './attachments.service';
import { AttachmentTypeRegistry, IMAGE_MIMES, type AttachmentTypeHandler } from './attachment-type.registry';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9]);

function setup(opts: { view?: boolean; manage?: boolean; pii?: boolean } = {}) {
  vi.stubEnv('JWT_SECRET', 'y'.repeat(40));
  vi.stubEnv('FILE_ENCRYPTION_KEY', '');
  const disk = new Map<string, Buffer>();
  const rows: Array<Record<string, unknown>> = [];
  const patternRows: Array<Record<string, unknown>> = [];
  const access: unknown[] = [];
  const tx = {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn().mockResolvedValue([]),
    coreUser: { findFirst: vi.fn().mockResolvedValue({ id: 'u1', role: 'OWNER' }), findMany: vi.fn().mockResolvedValue([{ id: 'u1', fullName: 'Bat', email: 'b@x' }]) },
    coreAttachment: {
      count: vi.fn(async () => rows.filter((r) => !r.deletedAt && !r.supersededAt).length),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { const r = { id: `a${rows.length + 1}`, createdAt: new Date(), deletedAt: null, supersededAt: null, version: 1, docType: null, docDate: null, ...data }; rows.push(r); return r; }),
      findMany: vi.fn(async () => rows.filter((r) => !r.deletedAt)),
      findFirst: vi.fn(async ({ where, orderBy }: { where: Record<string, unknown>; orderBy?: { version?: 'desc' } }) => {
        const found = rows.filter((r) => Object.entries(where).every(([key, value]) => r[key] === value));
        if (orderBy?.version === 'desc') found.sort((a, b) => Number(b.version) - Number(a.version));
        return found[0] ?? null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(rows.find((r) => r.id === where.id)!, data)),
      updateMany: vi.fn(),
    },
    coreAttachmentNamePattern: {
      findMany: vi.fn(async () => patternRows),
      findUnique: vi.fn(async ({ where }: { where: { tenantId_entityType: { tenantId: string; entityType: string } } }) =>
        patternRows.find((r) => r.tenantId === where.tenantId_entityType.tenantId && r.entityType === where.tenantId_entityType.entityType) ?? null),
      upsert: vi.fn(async ({ where, create, update }: { where: { tenantId_entityType: { tenantId: string; entityType: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const found = patternRows.find((r) => r.tenantId === where.tenantId_entityType.tenantId && r.entityType === where.tenantId_entityType.entityType);
        if (found) return Object.assign(found, update);
        const row = { id: 'pattern-1', ...create };
        patternRows.push(row);
        return row;
      }),
    },
    coreAttachmentAccess: { create: vi.fn(async ({ data }: { data: unknown }) => access.push(data)) },
  };
  const prisma = { $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };
  const storage = {
    put: vi.fn(async (k: string, d: Buffer) => { disk.set(k, d); return { key: k, size: d.length, contentType: 'x' }; }),
    get: vi.fn(async (k: string) => (disk.has(k) ? { key: k, size: 0, contentType: 'x', stream: Readable.from([disk.get(k)!]) } : null)),
    delete: vi.fn(async (k: string) => { disk.delete(k); }),
  };
  const handler: AttachmentTypeHandler = {
    entityType: 'TEST_DOC', module: 'core', maxFiles: 2, maxBytes: 1024, mimeTypes: IMAGE_MIMES, pii: opts.pii ?? true,
    canView: async () => opts.view ?? true, canManage: async () => opts.manage ?? true,
    resolveObjects: async (_tx, _tenantId, codes) => new Map(codes.filter((code) => code === 'E1').map((code) => [code, 'e1'])),
  };
  const registry = new AttachmentTypeRegistry();
  vi.spyOn(registry, 'get').mockImplementation((entityType) => entityType === handler.entityType ? handler : undefined);
  vi.spyOn(registry, 'list').mockReturnValue([handler]);
  const audit = { record: vi.fn() };
  const svc = new AttachmentsService(prisma as never, storage as never, registry, { isActive: vi.fn() } as never, audit as never);
  return { svc, disk, rows, access, storage, tx, audit, patternRows };
}

describe('AttachmentsService (FILE-01)', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  describe('AttachmentTypeRegistry', () => {
    it('requires declared attachment types and matching PII classification', () => {
      const registry = new AttachmentTypeRegistry();
      expect(() => registry.register({
        entityType: 'UNDECLARED', module: 'core', maxFiles: 1, maxBytes: 100, mimeTypes: IMAGE_MIMES, pii: false,
        canView: async () => true, canManage: async () => true,
      })).toThrow('Attachment type manifest-д бүртгэгдээгүй: UNDECLARED');
      expect(() => registry.register({
        entityType: 'TENANT_LOGO', module: 'core', maxFiles: 1, maxBytes: 100, mimeTypes: IMAGE_MIMES, pii: true,
        canView: async () => true, canManage: async () => true,
      })).toThrow('Attachment PII тохиргоо manifest-тэй зөрүүтэй: TENANT_LOGO');
    });
  });

  it('шифрлэж хадгална, татахад эх байт буцна, PII хандалтыг бүртгэнэ', async () => {
    const res = await s.svc.upload('t1', 'auth', 'TEST_DOC', 'e1', [{ fileName: '../x.png', data: PNG }]);
    expect(res.items).toEqual([expect.objectContaining({ fileName: 'x.png', mimeType: 'image/png', sizeBytes: PNG.length, canDelete: true })]);
    const stored = [...s.disk.values()][0];
    expect(stored.includes(PNG.subarray(0, 8))).toBe(false);
    const file = await s.svc.download('t1', 'auth', 'a1');
    expect(file.data).toEqual(PNG);
    expect(s.access).toEqual([expect.objectContaining({ action: 'UPLOAD' }), expect.objectContaining({ action: 'DOWNLOAD' })]);
  });

  it('төрөл, хэмжээ, тоо, эрхийн шалгалт', async () => {
    await expect(s.svc.upload('t1', 'auth', 'TEST_DOC', 'e1', [{ fileName: 'a.png', data: Buffer.from('%PDF-1') }])).rejects.toMatchObject({ status: 400 });
    await expect(s.svc.upload('t1', 'auth', 'TEST_DOC', 'e1', [{ fileName: 'a.png', data: Buffer.concat([PNG, Buffer.alloc(2000)]) }])).rejects.toMatchObject({ status: 400 });
    await expect(s.svc.upload('t1', 'auth', 'TEST_DOC', 'e1', [1, 2, 3].map(() => ({ fileName: 'a.png', data: PNG })))).rejects.toMatchObject({ status: 400 });
    await expect(s.svc.upload('t1', 'auth', 'NOPE', 'e1', [{ fileName: 'a.png', data: PNG }])).rejects.toMatchObject({ status: 404 });
    const noView = setup({ view: false });
    await expect(noView.svc.list('t1', 'auth', 'TEST_DOC', 'e1')).rejects.toMatchObject({ status: 404 });
    const noManage = setup({ manage: false });
    await expect(noManage.svc.upload('t1', 'auth', 'TEST_DOC', 'e1', [{ fileName: 'a.png', data: PNG }])).rejects.toMatchObject({ status: 403 });
    expect(noManage.disk.size).toBe(0);
  });

  it('устгал = soft delete, дараа нь татахад 404', async () => {
    await s.svc.upload('t1', 'auth', 'TEST_DOC', 'e1', [{ fileName: 'x.png', data: PNG }]);
    await s.svc.remove('t1', 'auth', 'a1');
    expect(s.rows[0].deletedAt).toBeInstanceOf(Date);
    await expect(s.svc.download('t1', 'auth', 'a1')).rejects.toMatchObject({ status: 404 });
  });

  it('bulk preview rejects invalid names and commits documents as versions', async () => {
    const file = { fileName: 'E1_PHOTO_20261105.png', data: PNG };
    const preview = await s.svc.previewBulk('t1', 'auth', 'TEST_DOC', [file]);
    expect(preview.items).toEqual([expect.objectContaining({ objectCode: 'E1', docType: 'PHOTO', docDate: '2026-11-05', status: 'READY' })]);
    expect((await s.svc.previewBulk('t1', 'auth', 'TEST_DOC', [{ ...file, fileName: 'unknown.png' }])).items[0]?.status).toBe('INVALID_NAME');
    expect(await s.svc.commitBulk('t1', 'auth', 'TEST_DOC', [file])).toEqual({ uploaded: 1 });
    expect(await s.svc.commitBulk('t1', 'auth', 'TEST_DOC', [file])).toEqual({ uploaded: 1 });
    expect(s.rows.map((row) => ({ docType: row.docType, version: row.version, supersededAt: row.supersededAt instanceof Date }))).toEqual([
      { docType: 'PHOTO', version: 1, supersededAt: true },
      { docType: 'PHOTO', version: 2, supersededAt: false },
    ]);
  });

  it('only tenant admins can save a supported naming pattern and the change is audited', async () => {
    const saved = await s.svc.saveNamePattern('t1', 'auth', 'TEST_DOC', '{object}-{type}-{date}');
    expect(saved).toEqual([{ entityType: 'TEST_DOC', pattern: '{object}-{type}-{date}' }]);
    expect(s.tx.coreAttachmentNamePattern.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ tenantId: 't1', entityType: 'TEST_DOC', pattern: '{object}-{type}-{date}', updatedBy: 'u1' }),
    }));
    expect(s.audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      entityType: 'attachment_name_pattern',
      action: 'CREATE',
      fields: ['pattern'],
    }));
    await expect(s.svc.saveNamePattern('t1', 'auth', 'TEST_DOC', '{object}{type}')).rejects.toMatchObject({ status: 400 });
  });

  it('bulk upload never stores files when object resolution or access fails', async () => {
    const noAccess = setup({ view: false });
    const file = { fileName: 'E1_PHOTO_20261105.png', data: PNG };
    expect((await noAccess.svc.previewBulk('t1', 'auth', 'TEST_DOC', [file])).items[0]?.status).toBe('OBJECT_NOT_FOUND');
    await expect(noAccess.svc.commitBulk('t1', 'auth', 'TEST_DOC', [file])).rejects.toMatchObject({ status: 400 });
    expect(noAccess.storage.put).not.toHaveBeenCalled();
  });
});
