import { describe, it, expect, beforeEach } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CampSettingsService } from '../camp-settings.service';
import { CAMP_PERMISSIONS } from '../../common/camp-permissions';
import { expectTenantTx, setActor, setup } from '../../common/tests/camp-test-utils';

const P = CAMP_PERMISSIONS;
const dto = {
  vatRate: 10,
  changeoverWeekday: 3,
  rosterOnDays: 14,
  rosterOffDays: 14,
  mealOrderCutoffTime: '15:00' as string | null,
  defaultMealLocationId: 'loc1' as string | null,
};
const row = {
  vatRate: new Prisma.Decimal(10),
  changeoverWeekday: 3,
  rosterOnDays: 14,
  rosterOffDays: 14,
  mealOrderCutoffTime: new Date('1970-01-01T15:00:00.000Z'),
  defaultMealLocationId: 'loc1',
  cateringOrganizationId: null,
  updatedAt: new Date(),
};

describe('CampSettingsService (Шат 2.3)', () => {
  let s: ReturnType<typeof setup>;
  let svc: CampSettingsService;
  beforeEach(() => {
    s = setup();
    svc = new CampSettingsService(s.prisma as never, s.access);
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.SETTINGS_MANAGE] }] });
    s.tx.camp.findFirst.mockResolvedValue({ id: 'c1', code: 'C1', name: 'C1', isActive: true });
  });

  it('getSettings: тохиргоогүй бол анхдагч (configured=false); байвал HH:MM, НӨАТ string', async () => {
    const empty = await svc.getSettings('t1', 'a1', 'c1');
    expect(empty).toMatchObject({ configured: false, vatRate: '10', rosterOnDays: 14, changeoverWeekday: 3 });
    s.tx.campSetting.findFirst.mockResolvedValueOnce(row);
    const got = await svc.getSettings('t1', 'a1', 'c1');
    expect(got).toMatchObject({ configured: true, vatRate: '10', mealOrderCutoffTime: '15:00', defaultMealLocationId: 'loc1' });
    expectTenantTx(s.tx, 't1');
  });

  it('getSettings: эрхгүй кемп → 403; байхгүй кемп → 404', async () => {
    await expect(svc.getSettings('t1', 'a1', 'c2')).rejects.toThrow(ForbiddenException);
    s.tx.camp.findFirst.mockResolvedValueOnce(null);
    await expect(svc.getSettings('t1', 'a1', 'c1')).rejects.toThrow(NotFoundException);
  });

  it('update: settings.manage-гүй (өөр кемпийнх) → 403', async () => {
    await expect(svc.updateSettings('t1', 'a1', 'c2', dto)).rejects.toThrow(/camp\.settings\.manage/);
    expect(s.tx.campSetting.upsert).not.toHaveBeenCalled();
  });

  it('update: анхдагч байршил өөр кемпийнх / идэвхгүй → 400 (tenant + campId-аар хайна)', async () => {
    await expect(svc.updateSettings('t1', 'a1', 'c1', dto)).rejects.toThrow(/энэ кемпэд олдсонгүй/);
    expect(s.tx.campMealLocation.findFirst).toHaveBeenCalledWith({ where: { id: 'loc1', tenantId: 't1', campId: 'c1' }, select: { id: true, isActive: true } });
    s.tx.campMealLocation.findFirst.mockResolvedValueOnce({ id: 'loc1', isActive: false });
    await expect(svc.updateSettings('t1', 'a1', 'c1', dto)).rejects.toThrow(/идэвхгүй/);
  });

  it('update: ростерын урт өөрчлөгдөж, загвартай хэлтэс байвал → 409 (кодуудыг нэрлэнэ); загваргүй бол зөвшөөрнө', async () => {
    s.tx.campMealLocation.findFirst.mockResolvedValue({ id: 'loc1', isActive: true });
    s.tx.campSetting.findFirst.mockResolvedValue({ rosterOnDays: 14 });
    s.tx.campDepartment.findMany.mockResolvedValueOnce([{ code: 'ADM' }, { code: 'MINE' }]);
    await expect(svc.updateSettings('t1', 'a1', 'c1', { ...dto, rosterOnDays: 10 })).rejects.toThrow(/14 → 10 .*ADM, MINE/);
    expect(s.tx.campSetting.upsert).not.toHaveBeenCalled();

    s.tx.campSetting.upsert.mockResolvedValueOnce({ ...row, rosterOnDays: 10 });
    await expect(svc.updateSettings('t1', 'a1', 'c1', { ...dto, rosterOnDays: 10 })).resolves.toMatchObject({ rosterOnDays: 10 });
  });

  it('update: ростер өөрчлөгдөөгүй бол хэлтэс шалгахгүй; upsert өгөгдөл зөв (Decimal, Time, null)', async () => {
    s.tx.campMealLocation.findFirst.mockResolvedValue({ id: 'loc1', isActive: true });
    s.tx.campSetting.findFirst.mockResolvedValue({ rosterOnDays: 14 });
    s.tx.campSetting.upsert.mockResolvedValueOnce({ ...row, mealOrderCutoffTime: null, defaultMealLocationId: null });
    const res = await svc.updateSettings('t1', 'a1', 'c1', { ...dto, mealOrderCutoffTime: null, defaultMealLocationId: null, vatRate: 12.5 });
    expect(s.tx.campDepartment.findMany).not.toHaveBeenCalled();
    const args = s.tx.campSetting.upsert.mock.calls[0][0];
    expect(args.where).toEqual({ tenantId_campId: { tenantId: 't1', campId: 'c1' } });
    expect(args.update.vatRate.toString()).toBe('12.5');
    expect(args.update.mealOrderCutoffTime).toBeNull();
    expect(args.create).toMatchObject({ tenantId: 't1', campId: 'c1' });
    expect(res.mealOrderCutoffTime).toBeNull();
  });

  it('update: HH:MM → Time (UTC 1970-01-01)', async () => {
    s.tx.campMealLocation.findFirst.mockResolvedValue({ id: 'loc1', isActive: true });
    s.tx.campSetting.upsert.mockResolvedValueOnce(row);
    await svc.updateSettings('t1', 'a1', 'c1', { ...dto, mealOrderCutoffTime: '16:45' });
    expect(s.tx.campSetting.upsert.mock.calls[0][0].update.mealOrderCutoffTime.toISOString()).toBe('1970-01-01T16:45:00.000Z');
  });

  it('катеринг байгууллага: олдохгүй / идэвхгүй / CATERING биш → 400; хүчинтэй → хадгална; өгөөгүй бол өөрчлөхгүй', async () => {
    s.tx.campMealLocation.findFirst.mockResolvedValue({ id: 'loc1', isActive: true });
    await expect(svc.updateSettings('t1', 'a1', 'c1', { ...dto, cateringOrganizationId: 'o9' })).rejects.toThrow(/Катеринг байгууллага олдсонгүй/);
    s.tx.campOrganization.findFirst.mockResolvedValueOnce({ name: 'Тээвэр', isActive: true, serviceTypes: ['WASTE_TRANSPORT'] });
    await expect(svc.updateSettings('t1', 'a1', 'c1', { ...dto, cateringOrganizationId: 'o2' })).rejects.toThrow(/"Тээвэр" катерингийн үйлчилгээ \(CATERING\)/);
    s.tx.campOrganization.findFirst.mockResolvedValueOnce({ name: 'K', isActive: false, serviceTypes: ['CATERING'] });
    await expect(svc.updateSettings('t1', 'a1', 'c1', { ...dto, cateringOrganizationId: 'o4' })).rejects.toThrow(/идэвхгүй/);
    expect(s.tx.campSetting.upsert).not.toHaveBeenCalled();
    s.tx.campOrganization.findFirst.mockResolvedValueOnce({ name: 'K', isActive: true, serviceTypes: ['CATERING'] });
    s.tx.campSetting.upsert.mockResolvedValue({ ...row, cateringOrganizationId: 'o4' });
    const res = await svc.updateSettings('t1', 'a1', 'c1', { ...dto, cateringOrganizationId: 'o4' });
    expect(s.tx.campSetting.upsert.mock.calls[0][0].update.cateringOrganizationId).toBe('o4');
    expect(res.cateringOrganizationId).toBe('o4');
    await svc.updateSettings('t1', 'a1', 'c1', dto);
    expect('cateringOrganizationId' in s.tx.campSetting.upsert.mock.calls[1][0].update).toBe(false);
    await svc.updateSettings('t1', 'a1', 'c1', { ...dto, cateringOrganizationId: null });
    expect(s.tx.campSetting.upsert.mock.calls[2][0].update.cateringOrganizationId).toBeNull();
  });

  it('meal location: давхар нэр → 409; үүсгэхэд tenant + camp', async () => {
    s.tx.campMealLocation.findFirst.mockResolvedValueOnce({ id: 'dup' });
    await expect(svc.createMealLocation('t1', 'a1', 'c1', { name: 'Кемп гал тогоо' })).rejects.toThrow(ConflictException);
    await svc.createMealLocation('t1', 'a1', 'c1', { name: 'Уулын хэсэг' });
    expect(s.tx.campMealLocation.create).toHaveBeenCalledWith(expect.objectContaining({ data: { tenantId: 't1', campId: 'c1', name: 'Уулын хэсэг' } }));
  });

  it('meal location идэвхгүй болгох: анхдагч байршил → 409; идэвхтэй хэлтэс ашиглаж байвал → 409 (код нэрлэнэ)', async () => {
    s.tx.campMealLocation.findFirst.mockResolvedValue({ id: 'loc1' });
    s.tx.campSetting.findFirst.mockResolvedValueOnce({ id: 's1' });
    await expect(svc.updateMealLocation('t1', 'a1', 'c1', 'loc1', { isActive: false })).rejects.toThrow(/анхдагч байршлыг/);
    s.tx.campDepartment.findMany.mockResolvedValueOnce([{ code: 'MINE' }]);
    await expect(svc.updateMealLocation('t1', 'a1', 'c1', 'loc1', { isActive: false })).rejects.toThrow(/Идэвхтэй хэлтэс .*MINE/);
    expect(s.tx.campMealLocation.update).not.toHaveBeenCalled();
    await svc.updateMealLocation('t1', 'a1', 'c1', 'loc1', { isActive: false });
    expect(s.tx.campMealLocation.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'loc1' }, data: { isActive: false } }));
  });

  it('meal location: өөр кемпийн байршил → 404', async () => {
    await expect(svc.updateMealLocation('t1', 'a1', 'c1', 'x', { name: 'N' })).rejects.toThrow(NotFoundException);
    expect(s.tx.campMealLocation.findFirst).toHaveBeenCalledWith({ where: { id: 'x', tenantId: 't1', campId: 'c1' }, select: { id: true } });
  });
});
