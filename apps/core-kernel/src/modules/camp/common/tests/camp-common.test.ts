import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { CAMP_PERMISSIONS, CAMP_PERMISSION_CODES, isCampPermission } from '../camp-permissions';
import { CampAccessService, CampPermissionSet } from '../camp-access.service';
import { toCampHttpError, withCampErrors } from '../camp-errors';
import { fromDbDate, fromDbTime, inTenantTx, toDbDate, toDbTime } from '../camp-tx';
import { expectTenantTx, setActor, setup } from './camp-test-utils';

const P = CAMP_PERMISSIONS;

describe('Camp permission каталог (Шат 2.1)', () => {
  it('17 эрх, давхардалгүй, camp.<x>.<y> хэлбэртэй (DB CHECK-тэй ижил regex)', () => {
    expect(CAMP_PERMISSION_CODES).toHaveLength(17);
    expect(new Set(CAMP_PERMISSION_CODES).size).toBe(17);
    for (const c of CAMP_PERMISSION_CODES) expect(c).toMatch(/^camp\.[a-z_]+\.[a-z_]+$/);
  });
  it('isCampPermission', () => {
    expect(isCampPermission('camp.master.manage')).toBe(true);
    expect(isCampPermission('camp.master.delete')).toBe(false);
  });
});

