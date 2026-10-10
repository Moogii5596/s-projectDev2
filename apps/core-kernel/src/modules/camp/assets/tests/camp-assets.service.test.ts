import { describe, it, expect, beforeEach } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CampAssetCondition, CampRoomStatus, Prisma, UserRole } from '@prisma/client';
import { CAMP_PERMISSIONS } from '../../common/camp-permissions';
import { expectTenantTx, setActor, setup } from '../../common/tests/camp-test-utils';
import { CampAssetsService } from '../camp-assets.service';
import { todayUb, addDays } from '../../attendance/camp-date';

const P = CAMP_PERMISSIONS;
const CAMP = { id: 'c1', code: 'C1', name: 'Кемп 1', isActive: true };
const ASSET_ROW = {
  id: 'as1',
  campId: 'c1',
  categoryId: 'cat1',
  inventoryNo: 'INV-1',
  name: 'Хөргөгч',
  serialNo: null,
  roomId: 'r1',
  condition: CampAssetCondition.GOOD,
  acquiredDate: new Date('2026-01-15T00:00:00.000Z'),
  acquiredCost: new Prisma.Decimal('1500000.5'),
  note: null,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T00:00:00Z'),
  category: { name: 'Цахилгаан бараа' },
  room: { roomNo: '101', building: { code: 'B1' } },
};
const CORE = { id: 'as1', roomId: 'r1', condition: CampAssetCondition.GOOD, note: null, inventoryNo: 'INV-1' };

describe('CampAssetsService — ангилал (Шат 4.3)', () => {
  let s: ReturnType<typeof setup>;
  let svc: CampAssetsService;
  beforeEach(() => {
    s = setup();
    svc = new CampAssetsService(s.prisma as never, s.access);
  });

  it('create: аль нэг кемпэд asset.manage эрхтэй бол зөвшөөрнө, эрхгүй → 403', async () => {
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.ROOM_MANAGE] }] });
    await expect(svc.createCategory('t1', 'a1', { name: 'Тавилга' })).rejects.toThrow(ForbiddenException);
    setActor(s.tx, { roles: [{ campId: 'c2', perms: [P.ASSET_MANAGE] }] });
    await svc.createCategory('t1', 'a1', { name: 'Тавилга' });
    expectTenantTx(s.tx, 't1');
    expect(s.tx.campAssetCategory.create.mock.calls[0][0].data).toEqual({ tenantId: 't1', name: 'Тавилга' });
  });

  it('create/update: нэр давхардвал (том жижиг үсэг үл харгалзан) → 409', async () => {
    setActor(s.tx, { role: UserRole.ADMIN });
    s.tx.campAssetCategory.findFirst.mockResolvedValueOnce({ id: 'x' });
    await expect(svc.createCategory('t1', 'a1', { name: 'тавилга' })).rejects.toThrow(ConflictException);
    expect(s.tx.campAssetCategory.findFirst.mock.calls[0][0].where).toEqual({ tenantId: 't1', name: { equals: 'тавилга', mode: 'insensitive' } });
    s.tx.campAssetCategory.findFirst.mockResolvedValueOnce({ id: 'cat1' }).mockResolvedValueOnce({ id: 'x' });
    await expect(svc.updateCategory('t1', 'a1', 'cat1', { name: 'Б' })).rejects.toThrow(ConflictException);
    expect(s.tx.campAssetCategory.findFirst.mock.calls[2][0].where).toMatchObject({ NOT: { id: 'cat1' } });
  });

  it('update: олдохгүй → 404; isActive л өгвөл нэрийг шалгахгүй', async () => {
    setActor(s.tx, { role: UserRole.ADMIN });
    await expect(svc.updateCategory('t1', 'a1', 'nope', { isActive: false })).rejects.toThrow(NotFoundException);
    s.tx.campAssetCategory.findFirst.mockResolvedValueOnce({ id: 'cat1' });
    await svc.updateCategory('t1', 'a1', 'cat1', { isActive: false });
    expect(s.tx.campAssetCategory.update.mock.calls[0][0].data).toEqual({ isActive: false });
  });

  it('list: аль нэг кемпэд эрхтэй бол уншина; activeOnly шүүлт', async () => {
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.REPORT_VIEW] }] });
    await svc.listCategories('t1', 'a1', { activeOnly: true });
    expect(s.tx.campAssetCategory.findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1', isActive: true });
    setActor(s.tx, {});
    await expect(svc.listCategories('t1', 'a1', {})).rejects.toThrow(ForbiddenException);
  });
});

