import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { auditValue, buildAuditRow, computeAuditDiff, resolveAuditAction } from '../camp-audit.service';
import { setActor, setup } from './camp-test-utils';

describe('auditValue', () => {
  it('огноо (шөнө дунд) → YYYY-MM-DD, цагтай → ISO; Decimal → текст; массив → JSON; undefined → null', () => {
    expect(auditValue(new Date('2026-10-07T00:00:00.000Z'))).toBe('2026-10-07');
    expect(auditValue(new Date('2026-10-07T05:06:07.000Z'))).toBe('2026-10-07T05:06:07.000Z');
    expect(auditValue(new Prisma.Decimal('10.50'))).toBe('10.5');
    expect(auditValue([{ dayFrom: 1 }])).toBe('[{"dayFrom":1}]');
    expect(auditValue(undefined)).toBeNull();
    expect(auditValue(0)).toBe(0);
    expect(auditValue(false)).toBe(false);
  });
});

describe('computeAuditDiff', () => {
  const F = ['code', 'name', 'isActive', 'floor'] as const;
  it('үүсгэлт: null биш талбар бүр {from: null, to}', () => {
    expect(computeAuditDiff(null, { code: 'A', name: null, isActive: true, floor: 0, id: 'x' }, F)).toEqual({
      code: { from: null, to: 'A' },
      isActive: { from: null, to: true },
      floor: { from: null, to: 0 },
    });
  });
  it('засвар: зөвхөн өөрчлөгдсөн, жагсаалтад байгаа талбар (id, updatedAt үл тооно)', () => {
    expect(
      computeAuditDiff({ code: 'A', name: 'x', isActive: true, updatedAt: 1 }, { code: 'A', name: 'y', isActive: true, updatedAt: 2 }, F),
    ).toEqual({ name: { from: 'x', to: 'y' } });
  });
});

describe('resolveAuditAction / buildAuditRow', () => {
  it('isActive true→false эсвэл status → INACTIVE = DEACTIVATE; бусад UPDATE хэвээр; CREATE хэвээр', () => {
    expect(resolveAuditAction('UPDATE', { isActive: { from: true, to: false } })).toBe('DEACTIVATE');
    expect(resolveAuditAction('UPDATE', { isActive: { from: false, to: true } })).toBe('UPDATE');
    expect(resolveAuditAction('UPDATE', { status: { from: 'ACTIVE', to: 'INACTIVE' } })).toBe('DEACTIVATE');
    expect(resolveAuditAction('CREATE', { isActive: { from: true, to: false } })).toBe('CREATE');
  });
  it('өөрчлөлтгүй UPDATE → null; IMPORT/CREATE → мөр (summary_key үйлдлээр)', () => {
    const base = { tenantId: 't1', campId: 'c1', entityType: 'room' as const, entityId: 'r1', actorUserId: 'u1', fields: ['roomNo'] };
    expect(buildAuditRow({ ...base, action: 'UPDATE', before: { roomNo: '1' }, after: { roomNo: '1' } })).toBeNull();
    expect(buildAuditRow({ ...base, action: 'IMPORT', before: null, after: { roomNo: '1' }, importId: 'i1' })).toMatchObject({
      action: 'IMPORT', summaryKey: 'audit.room.import', importId: 'i1', diff: { roomNo: { from: null, to: '1' } },
    });
  });
});

describe('CampAuditService.record/recordMany', () => {
  it('record: бизнесийн tx-ээр бичнэ; өөрчлөлтгүй бол бичихгүй; recordMany createMany нэг удаа', async () => {
    const s = setup();
    setActor(s.tx, {});
    const base = { tenantId: 't1', campId: 'c1', entityType: 'crew' as const, entityId: 'x', actorUserId: 'u1', fields: ['code'] };
    await s.audit.record(s.tx as never, { ...base, action: 'UPDATE', before: { code: 'A' }, after: { code: 'A' } });
    expect(s.tx.campAuditLog.create).not.toHaveBeenCalled();
    await s.audit.record(s.tx as never, { ...base, action: 'UPDATE', before: { code: 'A' }, after: { code: 'B' } });
    expect(s.tx.campAuditLog.create.mock.calls[0][0].data).toMatchObject({ tenantId: 't1', summaryKey: 'audit.crew.update' });
    s.tx.campAuditLog.createMany.mockResolvedValueOnce({ count: 1 });
    const n = await s.audit.recordMany(s.tx as never, [
      { ...base, action: 'IMPORT', after: { code: 'C' } },
      { ...base, action: 'UPDATE', before: { code: 'C' }, after: { code: 'C' } },
    ]);
    expect(n).toBe(1);
    expect(s.tx.campAuditLog.createMany.mock.calls[0][0].data).toHaveLength(1);
  });
});
