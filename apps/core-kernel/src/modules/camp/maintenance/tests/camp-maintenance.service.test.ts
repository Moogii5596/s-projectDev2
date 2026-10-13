import { describe, it, expect, beforeEach } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CampAssetCondition, CampMaintenanceStatus as S, CampPartSource, CampRoomStatus, Prisma, UserRole } from '@prisma/client';
import { CAMP_PERMISSIONS } from '../../common/camp-permissions';
import { expectTenantTx, setActor, setup } from '../../common/tests/camp-test-utils';
import { todayUb } from '../../common/camp-date';
import { CampMaintenanceService, costPreview } from '../camp-maintenance.service';
import { formatRequestNo, requestNoPrefix, TRANSITIONS } from '../maintenance-flow';

const P = CAMP_PERMISSIONS;
const CAMP = { id: 'c1', code: 'C1', name: 'Кемп 1', isActive: true };
const D = (v: string | number) => new Prisma.Decimal(v);

const REQ = {
  id: 'm1',
  campId: 'c1',
  requestNo: 'ZAS-C1-2026-0007',
  roomId: 'r1',
  assetId: null,
  title: 'Цорго гоожиж байна',
  description: null,
  priority: 'MEDIUM',
  status: S.OPEN,
  blocksRoom: true,
  reportedBy: 'cu-rep',
  startedAt: null,
  completedAt: null,
  closedBy: null,
  closedAt: null,
  cancelReason: null,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T00:00:00Z'),
  room: { roomNo: '101', status: CampRoomStatus.MAINTENANCE, building: { code: 'B1' } },
  asset: null,
  reportedByUser: { fullName: 'Бат', email: 'bat@x.mn' },
};

const part = (id: string, source: CampPartSource, qty: string, price: string | null, vatIncluded = true) => ({
  id,
  partName: `Сэлбэг ${id}`,
  quantity: D(qty),
  unit: 'ш',
  unitPrice: price === null ? null : D(price),
  vatIncluded,
  source,
  createdBy: 'cu1',
  createdAt: new Date('2026-10-02T00:00:00Z'),
  updatedAt: new Date('2026-10-02T00:00:00Z'),
});

/** $executeRaw дуудлагуудын SQL текст */
const rawSqls = (s: ReturnType<typeof setup>) => s.tx.$executeRaw.mock.calls.map((c) => (c[0] as TemplateStringsArray).join('?'));

describe('maintenance-flow (Шат 4.4)', () => {
  it('дугаар: ZAS-{code}-{YYYY}-{0001}, 9999-өөс хойш өргөснө', () => {
    expect(formatRequestNo('C1', '2026', 1)).toBe('ZAS-C1-2026-0001');
    expect(formatRequestNo('UB_2', '2026', 10000)).toBe('ZAS-UB_2-2026-10000');
    expect(requestNoPrefix('C1', '2027')).toBe('ZAS-C1-2027-');
  });

  it('шилжилтийн хүснэгт: батлагдсан урсгал, эрх, өрөөний нөлөө', () => {
    expect(TRANSITIONS.start).toMatchObject({ from: [S.OPEN], to: S.IN_PROGRESS, perms: [P.MAINTENANCE_PARTS], room: 'none' });
    expect(TRANSITIONS.complete).toMatchObject({ from: [S.IN_PROGRESS], to: S.DONE, perms: [P.MAINTENANCE_PARTS], room: 'release' });
    expect(TRANSITIONS.reopen).toMatchObject({ from: [S.DONE], to: S.IN_PROGRESS, perms: [P.MAINTENANCE_CLOSE], room: 'lock' });
    expect(TRANSITIONS.close).toMatchObject({ from: [S.DONE], to: S.CLOSED, perms: [P.MAINTENANCE_CLOSE], room: 'none' });
    expect(TRANSITIONS.cancel).toMatchObject({ from: [S.OPEN, S.IN_PROGRESS], to: S.CANCELLED, reporterMay: true, room: 'release' });
    // CLOSED/CANCELLED-оос гарах шилжилт байхгүй
    for (const r of Object.values(TRANSITIONS)) {
      expect(r.from).not.toContain(S.CLOSED);
      expect(r.from).not.toContain(S.CANCELLED);
    }
  });

  it('costPreview: зөвхөн CATERING_PURCHASED, мөр бүрийг тоймлоод нийлүүлнэ', () => {
    const p = costPreview(
      [
        part('p1', CampPartSource.CATERING_PURCHASED, '2', '11000', true), // gross 22000 → net 20000
        part('p2', CampPartSource.CATERING_PURCHASED, '1.5', '1000', false), // net 1500 → vat 150
        part('p3', CampPartSource.MINE_SUPPLIED, '5', '99999'),
        part('p4', CampPartSource.MINE_SUPPLIED, '1', null),
      ],
      D(10),
    );
    expect(p.vatRate).toBe('10.00');
    expect(p.lines.map((l) => l.partId)).toEqual(['p1', 'p2']);
    expect(p.lines[0]).toMatchObject({ net: '20000.00', vat: '2000.00', gross: '22000.00' });
    expect(p.total).toEqual({ net: '21500.00', vat: '2150.00', gross: '23650.00' });
    expect(costPreview([], 10).total).toEqual({ net: '0.00', vat: '0.00', gross: '0.00' });
  });
});