describe('CampAssetsService — хөрөнгө (Шат 4.3)', () => {
  let s: ReturnType<typeof setup>;
  let svc: CampAssetsService;
  beforeEach(() => {
    s = setup();
    svc = new CampAssetsService(s.prisma as never, s.access);
    setActor(s.tx, { userId: 'cu1', roles: [{ campId: 'c1', perms: [P.ASSET_MANAGE] }] });
    s.tx.camp.findFirst.mockResolvedValue(CAMP);
    s.tx.campAssetCategory.findFirst.mockResolvedValue({ isActive: true });
    s.tx.campRoom.findFirst.mockResolvedValue({ roomNo: '101', status: CampRoomStatus.ACTIVE });
    s.tx.campAsset.create.mockResolvedValue(ASSET_ROW);
    s.tx.campAsset.findFirstOrThrow.mockResolvedValue(ASSET_ROW);
  });

  it('create: өрөөнд байршуулбал анхны movement бичнэ; огноо/мөнгийг API хэлбэрт', async () => {
    const res = await svc.create('t1', 'a1', 'c1', {
      categoryId: 'cat1', inventoryNo: 'INV-1', name: 'Хөргөгч', roomId: 'r1', acquiredDate: '2026-01-15', acquiredCost: 1500000.5,
    });
    expect(s.tx.campAsset.create.mock.calls[0][0].data).toMatchObject({ tenantId: 't1', campId: 'c1', roomId: 'r1', condition: 'GOOD' });
    expect(s.tx.campAsset.create.mock.calls[0][0].data.acquiredDate).toEqual(new Date('2026-01-15T00:00:00.000Z'));
    expect(s.tx.campAssetMovement.create).toHaveBeenCalledWith({
      data: { tenantId: 't1', campId: 'c1', assetId: 'as1', fromRoomId: null, toRoomId: 'r1', movedBy: 'cu1', reason: 'Анхны байршуулалт' },
    });
    expect(res.acquiredDate).toBe('2026-01-15');
    expect(res.acquiredCost).toBe('1500000.50');
  });

  it('create: агуулахад (roomId байхгүй) → movement бичихгүй', async () => {
    await svc.create('t1', 'a1', 'c1', { categoryId: 'cat1', inventoryNo: 'INV-2', name: 'Сандал' });
    expect(s.tx.campAsset.create.mock.calls[0][0].data.roomId).toBeNull();
    expect(s.tx.campAssetMovement.create).not.toHaveBeenCalled();
  });

  it('create: шалгалтууд — WRITTEN_OFF, буруу/ирээдүйн огноо, идэвхгүй ангилал, INACTIVE өрөө (400), давхар инвентарь (409), эрхгүй (403)', async () => {
    const base = { categoryId: 'cat1', inventoryNo: 'INV-1', name: 'X' };
    await expect(svc.create('t1', 'a1', 'c1', { ...base, condition: CampAssetCondition.WRITTEN_OFF })).rejects.toThrow(BadRequestException);
    await expect(svc.create('t1', 'a1', 'c1', { ...base, acquiredDate: '2026-02-30' })).rejects.toThrow(/буруу огноо/);
    await expect(svc.create('t1', 'a1', 'c1', { ...base, acquiredDate: addDays(todayUb(), 1) })).rejects.toThrow(/ирээдүй/);
    s.tx.campAssetCategory.findFirst.mockResolvedValueOnce({ isActive: false });
    await expect(svc.create('t1', 'a1', 'c1', base)).rejects.toThrow(/Ангилал идэвхгүй/);
    s.tx.campRoom.findFirst.mockResolvedValueOnce({ roomNo: '101', status: CampRoomStatus.INACTIVE });
    await expect(svc.create('t1', 'a1', 'c1', { ...base, roomId: 'r1' })).rejects.toThrow(BadRequestException);
    s.tx.campAsset.findFirst.mockResolvedValueOnce({ name: 'Хуучин' });
    await expect(svc.create('t1', 'a1', 'c1', base)).rejects.toThrow(ConflictException);
    setActor(s.tx, { roles: [{ campId: 'c2', perms: [P.ASSET_MANAGE] }] });
    await expect(svc.create('t1', 'a1', 'c1', base)).rejects.toThrow(ForbiddenException);
    expect(s.tx.campAsset.create).not.toHaveBeenCalled();
  });

  it('create: засварт байгаа (MAINTENANCE) өрөөнд байршуулж болно', async () => {
    s.tx.campRoom.findFirst.mockResolvedValueOnce({ roomNo: '101', status: CampRoomStatus.MAINTENANCE });
    await svc.create('t1', 'a1', 'c1', { categoryId: 'cat1', inventoryNo: 'INV-1', name: 'X', roomId: 'r1' });
    expect(s.tx.campAsset.create).toHaveBeenCalled();
  });

  it('update: актлагдсан → 409; WRITTEN_OFF-руу шууд → 400; зэрэгцээ актлалт (0 мөр) → 409', async () => {
    s.tx.campAsset.findFirst.mockResolvedValueOnce({ ...CORE, condition: CampAssetCondition.WRITTEN_OFF });
    await expect(svc.update('t1', 'a1', 'c1', 'as1', { name: 'Y' })).rejects.toThrow(ConflictException);
    s.tx.campAsset.findFirst.mockResolvedValueOnce(CORE);
    await expect(svc.update('t1', 'a1', 'c1', 'as1', { condition: CampAssetCondition.WRITTEN_OFF })).rejects.toThrow(BadRequestException);
    s.tx.campAsset.findFirst.mockResolvedValueOnce(CORE);
    s.tx.campAsset.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(svc.update('t1', 'a1', 'c1', 'as1', { name: 'Y' })).rejects.toThrow(ConflictException);
  });

  it('update: зөвхөн өгсөн талбар, null = арилгах, байршил хөндөгдөхгүй', async () => {
    s.tx.campAsset.findFirst.mockResolvedValueOnce(CORE).mockResolvedValueOnce(null);
    await svc.update('t1', 'a1', 'c1', 'as1', { inventoryNo: 'INV-9', serialNo: null, acquiredCost: null, condition: CampAssetCondition.DAMAGED });
    const call = s.tx.campAsset.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'as1', tenantId: 't1', condition: { not: 'WRITTEN_OFF' } });
    expect(call.data).toEqual({ inventoryNo: 'INV-9', serialNo: null, condition: 'DAMAGED', acquiredCost: null });
    // давхар инвентарийн шалгалт өөрийгөө хасна
    expect(s.tx.campAsset.findFirst.mock.calls[1][0].where).toEqual({ tenantId: 't1', inventoryNo: 'INV-9', NOT: { id: 'as1' } });
  });

  it('move: өрөө → өрөө — optimistic update + movement (from/to/шалтгаан)', async () => {
    s.tx.campAsset.findFirst.mockResolvedValueOnce(CORE);
    await svc.move('t1', 'a1', 'c1', 'as1', { toRoomId: 'r2', reason: 'Солив' });
    expect(s.tx.campAsset.updateMany).toHaveBeenCalledWith({
      where: { id: 'as1', tenantId: 't1', roomId: 'r1', condition: { not: 'WRITTEN_OFF' } },
      data: { roomId: 'r2' },
    });
    expect(s.tx.campAssetMovement.create).toHaveBeenCalledWith({
      data: { tenantId: 't1', campId: 'c1', assetId: 'as1', fromRoomId: 'r1', toRoomId: 'r2', movedBy: 'cu1', reason: 'Солив' },
    });
  });

  it('move: агуулах руу (null); ижил байршил → 400; INACTIVE өрөө → 400; актлагдсан → 409; зэрэгцээ → 409', async () => {
    s.tx.campAsset.findFirst.mockResolvedValueOnce(CORE);
    await svc.move('t1', 'a1', 'c1', 'as1', { toRoomId: null });
    expect(s.tx.campAssetMovement.create.mock.calls[0][0].data).toMatchObject({ fromRoomId: 'r1', toRoomId: null, reason: null });

    s.tx.campAsset.findFirst.mockResolvedValueOnce(CORE);
    await expect(svc.move('t1', 'a1', 'c1', 'as1', { toRoomId: 'r1' })).rejects.toThrow(/аль хэдийн энэ өрөөнд/);
    s.tx.campAsset.findFirst.mockResolvedValueOnce({ ...CORE, roomId: null });
    await expect(svc.move('t1', 'a1', 'c1', 'as1', { toRoomId: null })).rejects.toThrow(/агуулахад/);
    s.tx.campAsset.findFirst.mockResolvedValueOnce(CORE);
    s.tx.campRoom.findFirst.mockResolvedValueOnce({ roomNo: '102', status: CampRoomStatus.INACTIVE });
    await expect(svc.move('t1', 'a1', 'c1', 'as1', { toRoomId: 'r2' })).rejects.toThrow(BadRequestException);
    s.tx.campAsset.findFirst.mockResolvedValueOnce({ ...CORE, condition: CampAssetCondition.WRITTEN_OFF });
    await expect(svc.move('t1', 'a1', 'c1', 'as1', { toRoomId: 'r2' })).rejects.toThrow(ConflictException);
    s.tx.campAsset.findFirst.mockResolvedValueOnce(CORE);
    s.tx.campAsset.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(svc.move('t1', 'a1', 'c1', 'as1', { toRoomId: 'r2' })).rejects.toThrow(/байршил өөрчлөгдсөн/);
    expect(s.tx.campAssetMovement.create).toHaveBeenCalledTimes(1);
  });

  it('move: өөр кемпийн хөрөнгө → 404 (campId-аар шүүнэ)', async () => {
    await expect(svc.move('t1', 'a1', 'c1', 'other', { toRoomId: 'r2' })).rejects.toThrow(NotFoundException);
    expect(s.tx.campAsset.findFirst.mock.calls[0][0].where).toEqual({ id: 'other', tenantId: 't1', campId: 'c1' });
  });

  it('writeOff: өрөөнөөс агуулах руу + WRITTEN_OFF + тэмдэглэлд шалтгаан; movement-д шалтгаан', async () => {
    s.tx.campAsset.findFirst.mockResolvedValueOnce({ ...CORE, note: 'Хуучин тэмдэглэл' });
    await svc.writeOff('t1', 'a1', 'c1', 'as1', { reason: 'Эвдэрсэн' });
    const call = s.tx.campAsset.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'as1', tenantId: 't1', roomId: 'r1', condition: { not: 'WRITTEN_OFF' } });
    expect(call.data).toEqual({ condition: 'WRITTEN_OFF', roomId: null, note: `Хуучин тэмдэглэл\n[Актлав ${todayUb()}] Эвдэрсэн` });
    expect(s.tx.campAssetMovement.create.mock.calls[0][0].data).toMatchObject({ fromRoomId: 'r1', toRoomId: null, reason: 'Актлав: Эвдэрсэн' });
  });

  it('writeOff: агуулахад байсан → movement бичихгүй (CHECK from≠to); нээлттэй засвартай → 409; аль хэдийн актлагдсан → 409', async () => {
    s.tx.campAsset.findFirst.mockResolvedValueOnce({ ...CORE, roomId: null });
    await svc.writeOff('t1', 'a1', 'c1', 'as1', { reason: 'Хуучирсан' });
    expect(s.tx.campAsset.updateMany.mock.calls[0][0].data.note).toBe(`[Актлав ${todayUb()}] Хуучирсан`);
    expect(s.tx.campAssetMovement.create).not.toHaveBeenCalled();

    s.tx.campAsset.findFirst.mockResolvedValueOnce(CORE);
    s.tx.campMaintenanceRequest.findFirst.mockResolvedValueOnce({ requestNo: 'ZAS-C1-2026-0001' });
    await expect(svc.writeOff('t1', 'a1', 'c1', 'as1', { reason: 'x' })).rejects.toThrow(/ZAS-C1-2026-0001/);
    expect(s.tx.campMaintenanceRequest.findFirst.mock.calls[0][0].where).toEqual({ tenantId: 't1', assetId: 'as1', status: { in: ['OPEN', 'IN_PROGRESS'] } });

    s.tx.campAsset.findFirst.mockResolvedValueOnce({ ...CORE, condition: CampAssetCondition.WRITTEN_OFF });
    await expect(svc.writeOff('t1', 'a1', 'c1', 'as1', { reason: 'x' })).rejects.toThrow(ConflictException);
  });

  it('list: агуулах шүүлт (roomId null), хайлт, cursor; буруу cursor → 400', async () => {
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.REPORT_VIEW] }] });
    // [3.6.3] cursor-ийн id UUID байх ёстой (UUID биш → 400)
    s.tx.campAsset.findMany.mockResolvedValueOnce([{ ...ASSET_ROW, id: '0192a3b4-0000-7000-8000-0000000000a1' }, { ...ASSET_ROW, id: 'as2' }]);
    const res = await svc.list('t1', 'a1', 'c1', { roomId: 'warehouse', q: 'inv', limit: 1 });
    const where = s.tx.campAsset.findMany.mock.calls[0][0].where;
    expect(where.roomId).toBeNull();
    expect(where.OR).toHaveLength(3);
    expect(res.hasMore).toBe(true);
    expect(res.data).toHaveLength(1);
    expect(res.data[0].acquiredCost).toBe('1500000.50');
    await svc.list('t1', 'a1', 'c1', { roomId: '0192a3b4-0000-7000-8000-000000000001', cursor: res.nextCursor! });
    const w2 = s.tx.campAsset.findMany.mock.calls[1][0].where;
    expect(w2.roomId).toBe('0192a3b4-0000-7000-8000-000000000001');
    expect(w2.AND).toBeDefined();
    await expect(svc.list('t1', 'a1', 'c1', { cursor: '!!' })).rejects.toThrow(BadRequestException);
  });

  it('get: нээлттэй засварын тоо; movements: олдохгүй → 404', async () => {
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.REPORT_VIEW] }] });
    s.tx.campAsset.findFirst.mockResolvedValueOnce(ASSET_ROW);
    s.tx.campMaintenanceRequest.count.mockResolvedValueOnce(2);
    expect((await svc.get('t1', 'a1', 'c1', 'as1')).openMaintenance).toBe(2);
    await expect(svc.movements('t1', 'a1', 'c1', 'nope')).rejects.toThrow(NotFoundException);
  });
});
