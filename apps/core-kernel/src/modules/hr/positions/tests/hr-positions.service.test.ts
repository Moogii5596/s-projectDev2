import { describe, it, expect, beforeEach } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CAMP_PERMISSIONS } from '../../../camp/common/camp-permissions';
import { expectTenantTx, setActor, setup } from '../../../camp/common/tests/camp-test-utils';
import { HrPositionsService, normName, resolvePositionByName } from '../hr-positions.service';

const P = CAMP_PERMISSIONS;

describe('v0.2.1 каталог — normName / resolvePositionByName', () => {
  it('normName: зай, том/жижиг үсэг үл хамаарна (DB-ийн lower(btrim) индекстэй нийцнэ)', () => {
    expect(normName('  Ахлах   Жолооч ')).toBe(normName('ахлах жолооч'));
    expect(normName('Жолооч')).not.toBe(normName('Жолоочийн туслах'));
  });

  it('resolvePositionByName: байгааг олно, байхгүй бол үүсгэнэ, идэвхгүйг (одоогийнх биш) → 400', async () => {
    const s = setup();
    s.tx.hrPosition.findMany.mockResolvedValue([{ id: 'p1', name: 'Жолооч', isActive: true }, { id: 'p2', name: 'Хуучин', isActive: false }]);
    expect(await resolvePositionByName(s.tx as never, 't1', ' жолооч ')).toEqual({ id: 'p1', name: 'Жолооч', created: false });
    await expect(resolvePositionByName(s.tx as never, 't1', 'хуучин')).rejects.toThrow(BadRequestException);
    expect(await resolvePositionByName(s.tx as never, 't1', 'хуучин', 'p2')).toMatchObject({ id: 'p2', created: false });
    s.tx.hrPosition.create.mockResolvedValueOnce({ id: 'p3', name: 'Тогооч' });
    expect(await resolvePositionByName(s.tx as never, 't1', '  Тогооч  ')).toEqual({ id: 'p3', name: 'Тогооч', created: true });
    expect(s.tx.hrPosition.create.mock.calls[0][0].data).toEqual({ tenantId: 't1', name: 'Тогооч' });
  });
});

describe('HrPositionsService — албан тушаалын каталог (v0.2.1 C-01 → v0.2.2 H1)', () => {
  let s: ReturnType<typeof setup>;
  let svc: HrPositionsService;
  beforeEach(() => {
    s = setup();
    svc = new HrPositionsService(s.prisma as never, s.access);
  });

  it('create: зөвхөн нэг кемпэд master.manage → 403 (байгууллагын каталог); админ → нэр нормчилж үүсгэнэ', async () => {
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.MASTER_MANAGE] }] });
    await expect(svc.create('t1', 'a1', { name: 'Жолооч' })).rejects.toThrow(ForbiddenException);
    setActor(s.tx, { role: UserRole.ADMIN });
    s.tx.hrPosition.findMany.mockResolvedValueOnce([]);
    await svc.create('t1', 'a1', { name: 'Ахлах   жолооч' });
    expectTenantTx(s.tx, 't1');
    expect(s.tx.hrPosition.create.mock.calls[0][0].data).toEqual({ tenantId: 't1', name: 'Ахлах жолооч' });
  });

  it('list: албан тушаал бүрт идэвхтэй ажилтны тоо; эрхгүй → 403', async () => {
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.REPORT_VIEW] }] });
    s.tx.hrPosition.findMany.mockResolvedValueOnce([{ id: 'p1', name: 'Жолооч', isActive: true }, { id: 'p2', name: 'Тогооч', isActive: true }]);
    s.tx.hrEmployee.groupBy.mockResolvedValueOnce([{ positionId: 'p1', _count: { _all: 4 } }]);
    const rows = await svc.list('t1', 'a1', { activeOnly: true });
    expect(s.tx.hrPosition.findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1', isActive: true });
    expect(rows.map((r) => [r.name, (r as { activeEmployees?: number }).activeEmployees])).toEqual([['Жолооч', 4], ['Тогооч', 0]]);
    setActor(s.tx, {});
    await expect(svc.list('t1', 'a1', {})).rejects.toThrow(ForbiddenException);
  });

});