describe('CampAccessService (Шат 2.1)', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  it('идэвхгүй / tenant-д байхгүй хэрэглэгч → 403; authId + tenant + isActive-ээр хайна', async () => {
    s.tx.coreUser.findFirst.mockResolvedValueOnce(null);
    await expect(s.access.resolve(s.tx as never, 't1', 'auth-x')).rejects.toThrow(/бүртгэлгүй эсвэл идэвхгүй/);
    expect(s.tx.coreUser.findFirst).toHaveBeenCalledWith({ where: { authId: 'auth-x', tenantId: 't1', isActive: true }, select: { id: true, role: true } });
  });

  it('роль → global (camp_id NULL) + byCamp, давхардалгүй эрэмбэтэй; cache-д 300с хадгална', async () => {
    setActor(s.tx, {
      userId: 'cu1',
      roles: [
        { campId: null, perms: [P.REPORT_VIEW] },
        { campId: 'c1', perms: [P.MEAL_ORDER, P.REPORT_VIEW] },
        { campId: 'c1', perms: [P.HAUL_APPROVE, P.MEAL_ORDER] },
      ],
    });
    const actor = await s.access.resolve(s.tx as never, 't1', 'a1');
    expect(actor.userId).toBe('cu1');
    expect(actor.perms).toEqual({
      isTenantAdmin: false,
      global: [P.REPORT_VIEW],
      byCamp: { c1: [P.HAUL_APPROVE, P.MEAL_ORDER, P.REPORT_VIEW].sort() },
    });
    // v0.2.2 D-01: эцсийн эрх = camp_user_permissions; camp_user_roles (олголт) guard-д уншигдахгүй
    expect(s.tx.campUserPermission.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 't1', userId: 'cu1' } }));
    expect(s.tx.campUserRole.findMany).not.toHaveBeenCalled();
    expect(s.cache.set).toHaveBeenCalledWith('cache:camp:t1:perms:cu1', actor.perms, 300);
  });

  it('cache hit → роль DB-ээс уншихгүй, гэхдээ хэрэглэгчийг ҮРГЭЛЖ DB-ээс шалгана', async () => {
    setActor(s.tx, { userId: 'cu1' });
    const cached: CampPermissionSet = { isTenantAdmin: false, global: [], byCamp: { c1: [P.MEAL_ORDER] } };
    s.cache.get.mockResolvedValueOnce(cached);
    const actor = await s.access.resolve(s.tx as never, 't1', 'a1');
    expect(actor.perms).toBe(cached);
    expect(s.tx.coreUser.findFirst).toHaveBeenCalledTimes(1);
    expect(s.tx.campUserPermission.findMany).not.toHaveBeenCalled();
  });

  it('OWNER / ADMIN → tenant admin (бүх кемп, бүх эрх); REQUESTER биш', async () => {
    for (const role of [UserRole.OWNER, UserRole.ADMIN]) {
      setActor(s.tx, { role });
      const { perms } = await s.access.resolve(s.tx as never, 't1', 'a1');
      expect(perms.isTenantAdmin).toBe(true);
      expect(CampAccessService.has(perms, 'any-camp', P.ROLES_MANAGE)).toBe(true);
      expect(CampAccessService.has(perms, null, P.MASTER_MANAGE)).toBe(true);
    }
    setActor(s.tx, { role: UserRole.APPROVER });
    expect((await s.access.resolve(s.tx as never, 't1', 'a1')).perms.isTenantAdmin).toBe(false);
  });

  it('has: кемпийн эрх зөвхөн тэр кемпэд; global бүх кемпэд; tenant түвшинд (null) зөвхөн global', () => {
    const perms: CampPermissionSet = { isTenantAdmin: false, global: [P.REPORT_VIEW], byCamp: { c1: [P.MASTER_MANAGE] } };
    expect(CampAccessService.has(perms, 'c1', P.MASTER_MANAGE)).toBe(true);
    expect(CampAccessService.has(perms, 'c2', P.MASTER_MANAGE)).toBe(false);
    expect(CampAccessService.has(perms, null, P.MASTER_MANAGE)).toBe(false);
    expect(CampAccessService.has(perms, 'c2', P.REPORT_VIEW)).toBe(true);
    expect(CampAccessService.has(perms, null, P.REPORT_VIEW)).toBe(true);
  });

  it('hasAccess: тухайн кемпэд ямар нэг эрх; null = аль нэг кемпэд', () => {
    const none: CampPermissionSet = { isTenantAdmin: false, global: [], byCamp: {} };
    const c1: CampPermissionSet = { isTenantAdmin: false, global: [], byCamp: { c1: [P.MEAL_ORDER] } };
    const empty: CampPermissionSet = { isTenantAdmin: false, global: [], byCamp: { c1: [] } };
    expect(CampAccessService.hasAccess(none, null)).toBe(false);
    expect(CampAccessService.hasAccess(c1, null)).toBe(true);
    expect(CampAccessService.hasAccess(c1, 'c1')).toBe(true);
    expect(CampAccessService.hasAccess(c1, 'c2')).toBe(false);
    expect(CampAccessService.hasAccess(empty, 'c1')).toBe(false);
    expect(CampAccessService.hasAccess({ ...none, global: [P.REPORT_VIEW] }, 'c9')).toBe(true);
  });

  it('require: аль нэг эрх байхад хангалттай; үгүй бол 403 мессеж кодыг нэрлэнэ; core_users.id буцаана', async () => {
    setActor(s.tx, { userId: 'cu7', roles: [{ campId: 'c1', perms: [P.ROOM_MANAGE] }] });
    await expect(s.access.require(s.tx as never, 't1', 'a1', 'c1', [P.ROOM_MANAGE, P.MASTER_MANAGE])).resolves.toBe('cu7');
    await expect(s.access.require(s.tx as never, 't1', 'a1', 'c1', P.MASTER_MANAGE)).rejects.toThrow(/camp\.master\.manage эрх шаардлагатай/);
    await expect(s.access.require(s.tx as never, 't1', 'a1', 'c2', P.ROOM_MANAGE)).rejects.toThrow(ForbiddenException);
  });

  it('requireAccess: эрхгүй кемп → 403', async () => {
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.MEAL_ORDER] }] });
    await expect(s.access.requireAccess(s.tx as never, 't1', 'a1', 'c2')).rejects.toThrow(/хандах эрх алга/);
    await expect(s.access.requireAccess(s.tx as never, 't1', 'a1', 'c1')).resolves.toMatchObject({ userId: 'cu-actor' });
  });

  it('invalidate → tenant cache цэвэрлэнэ', async () => {
    await s.access.invalidate('t1');
    expect(s.cache.invalidateTenant).toHaveBeenCalledWith('t1');
  });
});