describe('CampMaintenanceService — үүсгэх (Шат 4.4)', () => {
  let s: ReturnType<typeof setup>;
  let svc: CampMaintenanceService;
  beforeEach(() => {
    s = setup();
    svc = new CampMaintenanceService(s.prisma as never, s.access);
    setActor(s.tx, { userId: 'cu-rep', roles: [{ campId: 'c1', perms: [P.MAINTENANCE_CREATE] }] });
    s.tx.camp.findFirst.mockResolvedValue(CAMP);
    s.tx.campRoom.findFirst.mockResolvedValue({ id: 'r1', roomNo: '101', status: CampRoomStatus.ACTIVE });
    s.tx.campMaintenanceRequest.create.mockResolvedValue({ id: 'm1' });
    s.tx.campMaintenanceRequest.findFirst.mockResolvedValue(REQ);
    s.tx.$queryRaw.mockResolvedValue([{ max: 41 }]);
  });

  it('дугаар: advisory lock (кемп+он) → MAX+1; анхны нь 0001', async () => {
    const year = todayUb().slice(0, 4);
    await svc.create('t1', 'a1', 'c1', { roomId: 'r1', title: 'T' });
    expectTenantTx(s.tx, 't1');
    const lock = s.tx.$executeRaw.mock.calls.find((c) => (c[0] as TemplateStringsArray).join('?').includes('pg_advisory_xact_lock'));
    expect(lock?.[1]).toBe(`camp-maintenance-no:t1:c1:${year}`);
    const q = s.tx.$queryRaw.mock.calls[0];
    expect((q[0] as TemplateStringsArray).join('?')).toContain('starts_with(request_no, ?)');
    expect(q).toContain(`ZAS-C1-${year}-`);
    expect(s.tx.campMaintenanceRequest.create.mock.calls[0][0].data).toMatchObject({
      tenantId: 't1', campId: 'c1', requestNo: `ZAS-C1-${year}-0042`, roomId: 'r1', assetId: null, blocksRoom: false, reportedBy: 'cu-rep',
    });
    s.tx.$queryRaw.mockResolvedValueOnce([{ max: null }]);
    await svc.create('t1', 'a1', 'c1', { roomId: 'r1', title: 'T' });
    expect(s.tx.campMaintenanceRequest.create.mock.calls[1][0].data.requestNo).toBe(`ZAS-C1-${year}-0001`);
  });

  it('blocksRoom = false → өрөөг хөндөхгүй', async () => {
    await svc.create('t1', 'a1', 'c1', { roomId: 'r1', title: 'T' });
    expect(s.tx.campRoom.update).not.toHaveBeenCalled();
    expect(rawSqls(s).some((q) => q.includes('FOR UPDATE'))).toBe(false);
  });

  it('blocksRoom = true → өрөөний мөрийг түгжээд ACTIVE → MAINTENANCE; хүн байрлаж байвал анхааруулга', async () => {
    s.tx.campRoomAllocation.count.mockResolvedValueOnce(2);
    const res = await svc.create('t1', 'a1', 'c1', { roomId: 'r1', title: 'T', blocksRoom: true });
    expect(rawSqls(s).some((q) => q.includes('FROM camp_rooms') && q.includes('FOR UPDATE'))).toBe(true);
    expect(s.tx.campRoom.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { status: 'MAINTENANCE' } });
    expect(res.warnings).toEqual([expect.stringContaining('2 хүн')]);
    expect(s.tx.campMaintenanceRequest.create.mock.calls[0][0].data.blocksRoom).toBe(true);
  });

  it('blocksRoom: өрөө аль хэдийн MAINTENANCE → дахин update хийхгүй; INACTIVE → 409', async () => {
    s.tx.campRoom.findFirst
      .mockResolvedValueOnce({ id: 'r1' })
      .mockResolvedValueOnce({ roomNo: '101', status: CampRoomStatus.MAINTENANCE });
    await svc.create('t1', 'a1', 'c1', { roomId: 'r1', title: 'T', blocksRoom: true });
    expect(s.tx.campRoom.update).not.toHaveBeenCalled();
    s.tx.campRoom.findFirst.mockResolvedValueOnce({ id: 'r1' }).mockResolvedValueOnce({ roomNo: '101', status: CampRoomStatus.INACTIVE });
    await expect(svc.create('t1', 'a1', 'c1', { roomId: 'r1', title: 'T', blocksRoom: true })).rejects.toThrow(ConflictException);
  });

  it('хөрөнгө: зөвхөн хөрөнгө өгвөл түүний өрөө; актлагдсан → 409; өөр өрөөнд → 400; агуулахад + blocksRoom → 400', async () => {
    s.tx.campAsset.findFirst.mockResolvedValueOnce({ inventoryNo: 'INV-1', roomId: 'r5', condition: CampAssetCondition.GOOD });
    await svc.create('t1', 'a1', 'c1', { assetId: 'as1', title: 'T' });
    expect(s.tx.campMaintenanceRequest.create.mock.calls[0][0].data).toMatchObject({ roomId: 'r5', assetId: 'as1' });

    s.tx.campAsset.findFirst.mockResolvedValueOnce({ inventoryNo: 'INV-1', roomId: 'r5', condition: CampAssetCondition.WRITTEN_OFF });
    await expect(svc.create('t1', 'a1', 'c1', { assetId: 'as1', title: 'T' })).rejects.toThrow(ConflictException);
    s.tx.campAsset.findFirst.mockResolvedValueOnce({ inventoryNo: 'INV-1', roomId: 'r5', condition: CampAssetCondition.GOOD });
    await expect(svc.create('t1', 'a1', 'c1', { assetId: 'as1', roomId: 'r1', title: 'T' })).rejects.toThrow(/өөр өрөөнд/);
    s.tx.campAsset.findFirst.mockResolvedValueOnce({ inventoryNo: 'INV-1', roomId: null, condition: CampAssetCondition.GOOD });
    await expect(svc.create('t1', 'a1', 'c1', { assetId: 'as1', title: 'T', blocksRoom: true })).rejects.toThrow(BadRequestException);
    await expect(svc.create('t1', 'a1', 'c1', { assetId: 'nope', title: 'T' })).rejects.toThrow(/Хөрөнгө энэ кемпэд олдсонгүй/);
  });

  it('зорилтгүй → 400; өөр кемпийн өрөө → 400; эрхгүй → 403', async () => {
    await expect(svc.create('t1', 'a1', 'c1', { title: 'T' })).rejects.toThrow(BadRequestException);
    s.tx.campRoom.findFirst.mockResolvedValueOnce(null);
    await expect(svc.create('t1', 'a1', 'c1', { roomId: 'rX', title: 'T' })).rejects.toThrow(/Өрөө энэ кемпэд олдсонгүй/);
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.MAINTENANCE_PARTS] }] });
    await expect(svc.create('t1', 'a1', 'c1', { roomId: 'r1', title: 'T' })).rejects.toThrow(ForbiddenException);
    expect(s.tx.campMaintenanceRequest.create).not.toHaveBeenCalled();
  });
});

