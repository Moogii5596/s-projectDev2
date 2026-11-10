import { Injectable } from '@nestjs/common';
import { CampAuditAction, CampEmployeeStatus, CampMovementDirection } from '@prisma/client';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { UserAdminService } from '../../../auth/user-admin.service';
import { TenantCacheService } from '../../../auth/tenant-cache.service';
import { CampAccessService } from '../../camp/common/camp-access.service';
import { CampAuditService, type AuditEntry } from '../../camp/common/camp-audit.service';
import { isInternalEmail } from '../../../auth/invite-token';
import { CAMP_PERMISSIONS } from '../../camp/common/camp-permissions';
import { fromDbDate, inTenantTx, toDbDate, Tx } from '../../camp/common/camp-tx';
import { withCampErrors } from '../../camp/common/camp-errors';
import { isRealIsoDate, todayUb } from '../../camp/common/camp-date';
import { badRequest, conflict, notFound } from '../../../common/i18n/app-error';
import { t, type I18nParams } from '../../../common/i18n/translate';
import { HrAttendanceHooks } from '../attendance/stay-store';
import { applyPlan, loadPlannerState, lockCampAttendance } from '../attendance/attendance-state';
import { planImport } from '../attendance/import-planner';
import type { ParsedRow } from '../attendance/import-parser';
import { HrEmployeeHooks } from './employee-hooks';
import { EMPLOYEE_AUDIT_FIELDS, HrEmployeesService } from './hr-employees.service';
import { normalizeExtraPhones, phonesOut, replaceExtraPhones, resolveNames } from './employee-names';
import { applyIssues, clearedBy, readIssues, toJson } from './data-issues';
import { QueryPiiViewsDto, RehireEmployeeDto, TerminateEmployeeDto } from './hr-employees.dto';

const P = CAMP_PERMISSIONS;
const TX = { timeout: 30_000, maxWait: 10_000 };
/** B5-Q6: нэг хүн × нэг ажилтан — энэ хугацаанд дахин нээвэл шинэ мөр бичихгүй */
const PII_DEDUP_MINUTES = 15;
const TERMINATION_AUDIT_FIELDS = ['status', 'terminatedAt', 'terminationReason', 'terminationNote'] as const;

/** Ажлаас гарахад нэвтрэх эрхийг хаахгүй байх шалтгаан (Блок 4-ийн `deactivateBlocker`-тэй ижил дүрэм, ижил код) */
export function terminationUserBlocker(
  user: { id: string; role: string; isActive: boolean } | null,
  actorUserId: string,
  activeOwners: number,
  actorIsTenantAdmin = true,
): 'camp.err.user.1' | 'camp.err.user.2' | 'camp.err.access.admin' | null {
  if (!user || !user.isActive) return null;
  if (user.id === actorUserId) return 'camp.err.user.1';
  // SEC-009: системийн админы (OWNER / ADMIN) нэвтрэх эрхийг зөвхөн системийн админ хаана
  if (!actorIsTenantAdmin && CampAccessService.isTenantAdminRole(user.role)) return 'camp.err.access.admin';
  if (user.role === 'OWNER' && activeOwners <= 1) return 'camp.err.user.2';
  return null;
}

/**
 * Ажлаас гаргах огноо: бодит огноо, өнөөдрөөс (УБ) хойш биш (B5-Q3). Буцаах: алдааны код эсвэл null.
 */
export function terminationDateError(date: string, today: string): 'camp.err.employees.terminate_date' | 'camp.err.employees.terminate_future' | null {
  if (!isRealIsoDate(date)) return 'camp.err.employees.terminate_date';
  if (date > today) return 'camp.err.employees.terminate_future';
  return null;
}

/**
 * v0.2.2 Блок 5 — ажилтны амьдралын мөчлөг: ажлаас гаргах (D-07), дахин ажилд авах (Q-C, Q-C2), профайл + PII лог (D-08).
 *
 * GoTrue (ban) нь DB transaction-ээс гадуур: эхлээд ban → DB transaction → амжилтгүй бол ban-ийг буцаана (Блок 4 `setActive`-тэй ижил).
 */