describe('camp-errors (Шат 2.1)', () => {
  const known = (code: string, meta?: Record<string, unknown>) =>
    new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: '5.22.0', meta });

  it('P2002 → 409 (талбар нэрлэнэ), P2003 → 400, P2025 → 404', () => {
    const e = toCampHttpError(known('P2002', { target: ['tenant_id', 'code'] }));
    expect(e).toBeInstanceOf(ConflictException);
    expect((e as Error).message).toContain('tenant_id, code');
    expect(toCampHttpError(known('P2003'))).toBeInstanceOf(BadRequestException);
    expect(toCampHttpError(known('P2025'))).toBeInstanceOf(NotFoundException);
  });

  it('trigger CAMP_* → 409 мессежтэй; EXCLUDE → 409; CHECK → 400; бусад → өөрчлөхгүй', () => {
    const trig = toCampHttpError(new Error('db error: ERROR: CAMP_SYSTEM_ROLE: системийн ролийг устгах боломжгүй (Кемп админ)'));
    expect(trig).toBeInstanceOf(ConflictException);
    expect((trig as Error).message).toBe('CAMP_SYSTEM_ROLE: системийн ролийг устгах боломжгүй (Кемп админ)');
    expect(toCampHttpError(new Error('conflicting key value violates exclusion constraint "ex_camp_stays_overlap"'))).toBeInstanceOf(ConflictException);
    expect(toCampHttpError(new Error('new row for relation "camp_rooms" violates check constraint "camp_rooms_capacity_check"'))).toBeInstanceOf(BadRequestException);
    const other = new Error('connection lost');
    expect(toCampHttpError(other)).toBe(other);
    const http = new NotFoundException('x');
    expect(toCampHttpError(http)).toBe(http);
  });

  // [PRISMA-003] Prisma 5 PrismaClientUnknownRequestError-ийн БОДИТ хэлбэр (Rust Debug, escape-тэй хашилт)
  const prismaPg = (code: string, msg: string) =>
    new Prisma.PrismaClientUnknownRequestError(
      '\nInvalid `prisma.x.create()` invocation:\n\n\nError occurred during query execution:\n' +
        `ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "${code}", message: "${msg}", severity: "ERROR", detail: None, column: None, hint: None }), transient: false })`,
      { clientVersion: '5.22.0' },
    );

  it('Prisma хэлбэр: EXCLUDE (\\"ex_*\\") → 409 constraint нэртэй; CHECK (\\"..._check\\") → 400', () => {
    const ex = toCampHttpError(prismaPg('23P01', 'conflicting key value violates exclusion constraint \\"ex_camp_shift_patterns_overlap\\"'));
    expect(ex).toBeInstanceOf(ConflictException);
    expect((ex as Error).message).toBe('Хугацаа/муж давхцаж байна (ex_camp_shift_patterns_overlap)');
    const ck = toCampHttpError(prismaPg('23514', 'new row for relation \\"camp_rooms\\" violates check constraint \\"camp_rooms_capacity_check\\"'));
    expect(ck).toBeInstanceOf(BadRequestException);
    expect((ck as Error).message).toBe('Өгөгдөл дүрэм зөрчиж байна (camp_rooms_capacity_check)');
  });

  it('Prisma хэлбэр: мессеж танигдахгүй ч SQLSTATE 23P01 / 23514 → 409 / 400', () => {
    expect(toCampHttpError(prismaPg('23P01', 'өөр хэлбэрийн текст'))).toBeInstanceOf(ConflictException);
    expect(toCampHttpError(prismaPg('23514', 'өөр хэлбэрийн текст'))).toBeInstanceOf(BadRequestException);
    const other = prismaPg('40001', 'could not serialize access');
    expect(toCampHttpError(other)).toBe(other);
  });

  it('Prisma хэлбэр: trigger мессеж (кирилл) → 409, төгсгөлд хашилт/escape үлдэхгүй', () => {
    const e = toCampHttpError(prismaPg('23514', 'CAMP_HAUL_LOCKED: батлагдсан бүртгэлийг өөрчлөх боломжгүй (H-1)'));
    expect(e).toBeInstanceOf(ConflictException);
    expect((e as Error).message).toBe('CAMP_HAUL_LOCKED: батлагдсан бүртгэлийг өөрчлөх боломжгүй (H-1)');
  });

  it('withCampErrors: амжилт → утга; алдаа → хөрвүүлж шиднэ', async () => {
    await expect(withCampErrors(async () => 5)).resolves.toBe(5);
    await expect(withCampErrors(async () => { throw known('P2002'); })).rejects.toThrow(ConflictException);
  });
});

describe('camp-tx (Шат 2.1)', () => {
  it('inTenantTx: эхлээд set_config(app.tenant_id), дараа fn (RULE-04)', async () => {
    const { tx, prisma } = setup();
    const fn = vi.fn().mockResolvedValue('ok');
    await expect(inTenantTx(prisma as never, 't9', fn)).resolves.toBe('ok');
    expectTenantTx(tx, 't9');
    expect(fn.mock.calls[0][0]).toBe(tx);
  });
  it('огноо / цаг хөрвүүлэлт (UTC, timezone-оос хамаарахгүй)', () => {
    expect(toDbDate('2026-10-07').toISOString()).toBe('2026-10-07T00:00:00.000Z');
    expect(fromDbDate(new Date('2026-10-07T00:00:00.000Z'))).toBe('2026-10-07');
    expect(toDbTime('15:30').toISOString()).toBe('1970-01-01T15:30:00.000Z');
    expect(fromDbTime(new Date('1970-01-01T09:05:00.000Z'))).toBe('09:05');
  });
});