describe('CampMaintenanceService — төлөв шилжилт (Шат 4.4)', () => {
  let s: ReturnType<typeof setup>;
  let svc: CampMaintenanceService;
  const withStatus = (status: S, extra: Partial<typeof REQ> = {}) => s.tx.campMaintenanceRequest.findFirst.mockResolvedValue({ ...REQ, status, ...extra });
  beforeEach(() => {
    s = setup();
    svc = new CampMaintenanceService(s.prisma as never, s.access);
    setActor(s.tx, { userId: 'cu1', roles: [{ campId: 'c1', perms: [P.MAINTENANCE_PARTS, P.MAINTENANCE_CLOSE, P.MAINTENANCE_CREATE] }] });
    s.tx.campSetting.findFirst.mockResolvedValue({ vatRate: D(10), cateringOrganizationId: 'org-cat' });
    s.tx.campRoom.findFirst.mockResolvedValue({ roomNo: '101', status: CampRoomStatus.ACTIVE });
  });

  it('start: OPEN → IN_PROGRESS (optimistic where status, startedAt); өрөөг хөндөхгүй', async () => {
    withStatus(S.OPEN);
    await svc.transition('t1', 'a1', 'c1', 'm1', 'start');
    const call = s.tx.campMaintenanceRequest.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'm1', tenantId: 't1', status: 'OPEN' });
    expect(call.data.status).toBe('IN_PROGRESS');
    expect(call.data.startedAt).toBeInstanceOf(Date);
    expect(s.tx.campRoom.updateMany).not.toHaveBeenCalled();
    expect(s.tx.campRoom.update).not.toHaveBeenCalled();
  });

  it('буруу төлөвөөс → 409 (update хийхгүй); зэрэгцээ өөрчлөлт (0 мөр) → 409', async () => {
    withStatus(S.DONE);
    await expect(svc.transition('t1', 'a1', 'c1', 'm1', 'start')).rejects.toThrow(/Дууссан төлөвөөс/);
    withStatus(S.CLOSED);
    await expect(svc.transition('t1', 'a1', 'c1', 'm1', 'cancel', { reason: 'x' })).rejects.toThrow(ConflictException);
    expect(s.tx.campMaintenanceRequest.updateMany).not.toHaveBeenCalled();
    withStatus(S.OPEN);
    s.tx.campMaintenanceRequest.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(svc.transition('t1', 'a1', 'c1', 'm1', 'start')).rejects.toThrow(/төлөв өөрчлөгдсөн/);
  });

  it('эрх: start/complete = parts, reopen/close = close; олдохгүй → 404 (эрх шалгасны дараа)', async () => {
    setActor(s.tx, { userId: 'cu1', roles: [{ campId: 'c1', perms: [P.MAINTENANCE_CLOSE, P.MAINTENANCE_CREATE] }] });
    withStatus(S.OPEN);
    await expect(svc.transition('t1', 'a1', 'c1', 'm1', 'start')).rejects.toThrow(ForbiddenException);
    setActor(s.tx, { userId: 'cu1', roles: [{ campId: 'c1', perms: [P.MAINTENANCE_PARTS] }] });
    withStatus(S.DONE);
    await expect(svc.transition('t1', 'a1', 'c1', 'm1', 'close')).rejects.toThrow(ForbiddenException);
    await expect(svc.transition('t1', 'a1', 'c1', 'm1', 'reopen')).rejects.toThrow(ForbiddenException);
    setActor(s.tx, { role: UserRole.ADMIN });
    s.tx.campMaintenanceRequest.findFirst.mockResolvedValueOnce(null);
    await expect(svc.transition('t1', 'a1', 'c1', 'nope', 'start')).rejects.toThrow(NotFoundException);
  });

  it('complete: IN_PROGRESS → DONE; өөр түгжих засваргүй бол өрөөг ACTIVE болгоно', async () => {
    withStatus(S.IN_PROGRESS);
    s.tx.campMaintenanceRequest.count.mockResolvedValueOnce(0);
    const res = await svc.transition('t1', 'a1', 'c1', 'm1', 'complete');
    expect(s.tx.campMaintenanceRequest.updateMany.mock.calls[0][0].data.completedAt).toBeInstanceOf(Date);
    expect(s.tx.campMaintenanceRequest.count.mock.calls[0][0].where).toEqual({
      tenantId: 't1', roomId: 'r1', blocksRoom: true, status: { in: ['OPEN', 'IN_PROGRESS'] }, NOT: { id: 'm1' },
    });
    expect(s.tx.campRoom.updateMany).toHaveBeenCalledWith({ where: { id: 'r1', tenantId: 't1', status: 'MAINTENANCE' }, data: { status: 'ACTIVE' } });
    expect(rawSqls(s).some((q) => q.includes('FOR UPDATE'))).toBe(true);
    expect(res.roomReleased).toBe(true);
  });

  it('complete: өөр нээлттэй түгжих засвар байвал өрөө MAINTENANCE хэвээр', async () => {
    withStatus(S.IN_PROGRESS);
    s.tx.campMaintenanceRequest.count.mockResolvedValueOnce(1);
    const res = await svc.transition('t1', 'a1', 'c1', 'm1', 'complete');
    expect(s.tx.campRoom.updateMany).not.toHaveBeenCalled();
    expect(res.roomReleased).toBe(false);
  });

  it('complete: blocksRoom = false → өрөөг хөндөхгүй', async () => {
    withStatus(S.IN_PROGRESS, { blocksRoom: false });
    await svc.transition('t1', 'a1', 'c1', 'm1', 'complete');
    expect(s.tx.campMaintenanceRequest.count).not.toHaveBeenCalled();
    expect(s.tx.campRoom.updateMany).not.toHaveBeenCalled();
  });

  it('reopen: DONE → IN_PROGRESS, completedAt арилна, өрөөг дахин түгжинэ; INACTIVE өрөө → 409 (төлөв өөрчлөхгүй)', async () => {
    withStatus(S.DONE);
    await svc.transition('t1', 'a1', 'c1', 'm1', 'reopen');
    expect(s.tx.campMaintenanceRequest.updateMany.mock.calls[0][0].data).toEqual({ status: 'IN_PROGRESS', completedAt: null });
    expect(s.tx.campRoom.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { status: 'MAINTENANCE' } });
    s.tx.campRoom.findFirst.mockResolvedValueOnce({ roomNo: '101', status: CampRoomStatus.INACTIVE });
    await expect(svc.transition('t1', 'a1', 'c1', 'm1', 'reopen')).rejects.toThrow(ConflictException);
    expect(s.tx.campMaintenanceRequest.updateMany).toHaveBeenCalledTimes(1);
  });

  it('cancel: шалтгаан хадгална, өрөөг суллана; шалтгаангүй → 400', async () => {
    withStatus(S.IN_PROGRESS);
    await svc.transition('t1', 'a1', 'c1', 'm1', 'cancel', { reason: 'Давхар бүртгэл' });
    expect(s.tx.campMaintenanceRequest.updateMany.mock.calls[0][0].data).toEqual({ status: 'CANCELLED', cancelReason: 'Давхар бүртгэл' });
    expect(s.tx.campRoom.updateMany).toHaveBeenCalled();
    await expect(svc.transition('t1', 'a1', 'c1', 'm1', 'cancel')).rejects.toThrow(BadRequestException);
  });

  it('cancel: үүсгэсэн хүн (create эрхтэй) close эрхгүй ч цуцална; өөр хүн → 403', async () => {
    setActor(s.tx, { userId: 'cu-rep', roles: [{ campId: 'c1', perms: [P.MAINTENANCE_CREATE] }] });
    withStatus(S.OPEN);
    await svc.transition('t1', 'a1', 'c1', 'm1', 'cancel', { reason: 'Буруу' });
    expect(s.tx.campMaintenanceRequest.updateMany).toHaveBeenCalledTimes(1);
    setActor(s.tx, { userId: 'cu-other', roles: [{ campId: 'c1', perms: [P.MAINTENANCE_CREATE] }] });
    await expect(svc.transition('t1', 'a1', 'c1', 'm1', 'cancel', { reason: 'Буруу' })).rejects.toThrow(/Зөвхөн хүсэлт үүсгэсэн/);
    setActor(s.tx, { userId: 'cu-rep', roles: [{ campId: 'c1', perms: [P.REPORT_VIEW] }] });
    await expect(svc.transition('t1', 'a1', 'c1', 'm1', 'cancel', { reason: 'Буруу' })).rejects.toThrow(ForbiddenException);
  });

  it('close: зөвхөн катерингийн сэлбэгийн зардал (катеринг байгууллага, НӨАТ, өнөөдөр, хаасан хүн) — төлвийг ЭХЛЭЭД CLOSED', async () => {
    withStatus(S.DONE);
    s.tx.campMaintenancePart.findMany.mockResolvedValue([
      part('p1', CampPartSource.CATERING_PURCHASED, '2', '11000', true),
      part('p2', CampPartSource.MINE_SUPPLIED, '1', '5000'),
      part('p3', CampPartSource.CATERING_PURCHASED, '3', '1000', false),
    ]);
    s.tx.campCostEntry.createMany.mockResolvedValueOnce({ count: 2 });
    const res = await svc.transition('t1', 'a1', 'c1', 'm1', 'close');

    const upd = s.tx.campMaintenanceRequest.updateMany.mock.calls[0][0];
    expect(upd.data).toMatchObject({ status: 'CLOSED', closedBy: 'cu1' });
    expect(upd.data.closedAt).toBeInstanceOf(Date);
    // race: status update нь сэлбэг уншихаас ӨМНӨ
    expect(s.tx.campMaintenanceRequest.updateMany.mock.invocationCallOrder[0]).toBeLessThan(s.tx.campMaintenancePart.findMany.mock.invocationCallOrder[0]);

    const rows = s.tx.campCostEntry.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(2);
    expect(rows.map((r: { maintenancePartId: string }) => r.maintenancePartId)).toEqual(['p1', 'p3']);
    expect(rows[0]).toMatchObject({
      tenantId: 't1', campId: 'c1', source: 'MAINTENANCE_PART', organizationId: 'org-cat', createdBy: 'cu1',
      costDate: new Date(`${todayUb()}T00:00:00.000Z`), description: 'ZAS-C1-2026-0007: Сэлбэг p1', unit: 'ш',
    });
    expect(rows[0].netAmount.toFixed(2)).toBe('20000.00');
    expect(rows[0].grossAmount.toFixed(2)).toBe('22000.00');
    expect(rows[1].vatAmount.toFixed(2)).toBe('300.00');
    expect(rows[1].vatRate.toFixed(2)).toBe('10.00');
    expect(res.costEntries).toBe(2);
    // хаахад өрөөг хөндөхгүй (complete-д аль хэдийн суллагдсан)
    expect(s.tx.campRoom.updateMany).not.toHaveBeenCalled();
  });

  it('close: катерингийн сэлбэг байгаа ч тохиргоонд катеринг байгууллагагүй → 409; зөвхөн уурхайн сэлбэг бол шаардахгүй', async () => {
    withStatus(S.DONE);
    s.tx.campSetting.findFirst.mockResolvedValue({ vatRate: D(10), cateringOrganizationId: null });
    s.tx.campMaintenancePart.findMany.mockResolvedValueOnce([part('p1', CampPartSource.CATERING_PURCHASED, '1', '100')]);
    await expect(svc.transition('t1', 'a1', 'c1', 'm1', 'close')).rejects.toThrow(/катерингийн үйлчилгээ үзүүлэгч/);
    expect(s.tx.campCostEntry.createMany).not.toHaveBeenCalled();

    s.tx.campMaintenancePart.findMany.mockResolvedValueOnce([part('p2', CampPartSource.MINE_SUPPLIED, '1', null)]);
    const res = await svc.transition('t1', 'a1', 'c1', 'm1', 'close');
    expect(res.costEntries).toBe(0);
    expect(s.tx.campCostEntry.createMany).not.toHaveBeenCalled();
  });

  it('close: тохиргоо байхгүй бол НӨАТ 10% анхдагч', async () => {
    withStatus(S.DONE);
    s.tx.campSetting.findFirst.mockResolvedValue(null);
    s.tx.campMaintenancePart.findMany.mockResolvedValue([part('p2', CampPartSource.MINE_SUPPLIED, '1', null)]);
    const res = await svc.transition('t1', 'a1', 'c1', 'm1', 'close');
    expect(res.cost.vatRate).toBe('10.00');
  });

  it('update: OPEN/IN_PROGRESS үед л; DONE → 409; үүсгэсэн хүн засна', async () => {
    setActor(s.tx, { userId: 'cu-rep', roles: [{ campId: 'c1', perms: [P.MAINTENANCE_CREATE] }] });
    withStatus(S.IN_PROGRESS);
    await svc.update('t1', 'a1', 'c1', 'm1', { title: 'Шинэ', priority: 'HIGH' });
    expect(s.tx.campMaintenanceRequest.updateMany.mock.calls[0][0]).toEqual({
      where: { id: 'm1', tenantId: 't1', status: 'IN_PROGRESS' }, data: { title: 'Шинэ', priority: 'HIGH' },
    });
    withStatus(S.DONE);
    await expect(svc.update('t1', 'a1', 'c1', 'm1', { title: 'X' })).rejects.toThrow(ConflictException);
  });
});