@Injectable()
export class HrEmployeeLifecycleService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
    private readonly audit: CampAuditService,
    private readonly employees: HrEmployeesService,
    private readonly attendanceHooks: HrAttendanceHooks,
    private readonly hooks: HrEmployeeHooks,
    private readonly userAdmin: UserAdminService,
    private readonly tenantCache: TenantCacheService,
  ) {}

  // ── Ажлаас гаргах ──────────────────────────────────────────

  /**
   * POST /hr/sites/:campId/employees/:id/terminate { date, reason, note? } — нэг transaction:
   *  1) кемпэд байгаа бол (нээлттэй stay) `date`-нд явалт бүртгэнэ (ирцийн planner — ростерын хоол, ээлжийн бус бол хоолгүй)
   *  2) өрөөний хуваарилалт чөлөөлнө (Кемпийн порт)
   *  3) ажилтан TERMINATED + огноо/шалтгаан
   *  4) нэвтрэх эрх: `is_active=false`, хүлээгдэж буй урилга хүчингүй (+ GoTrue ban — transaction-ээс өмнө)
   *  5) аудит (employee TERMINATE, user_account DEACTIVATE); commit-ийн дараа эрхийн cache цэвэрлэнэ
   * `date`-ээс хойш ирцийн бүртгэл байвал 409 (эхлээд түүнийг устгана).
   */
  async terminate(tenantId: string, authId: string, campId: string, id: string, dto: TerminateEmployeeDto) {
    const dateErr = terminationDateError(dto.date, todayUb());
    if (dateErr) throw badRequest(dateErr, { today: todayUb() });

    const prep = await inTenantTx(this.prisma, tenantId, async (tx) => {
      const actorUserId = await this.access.require(tx, tenantId, authId, campId, P.EMPLOYEE_TERMINATE);
      const actor = await this.access.resolve(tx, tenantId, authId);
      const e = await this.loadForTermination(tx, tenantId, campId, id);
      await this.assertNoMovementsAfter(tx, tenantId, id, dto.date);
      const owners = e.user?.role === 'OWNER' ? await tx.coreUser.count({ where: { tenantId, role: 'OWNER', isActive: true } }) : 0;
      const blocked = terminationUserBlocker(e.user, actorUserId, owners, actor.perms.isTenantAdmin);
      if (blocked) throw badRequest(blocked);
      return e;
    });

    const banUser = prep.user?.isActive ? prep.user : null;
    if (banUser) await this.userAdmin.setBanned(banUser.authId, true);
    let result: Awaited<ReturnType<HrEmployeeLifecycleService['terminateTx']>>;
    try {
      result = await withCampErrors(() => inTenantTx(this.prisma, tenantId, (tx) => this.terminateTx(tx, tenantId, authId, campId, id, dto, banUser !== null), TX));
    } catch (err) {
      if (banUser) await this.userAdmin.setBanned(banUser.authId, false).catch(() => undefined);
      throw err;
    }
    // №3 (Блок 6б): нэвтрэх эрх хаагдсан бол membership cache-ийг шууд цэвэрлэнэ
    if (banUser) await this.tenantCache.invalidateMember(tenantId, banUser.authId);
    await this.access.invalidate(tenantId);
    return result;
  }

  private async loadForTermination(tx: Tx, tenantId: string, campId: string, id: string) {
    const e = await tx.hrEmployee.findFirst({
      where: { id, tenantId, campId },
      select: {
        id: true, employeeCode: true, fullName: true, status: true, userId: true,
        user: { select: { id: true, authId: true, role: true, isActive: true, fullName: true, email: true } },
      },
    });
    if (!e) throw notFound('camp.err.employees.8');
    if (e.status === CampEmployeeStatus.TERMINATED) throw conflict('camp.err.employees.already_terminated');
    return e;
  }

  private async assertNoMovementsAfter(tx: Tx, tenantId: string, employeeId: string, date: string) {
    const later = await tx.hrMovement.findFirst({
      where: { tenantId, employeeId, movementDate: { gt: toDbDate(date) } },
      select: { movementDate: true },
      orderBy: { movementDate: 'desc' },
    });
    if (later) throw conflict('camp.err.employees.movements_after', { date: fromDbDate(later.movementDate) });
  }

  private async terminateTx(tx: Tx, tenantId: string, authId: string, campId: string, id: string, dto: TerminateEmployeeDto, deactivateUser: boolean) {
    const actorUserId = await this.access.require(tx, tenantId, authId, campId, P.EMPLOYEE_TERMINATE);
    await lockCampAttendance(tx, campId);
    const e = await this.loadForTermination(tx, tenantId, campId, id);
    await this.assertNoMovementsAfter(tx, tenantId, id, dto.date);
    const before = await tx.hrEmployee.findFirstOrThrow({ where: { id, tenantId }, select: { status: true, terminatedAt: true, terminationReason: true, terminationNote: true } });

    const departure = await this.recordDepartureIfInCamp(tx, tenantId, campId, actorUserId, e.employeeCode, id, dto.date);
    const rooms = await this.hooks.site.releaseOnTermination(tx, tenantId, id, dto.date);

    const res = await tx.hrEmployee.updateMany({
      where: { id, tenantId, status: { not: CampEmployeeStatus.TERMINATED } },
      data: { status: CampEmployeeStatus.TERMINATED, terminatedAt: toDbDate(dto.date), terminationReason: dto.reason, terminationNote: dto.note ?? null },
    });
    if (res.count !== 1) throw conflict('camp.err.employees.already_terminated');
    const after = { status: CampEmployeeStatus.TERMINATED, terminatedAt: toDbDate(dto.date), terminationReason: dto.reason, terminationNote: dto.note ?? null };

    const audits: AuditEntry[] = [
      {
        tenantId, campId, entityType: 'employee', entityId: id, action: CampAuditAction.TERMINATE, actorUserId,
        fields: TERMINATION_AUDIT_FIELDS, before, after,
        summaryParams: { code: e.employeeCode, name: e.fullName, date: dto.date },
      },
    ];
    if (deactivateUser && e.user) {
      await tx.coreUser.updateMany({ where: { id: e.user.id, tenantId }, data: { isActive: false } });
      await tx.coreUserInvite.updateMany({ where: { tenantId, userId: e.user.id, usedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
      audits.push({
        tenantId, campId, entityType: 'user_account', entityId: e.user.id, action: CampAuditAction.UPDATE, actorUserId,
        fields: ['isActive'], before: { isActive: true }, after: { isActive: false },
        summaryParams: { name: e.user.fullName ?? e.user.email },
      });
    }
    await this.audit.recordMany(tx, audits);
    return {
      id,
      status: CampEmployeeStatus.TERMINATED,
      terminatedAt: dto.date,
      departureRecorded: departure,
      roomsClosed: rooms.closed,
      roomsRemoved: rooms.removed,
      userDeactivated: deactivateUser && e.user !== null,
    };
  }

  /**
   * Нээлттэй stay байвал `date`-нд явалт (ирцийн planner-ээр — гараар бүртгэлтэй ижил дүрэм).
   * Хоол: ростерын анхдагч; ээлжийн бус (хоол заавал) бол хоолгүй ([]). INACTIVE ажилтанд ч (гарч байгаа тул) бүртгэнэ.
   */
  private async recordDepartureIfInCamp(tx: Tx, tenantId: string, campId: string, actorId: string, code: string, employeeId: string, date: string): Promise<boolean> {
    const stays = await this.attendanceHooks.stays.findForPlanner(tx, tenantId, [employeeId], toDbDate(date));
    if (!stays.some((s) => s.endDate === null)) return false;
    const state = await loadPlannerState(tx, tenantId, campId, [code], [date], this.attendanceHooks.stays);
    const emp = state.employees.get(code);
    if (emp) state.employees.set(code, { ...emp, status: CampEmployeeStatus.ACTIVE });
    const row = (meals: ParsedRow['meals']): ParsedRow => ({ row: 1, employeeCode: code, date, direction: CampMovementDirection.DEPARTURE, meals, shift: null, errors: [] });
    let plan = planImport([row(null)], state);
    if (plan.errorRows > 0) plan = planImport([row([])], state);
    if (plan.errorRows > 0) throw badRequest('camp.err.employees.departure', { errors: plan.rows[0].errors.join('; ') });
    await applyPlan(tx, { tenantId, campId, actorId, importId: null, reason: 'Ажлаас гарсан' }, plan, this.attendanceHooks.stays);
    return true;
  }

  // ── Дахин ажилд авах ───────────────────────────────────────

  /**
   * POST /hr/sites/:campId/employees/:id/rehire — хуучин TERMINATED бүртгэлээс ШИНЭ бүртгэл (`rehired_from_id`).
   * Код: өгөөгүй бол хуучин код (Q-C2). Нэвтрэх эрх (`transferUser`, анхдагч тийм — Q-C (1)): хуучин хэрэглэгчийг шинэ бүртгэлд
   * шилжүүлнэ — бүх роль/шууд эрх цэвэрлэгдэж, албан тушаалын загвараас дахин (DB trigger), идэвхжинэ (+ GoTrue ban арилна).
   */
  async rehire(tenantId: string, authId: string, campId: string, id: string, dto: RehireEmployeeDto) {
    const transfer = dto.transferUser ?? true;
    const prep = await inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.require(tx, tenantId, authId, campId, P.EMPLOYEE_TERMINATE);
      const loaded = await this.loadForRehire(tx, tenantId, campId, id, dto);
      // SEC-009: системийн админы нэвтрэх эрхийг (идэвхжүүлэх, роль цэвэрлэх) зөвхөн системийн админ шилжүүлнэ
      if (transfer && loaded.old.user && CampAccessService.isTenantAdminRole(loaded.old.user.role)) {
        await this.access.requireTenantAdmin(tx, tenantId, authId);
      }
      return loaded;
    });
    const unbanUser = transfer && prep.old.user ? prep.old.user : null;
    if (unbanUser && !unbanUser.isActive) await this.userAdmin.setBanned(unbanUser.authId, false);
    let created: Awaited<ReturnType<HrEmployeeLifecycleService['rehireTx']>>;
    try {
      created = await withCampErrors(() => inTenantTx(this.prisma, tenantId, (tx) => this.rehireTx(tx, tenantId, authId, campId, id, dto, transfer), TX));
    } catch (err) {
      if (unbanUser && !unbanUser.isActive) await this.userAdmin.setBanned(unbanUser.authId, true).catch(() => undefined);
      throw err;
    }
    if (unbanUser) await this.tenantCache.invalidateMember(tenantId, unbanUser.authId);
    await this.access.invalidate(tenantId);
    return created;
  }

  private async loadForRehire(tx: Tx, tenantId: string, campId: string, id: string, dto: RehireEmployeeDto) {
    const old = await tx.hrEmployee.findFirst({
      where: { id, tenantId, campId },
      include: {
        user: { select: { id: true, authId: true, isActive: true, fullName: true, email: true, role: true } },
        rehiredAs: { select: { employeeCode: true } },
        extraPhones: { select: { phone: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!old) throw notFound('camp.err.employees.8');
    if (old.status !== CampEmployeeStatus.TERMINATED) throw conflict('camp.err.employees.not_terminated');
    if (old.rehiredAs.length > 0) throw conflict('camp.err.employees.already_rehired', { code: old.rehiredAs[0].employeeCode });
    const code = dto.employeeCode ?? old.employeeCode;
    await this.employees.assertCodeUnique(tx, tenantId, code);
    return { old, code };
  }

  private async rehireTx(tx: Tx, tenantId: string, authId: string, campId: string, id: string, dto: RehireEmployeeDto, transfer: boolean) {
    const actorUserId = await this.access.require(tx, tenantId, authId, campId, P.EMPLOYEE_TERMINATE);
    const { old, code } = await this.loadForRehire(tx, tenantId, campId, id, dto);
    const refs = {
      organizationId: dto.organizationId ?? old.organizationId,
      departmentId: dto.departmentId ?? old.departmentId,
      crewId: dto.crewId !== undefined ? dto.crewId : old.crewId,
      mealLocationId: dto.mealLocationId !== undefined ? dto.mealLocationId : old.mealLocationId,
    };
    await this.employees.assertRefs(tx, tenantId, campId, refs);
    const pos = dto.positionId !== undefined || dto.position !== undefined
      ? await this.employees.resolvePosition(tx, tenantId, dto)
      : old.positionId
        ? await this.employees.resolvePosition(tx, tenantId, { positionId: old.positionId })
        : { positionId: null, position: old.position };

    // v0.2.3 Блок D (S1): нэр — өгсөн талбар, үлдсэнийг хуучнаас
    const names = resolveNames(dto, { familyName: old.familyName, lastName: old.lastName, firstName: old.firstName ?? '', fullName: old.fullName })
      ?? { familyName: old.familyName, lastName: old.lastName, firstName: old.firstName ?? old.fullName, fullName: old.fullName };
    if (!names.firstName) throw badRequest('camp.err.employees.name_required');

    const user = transfer ? old.user : null;
    if (user) {
      // Q-C (1): эрх загвараас дахин — хуучин бүх олголт/шууд эрхийг цэвэрлээд (TEMPLATE мөр CASCADE), холбоосыг шилжүүлнэ
      await tx.hrEmployee.update({ where: { id: old.id }, data: { userId: null } });
      await tx.coreUserPermission.deleteMany({ where: { tenantId, userId: user.id } });
      await tx.coreUserRole.deleteMany({ where: { tenantId, userId: user.id } });
    }
    const created = await tx.hrEmployee.create({
      data: {
        tenantId,
        campId,
        organizationId: refs.organizationId,
        departmentId: refs.departmentId,
        crewId: refs.crewId,
        employeeCode: code,
        ...names,
        position: pos.position ?? null,
        positionId: pos.positionId ?? null,
        mealLocationId: refs.mealLocationId,
        mealsIncluded: dto.mealsIncluded !== undefined ? dto.mealsIncluded : old.mealsIncluded,
        phone: dto.phone !== undefined ? dto.phone : old.phone,
        email: dto.email !== undefined ? (dto.email ? dto.email.toLowerCase() : null) : old.email,
        rehiredFromId: old.id,
        // S9: хуучин бүртгэлийн «Мэдээлэл дутуу» (гарсан огноогоос бусад) шинэ бүртгэлд үлдэнэ; зассан талбар арилна
        dataIssues: toJson(applyIssues(readIssues(old.dataIssues), { terminatedAt: null, ...clearedBy(dto) })),
        // trigger trg_camp_employees_position_roles: user_id + position_id → албан тушаалын загварын роль
        userId: user?.id ?? null,
      },
      select: { id: true, employeeCode: true, fullName: true, status: true, userId: true, rehiredFromId: true, ...Object.fromEntries(EMPLOYEE_AUDIT_FIELDS.map((f) => [f, true])) },
    });
    // S2: нэмэлт утас — өгсөн бол түүгээр, эс бөгөөс хуучнаас
    const primary = dto.phone !== undefined ? dto.phone : old.phone;
    const extra = normalizeExtraPhones(dto.extraPhones ?? phonesOut(old.extraPhones), primary);
    if (extra.length > 0) await replaceExtraPhones(tx, tenantId, created.id, extra);
    if (user && !user.isActive) {
      await tx.coreUser.updateMany({ where: { id: user.id, tenantId }, data: { isActive: true } });
    }
    const createdRow = created as unknown as Record<string, unknown> & { id: string };
    await this.audit.recordMany(tx, [
      {
        tenantId, campId, entityType: 'employee', entityId: created.id, action: CampAuditAction.REHIRE, actorUserId,
        fields: [...EMPLOYEE_AUDIT_FIELDS, 'rehiredFromId'], before: null, after: createdRow,
        summaryParams: { code: created.employeeCode, name: created.fullName, fromCode: old.employeeCode },
      },
      ...(user
        ? [{
            tenantId, campId, entityType: 'user_account' as const, entityId: user.id, action: CampAuditAction.UPDATE, actorUserId,
            fields: ['isActive', 'employeeId'], before: { isActive: user.isActive, employeeId: old.id }, after: { isActive: true, employeeId: created.id },
            summaryParams: { name: user.fullName ?? user.email },
          }]
        : []),
    ]);
    return { id: created.id, employeeCode: created.employeeCode, rehiredFromId: old.id, userId: created.userId, userTransferred: user !== null };
  }

  // ── Профайл, PII лог ───────────────────────────────────────

  /**
   * GET /hr/sites/:campId/employees/:id/profile — мэдээлэл (утас, имэйл бүтнээр), нэвтрэх эрх, ирц (сүүлийн 20), кемпэд байгаа эсэх,
   * өрөөний түүх, өөрчлөлтийн түүх (ажилтан + нэвтрэх эрх), дахин ажилд авсан холбоос. Нээх бүрт PII лог (15 мин-д 1).
   */
  async profile(tenantId: string, authId: string, campId: string, id: string) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      const actor = await this.access.requireAccess(tx, tenantId, authId, campId);
      const e = await tx.hrEmployee.findFirst({
        where: { id, tenantId, campId },
        select: {
          id: true, campId: true, employeeCode: true, fullName: true, familyName: true, lastName: true, firstName: true, position: true, phone: true, email: true, status: true,
          extraPhones: { select: { phone: true }, orderBy: { sortOrder: 'asc' } },
          dataIssues: true,
          organizationId: true, departmentId: true, crewId: true, positionId: true, mealLocationId: true, mealsIncluded: true,
          terminatedAt: true, terminationReason: true, terminationNote: true, createdAt: true, updatedAt: true, userId: true,
          organization: { select: { name: true } },
          department: { select: { code: true, name: true, nameI18n: true } },
          crew: { select: { code: true } },
          positionRef: { select: { name: true, nameI18n: true } },
          user: { select: { id: true, isActive: true, phone: true, username: true, email: true } },
          rehiredFrom: { select: { id: true, employeeCode: true, terminatedAt: true } },
          rehiredAs: { select: { id: true, employeeCode: true, status: true } },
        },
      });
      if (!e) throw notFound('camp.err.employees.8');
      await this.logPiiView(tx, tenantId, actor.userId, id);

      const today = todayUb();
      const [movements, stays, rooms, history] = await Promise.all([
        tx.hrMovement.findMany({
          where: { tenantId, employeeId: id },
          select: { id: true, movementDate: true, direction: true, kind: true, meals: true },
          orderBy: [{ movementDate: 'desc' }, { direction: 'asc' }],
          take: 20,
        }),
        this.attendanceHooks.stays.findForPlanner(tx, tenantId, [id], toDbDate(today)),
        this.hooks.site.roomHistory(tx, tenantId, id, 50),
        this.history(tx, tenantId, [id, ...(e.userId ? [e.userId] : [])]),
      ]);
      const open = stays.find((s) => s.endDate === null);
      const { user, rehiredAs, extraPhones, ...rest } = e;
      return {
        ...rest,
        extraPhones: phonesOut(extraPhones),
        dataIssues: readIssues(rest.dataIssues),
        terminatedAt: e.terminatedAt ? fromDbDate(e.terminatedAt) : null,
        user: user ? { id: user.id, isActive: user.isActive, phone: user.phone, username: user.username, hasEmail: !isInternalEmail(user.email) } : null,
        rehiredFrom: e.rehiredFrom ? { ...e.rehiredFrom, terminatedAt: e.rehiredFrom.terminatedAt ? fromDbDate(e.rehiredFrom.terminatedAt) : null } : null,
        rehiredAs: rehiredAs[0] ?? null,
        attendance: {
          inCampSince: open ? fromDbDate(open.startDate) : null,
          movements: movements.map((m) => ({ ...m, movementDate: fromDbDate(m.movementDate) })),
        },
        rooms,
        history,
        can: {
          terminate: CampAccessService.has(actor.perms, campId, P.EMPLOYEE_TERMINATE),
          // SEC-009 (Блок 6б): «Хэн үзсэн» — зөвхөн системийн админ (OWNER / ADMIN)
          viewPiiLog: actor.perms.isTenantAdmin,
        },
      };
    });
  }

  /** B5-Q6: атом — сүүлийн 15 минутад ижил хүн × ажилтан бичигдээгүй бол л нэмнэ (DB-ийн цаг, TEST-024) */
  private async logPiiView(tx: Tx, tenantId: string, viewerUserId: string, employeeId: string) {
    await tx.$executeRaw`
      INSERT INTO camp_pii_access_log (tenant_id, viewer_user_id, employee_id, context)
      SELECT ${tenantId}::uuid, ${viewerUserId}::uuid, ${employeeId}::uuid, 'profile'
      WHERE NOT EXISTS (
        SELECT 1 FROM camp_pii_access_log
        WHERE tenant_id = ${tenantId}::uuid AND viewer_user_id = ${viewerUserId}::uuid AND employee_id = ${employeeId}::uuid
          AND viewed_at > now() - make_interval(mins => ${PII_DEDUP_MINUTES}::int)
      )`;
  }

  private async history(tx: Tx, tenantId: string, entityIds: string[]) {
    const rows = await tx.campAuditLog.findMany({
      where: { tenantId, entityId: { in: entityIds }, entityType: { in: ['employee', 'user_account'] } },
      select: { id: true, entityType: true, action: true, summaryKey: true, summaryParams: true, diff: true, actorUserId: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
    });
    const names = await this.userNames(tx, tenantId, rows.map((r) => r.actorUserId));
    // summary: хүсэлтийн хэлээр орчуулсан мөр (frontend-д audit.* түлхүүр алга)
    return rows.map((r) => ({ ...r, summary: t(r.summaryKey, r.summaryParams as I18nParams), actorName: names.get(r.actorUserId) ?? null }));
  }

  private async userNames(tx: Tx, tenantId: string, ids: string[]) {
    const uniq = [...new Set(ids)];
    const users = uniq.length ? await tx.coreUser.findMany({ where: { tenantId, id: { in: uniq } }, select: { id: true, fullName: true, email: true } }) : [];
    return new Map(users.map((u) => [u.id, u.fullName || u.email]));
  }

  /** GET /hr/sites/:campId/employees/:id/pii-views — «Хэн үзсэн»: зөвхөн системийн админ (SEC-009) */
  async piiViews(tenantId: string, authId: string, campId: string, id: string, q: QueryPiiViewsDto) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireTenantAdmin(tx, tenantId, authId);
      const e = await tx.hrEmployee.findFirst({ where: { id, tenantId, campId }, select: { id: true } });
      if (!e) throw notFound('camp.err.employees.8');
      const rows = await tx.campPiiAccessLog.findMany({
        where: { tenantId, employeeId: id },
        select: { id: true, viewerUserId: true, context: true, viewedAt: true },
        orderBy: [{ viewedAt: 'desc' }, { id: 'desc' }],
        take: q.limit ?? 100,
      });
      const names = await this.userNames(tx, tenantId, rows.map((r) => r.viewerUserId));
      return { data: rows.map((r) => ({ ...r, viewerName: names.get(r.viewerUserId) ?? null })) };
    });
  }
}