describe('CampMaintenanceService — сэлбэг (Шат 4.4)', () => {
  let s: ReturnType<typeof setup>;
  let svc: CampMaintenanceService;
  beforeEach(() => {
    s = setup();
    svc = new CampMaintenanceService(s.prisma as never, s.access);
    setActor(s.tx, { userId: 'cu1', roles: [{ campId: 'c1', perms: [P.MAINTENANCE_PARTS] }] });
    s.tx.campMaintenanceRequest.findFirst.mockResolvedValue({ ...REQ, status: S.IN_PROGRESS });
    s.tx.campMaintenancePart.create.mockResolvedValue(part('p1', CampPartSource.CATERING_PURCHASED, '2', '1500'));
    s.tx.campMaintenancePart.update.mockResolvedValue(part('p1', CampPartSource.CATERING_PURCHASED, '2', '1500'));
  });

  it('add: анхдагч нэгж/НӨАТ, Decimal; хариу string хэлбэртэй', async () => {
    const res = await svc.addPart('t1', 'a1', 'c1', 'm1', { partName: 'Цорго', quantity: 2, unitPrice: 1500, source: CampPartSource.CATERING_PURCHASED });
    const data = s.tx.campMaintenancePart.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ tenantId: 't1', requestId: 'm1', partName: 'Цорго', unit: 'ш', vatIncluded: true, source: 'CATERING_PURCHASED', createdBy: 'cu1' });
    expect(data.quantity.toString()).toBe('2');
    expect(data.unitPrice.toString()).toBe('1500');
    expect(res).toMatchObject({ quantity: '2', unitPrice: '1500.00' });
  });

  it('add: катерингийн сэлбэг үнэгүй → 400; уурхайн сэлбэг үнэгүй OK', async () => {
    await expect(svc.addPart('t1', 'a1', 'c1', 'm1', { partName: 'X', quantity: 1, source: CampPartSource.CATERING_PURCHASED })).rejects.toThrow(BadRequestException);
    await svc.addPart('t1', 'a1', 'c1', 'm1', { partName: 'X', quantity: 1, source: CampPartSource.MINE_SUPPLIED });
    expect(s.tx.campMaintenancePart.create.mock.calls[0][0].data.unitPrice).toBeNull();
  });

  it('CLOSED / CANCELLED → 409; DONE үед засаж болно (хаахаас өмнө залруулга); эрхгүй → 403', async () => {
    s.tx.campMaintenanceRequest.findFirst.mockResolvedValueOnce({ ...REQ, status: S.CLOSED });
    await expect(svc.addPart('t1', 'a1', 'c1', 'm1', { partName: 'X', quantity: 1, source: CampPartSource.MINE_SUPPLIED })).rejects.toThrow(ConflictException);
    s.tx.campMaintenanceRequest.findFirst.mockResolvedValueOnce({ ...REQ, status: S.CANCELLED });
    await expect(svc.removePart('t1', 'a1', 'c1', 'm1', 'p1')).rejects.toThrow(ConflictException);
    s.tx.campMaintenanceRequest.findFirst.mockResolvedValueOnce({ ...REQ, status: S.DONE });
    await svc.addPart('t1', 'a1', 'c1', 'm1', { partName: 'X', quantity: 1, source: CampPartSource.MINE_SUPPLIED });
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.MAINTENANCE_CLOSE] }] });
    await expect(svc.addPart('t1', 'a1', 'c1', 'm1', { partName: 'X', quantity: 1, source: CampPartSource.MINE_SUPPLIED })).rejects.toThrow(ForbiddenException);
  });

  it('update: эх сурвалжийг CATERING болгоход үнэ (одоогийн ч бай) шаардана; null үнэ → 400', async () => {
    s.tx.campMaintenancePart.findFirst.mockResolvedValueOnce(part('p1', CampPartSource.MINE_SUPPLIED, '1', null));
    await expect(svc.updatePart('t1', 'a1', 'c1', 'm1', 'p1', { source: CampPartSource.CATERING_PURCHASED })).rejects.toThrow(BadRequestException);
    s.tx.campMaintenancePart.findFirst.mockResolvedValueOnce(part('p1', CampPartSource.MINE_SUPPLIED, '1', '700'));
    await svc.updatePart('t1', 'a1', 'c1', 'm1', 'p1', { source: CampPartSource.CATERING_PURCHASED });
    expect(s.tx.campMaintenancePart.update.mock.calls[0][0].data).toEqual({ source: 'CATERING_PURCHASED' });
    s.tx.campMaintenancePart.findFirst.mockResolvedValueOnce(part('p1', CampPartSource.CATERING_PURCHASED, '1', '700'));
    await expect(svc.updatePart('t1', 'a1', 'c1', 'm1', 'p1', { unitPrice: null })).rejects.toThrow(BadRequestException);
    expect(s.tx.campMaintenancePart.findFirst.mock.calls[0][0].where).toEqual({ id: 'p1', tenantId: 't1', requestId: 'm1' });
  });

  it('update/remove: өөр хүсэлтийн сэлбэг → 404', async () => {
    await expect(svc.updatePart('t1', 'a1', 'c1', 'm1', 'pX', { partName: 'Y' })).rejects.toThrow(NotFoundException);
    s.tx.campMaintenancePart.deleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(svc.removePart('t1', 'a1', 'c1', 'm1', 'pX')).rejects.toThrow(NotFoundException);
    s.tx.campMaintenancePart.deleteMany.mockResolvedValueOnce({ count: 1 });
    expect(await svc.removePart('t1', 'a1', 'c1', 'm1', 'p1')).toEqual({ deleted: true });
    expect(s.tx.campMaintenancePart.deleteMany.mock.calls[1][0].where).toEqual({ id: 'p1', tenantId: 't1', requestId: 'm1' });
  });

  it('get: дэлгэрэнгүйд сэлбэг + зардлын урьдчилсан тооцоо', async () => {
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.REPORT_VIEW] }] });
    s.tx.campMaintenancePart.findMany.mockResolvedValueOnce([part('p1', CampPartSource.CATERING_PURCHASED, '2', '11000')]);
    s.tx.campSetting.findFirst.mockResolvedValueOnce({ vatRate: D(10), cateringOrganizationId: 'org' });
    const res = await svc.get('t1', 'a1', 'c1', 'm1');
    expect(res.statusLabel).toBe('Хийгдэж буй');
    expect(res.parts[0].unitPrice).toBe('11000.00');
    expect(res.cost.total.gross).toBe('22000.00');
  });
});
