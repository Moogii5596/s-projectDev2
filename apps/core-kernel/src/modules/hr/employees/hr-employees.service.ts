import { Injectable } from '@nestjs/common';
import { CampEmployeeStatus, Prisma } from '@prisma/client';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../../camp/common/camp-access.service';
import { CampAuditService } from '../../camp/common/camp-audit.service';
import { CAMP_PERMISSIONS } from '../../camp/common/camp-permissions';
import { inTenantTx, Tx } from '../../camp/common/camp-tx';
import { withCampErrors } from '../../camp/common/camp-errors';
import { assertMealLocation, getCampOr404, getRosterSettings } from '../../camp/common/camp-lookup';
import { assertPosition, resolvePositionByName } from '../positions/hr-positions.service';
import { effectiveEmployee, loadPositionDefaults } from '../../camp/common/position-defaults';
import { decodeCursor, encodeCursor } from '../../../common/utils/cursor';
import { BulkEmployeesDto, CreateEmployeeDto, QueryEmployeesDto, UpdateEmployeeDto } from './hr-employees.dto';
import { badRequest, conflict, notFound } from '../../../common/i18n/app-error';
import { normalizeExtraPhones, phonesOut, replaceExtraPhones, resolveNames } from './employee-names';
import { applyIssues, clearedBy, DataIssue, readIssues, toJson } from './data-issues';
import { allocateEmployeeCode } from './employee-code';

const P = CAMP_PERMISSIONS;
const EMPLOYEE_SELECT = {
  id: true,
  employeeCode: true,
  fullName: true,
  /** v0.2.3 Блок D (S1) */
  familyName: true,
  lastName: true,
  firstName: true,
  position: true,
  phone: true,
  email: true,
  status: true,
  organizationId: true,
  departmentId: true,
  crewId: true,
  positionId: true,
  mealLocationId: true,
  mealsIncluded: true,
  /** v0.2.2 Блок 4: холбогдсон нэвтрэх эрх (core_users.id) — UI «Нэвтрэх эрх» */
  userId: true,
  /** v0.2.2 Блок 5 — ажлаас гарсан (TERMINATED) */
  terminatedAt: true,
  terminationReason: true,
  createdAt: true,
  updatedAt: true,
  organization: { select: { name: true } },
  department: { select: { code: true, name: true, nameI18n: true } },
  crew: { select: { code: true } },
  positionRef: { select: { name: true, nameI18n: true } },
  workMealLocation: { select: { name: true } },
  /** v0.2.3 Блок D (S2): нэмэлт утас — хариунд `string[]` */
  extraPhones: { select: { phone: true }, orderBy: { sortOrder: 'asc' } },
  /** v0.2.3 Блок D (S9): «Мэдээлэл дутуу» */
  dataIssues: true,
} as const;

type EmployeeRow = Prisma.HrEmployeeGetPayload<{ select: typeof EMPLOYEE_SELECT }>;
/** Хариу: `extraPhones` → `string[]` */
const employeeOut = <T extends Pick<EmployeeRow, 'extraPhones'> & { dataIssues?: Prisma.JsonValue }>(e: T) => ({
  ...e,
  extraPhones: phonesOut(e.extraPhones),
  dataIssues: readIssues(e.dataIssues),
});

/** Түүхэд харьцуулах талбарууд (§0.4) */
export const EMPLOYEE_AUDIT_FIELDS = ['employeeCode', 'fullName', 'familyName', 'lastName', 'firstName', 'position', 'phone', 'email', 'status', 'organizationId', 'departmentId', 'crewId', 'positionId', 'mealLocationId', 'mealsIncluded'] as const;
const EMPLOYEE_AUDIT_SELECT = { id: true, ...Object.fromEntries(EMPLOYEE_AUDIT_FIELDS.map((f) => [f, true])) } as Record<string, true>;

/**
 * Ажилтан (Шат 2.4). employee_code = ирцийн xlsx импортын түлхүүр (tenant дотор давхардахгүй).
 * Хэлтэс/баг тухайн кемпийнх + идэвхтэй, байгууллага идэвхтэй байх ёстой.
 */
@Injectable()
export class HrEmployeesService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
    private readonly audit: CampAuditService,
  ) {}

  /** Лавлах (байгууллага, хэлтэс, бригад, хоолны байршил) — `HrEmployeeLifecycleService` (дахин ажилд авах) ч ашиглана */
  async assertRefs(
    tx: Tx,
    tenantId: string,
    campId: string,
    refs: { organizationId?: string; departmentId?: string; crewId?: string | null; mealLocationId?: string | null },
    current?: { mealLocationId?: string | null },
  ) {
    if (refs.organizationId !== undefined) {
      const org = await tx.coreOrganization.findFirst({ where: { id: refs.organizationId, tenantId }, select: { isActive: true } });
      if (!org) throw badRequest('camp.err.employees.1');
      if (!org.isActive) throw badRequest('camp.err.employees.2');
    }
    if (refs.departmentId !== undefined) {
      const d = await tx.hrDepartment.findFirst({ where: { id: refs.departmentId, tenantId, campId }, select: { isActive: true } });
      if (!d) throw badRequest('camp.err.employees.3');
      if (!d.isActive) throw badRequest('camp.err.employees.4');
    }
    if (refs.crewId !== undefined && refs.crewId !== null) {
      const c = await tx.hrCrew.findFirst({ where: { id: refs.crewId, tenantId, campId }, select: { isActive: true } });
      if (!c) throw badRequest('camp.err.employees.5');
      if (!c.isActive) throw badRequest('camp.err.employees.6');
    }
    // v0.2.1: ажлын хоолны байршил — тухайн кемпийнх, идэвхтэй (одоогийнхоо хэвээр үлдээвэл идэвхгүй ч болно)
    if (refs.mealLocationId && refs.mealLocationId !== current?.mealLocationId) await assertMealLocation(tx, tenantId, campId, refs.mealLocationId);
  }

  /** `positionId` (каталог) эсвэл хуучин `position` текст → {positionId, position(текст)} */
  async resolvePosition(tx: Tx, tenantId: string, dto: { positionId?: string | null; position?: string | null }, currentId?: string | null) {
    if (dto.positionId !== undefined) {
      if (dto.positionId === null) return { positionId: null, position: null };
      const p = await assertPosition(tx, tenantId, dto.positionId, currentId);
      return { positionId: p.id, position: p.name };
    }
    if (dto.position !== undefined) {
      if (!dto.position) return { positionId: null, position: null };
      const p = await resolvePositionByName(tx, tenantId, dto.position, currentId);
      return { positionId: p.id, position: p.name };
    }
    return {};
  }

  /** Q-C2 (v0.2.2 Блок 5): ажлаас гарсан (TERMINATED) бүртгэлийн код дахин ашиглагдана — uq_camp_employees_code partial */
  async assertCodeUnique(tx: Tx, tenantId: string, code: string, exceptId?: string) {
    const dup = await tx.hrEmployee.findFirst({
      where: { tenantId, employeeCode: code, status: { not: CampEmployeeStatus.TERMINATED }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
      select: { fullName: true },
    });
    if (dup) throw conflict('camp.err.employees.7', { code, fullName: dup.fullName });
  }

  async list(tenantId: string, authId: string, campId: string, q: QueryEmployeesDto) {
    const limit = q.limit ?? 20;
    let cursor: { id: string; createdAt: Date } | null = null;
    if (q.cursor) {
      try {
        cursor = decodeCursor(q.cursor);
      } catch {
        throw badRequest('camp.err.assets.11');
      }
    }
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, campId);
      await getCampOr404(tx, tenantId, campId);
      const where: Prisma.HrEmployeeWhereInput = {
        tenantId,
        campId,
        ...(q.departmentId ? { departmentId: q.departmentId } : {}),
        ...(q.crewId ? { crewId: q.crewId === 'none' ? null : q.crewId } : {}),
        ...(q.organizationId ? { organizationId: q.organizationId } : {}),
        // v0.2.2 Блок 5: ажлаас гарсан нь зөвхөн шүүлтээр (status=TERMINATED) харагдана
        ...(q.status ? { status: q.status } : { status: { not: CampEmployeeStatus.TERMINATED } }),
        ...(q.positionId ? { positionId: q.positionId === 'none' ? null : q.positionId } : {}),
        ...(q.mealsIncluded !== undefined ? { mealsIncluded: q.mealsIncluded } : {}),
        // v0.2.3 Блок D (S9): «Мэдээлэл дутуу» шүүлтүүр
        ...(q.dataIssues === true ? { NOT: { dataIssues: { equals: [] } } } : q.dataIssues === false ? { dataIssues: { equals: [] } } : {}),
        ...(q.q
          ? { OR: [{ employeeCode: { contains: q.q, mode: 'insensitive' } }, { fullName: { contains: q.q, mode: 'insensitive' } }] }
          : {}),
        // created_at DESC, id DESC (idx_camp_employees_cursor)
        ...(cursor
          ? { AND: [{ OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }] }
          : {}),
      };
      const rows = await tx.hrEmployee.findMany({
        where,
        select: EMPLOYEE_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      });
      const hasMore = rows.length > limit;
      const data = (await this.withEffective(tx, tenantId, campId, rows.slice(0, limit))).map(employeeOut);
      const last = data[data.length - 1];
      return { data, nextCursor: hasMore && last ? encodeCursor(last.id, last.createdAt) : null, hasMore };
    });
  }

  async get(tenantId: string, authId: string, campId: string, id: string) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, campId);
      const e = await tx.hrEmployee.findFirst({ where: { id, tenantId, campId }, select: EMPLOYEE_SELECT });
      if (!e) throw notFound('camp.err.employees.8');
      return employeeOut((await this.withEffective(tx, tenantId, campId, [e]))[0]);
    });
  }

  async create(tenantId: string, authId: string, campId: string, dto: CreateEmployeeDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const actorUserId = await this.access.require(tx, tenantId, authId, campId, P.EMPLOYEE_MANAGE);
        await getCampOr404(tx, tenantId, campId);
        return this.createInTx(tx, tenantId, campId, actorUserId, dto);
      }),
    );
  }

  /**
   * Нэг transaction дотор ажилтан үүсгэх (эрх, кемпийг дуудагч шалгасан). v0.2.3 R9: ирцийн импортын PREVIEW-ээс
   * шинэ ажилтан бүртгэхэд ижил дүрэм (лавлагаа, код, нэр, албан тушаал, audit); `dataIssues` — S9 тэмдэг.
   */
  async createInTx(tx: Tx, tenantId: string, campId: string, actorUserId: string, dto: CreateEmployeeDto, opts: { dataIssues?: DataIssue[] } = {}) {
    await this.assertRefs(tx, tenantId, campId, { organizationId: dto.organizationId, departmentId: dto.departmentId, crewId: dto.crewId ?? null, mealLocationId: dto.mealLocationId });
    const employeeCode = dto.employeeCode ?? (await allocateEmployeeCode(tx, tenantId, campId)); // R7
    await this.assertCodeUnique(tx, tenantId, employeeCode);
    const pos = await this.resolvePosition(tx, tenantId, dto);
    const names = resolveNames(dto);
    if (!names || !names.firstName) throw badRequest('camp.err.employees.name_required');
    const created = await tx.hrEmployee.create({
      data: {
        tenantId,
        campId,
        organizationId: dto.organizationId,
        departmentId: dto.departmentId,
        crewId: dto.crewId ?? null,
        employeeCode,
        ...names,
        position: pos.position ?? null,
        positionId: pos.positionId ?? null,
        mealLocationId: dto.mealLocationId ?? null,
        mealsIncluded: dto.mealsIncluded ?? null,
        phone: dto.phone ?? null,
        email: dto.email ? dto.email.toLowerCase() : null,
        ...(opts.dataIssues?.length ? { dataIssues: toJson(opts.dataIssues) } : {}),
      },
      select: EMPLOYEE_SELECT,
    });
    const extra = normalizeExtraPhones(dto.extraPhones ?? [], dto.phone);
    if (extra.length > 0) await replaceExtraPhones(tx, tenantId, created.id, extra);
    const out = extra.length > 0 ? { ...created, extraPhones: extra.map((phone) => ({ phone })) } : created;
    await this.audit.record(tx, {
      tenantId, campId, entityType: 'employee', entityId: out.id, action: 'CREATE', actorUserId,
      fields: EMPLOYEE_AUDIT_FIELDS, before: null, after: out,
      summaryParams: { code: out.employeeCode, name: out.fullName },
    });
    return employeeOut(out);
  }

  async update(tenantId: string, authId: string, campId: string, id: string, dto: UpdateEmployeeDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const actorUserId = await this.access.require(tx, tenantId, authId, campId, P.EMPLOYEE_MANAGE);
        const e = await tx.hrEmployee.findFirst({ where: { id, tenantId, campId }, select: EMPLOYEE_AUDIT_SELECT });
        if (!e) throw notFound('camp.err.employees.8');
        // v0.2.2 Блок 5 (Q8): ажлаас гарсан бүртгэл = түүх — засахгүй (дахин орвол шинэ бүртгэл)
        if ((e as { status?: unknown }).status === CampEmployeeStatus.TERMINATED) throw conflict('camp.err.employees.terminated');
        await this.assertRefs(tx, tenantId, campId, { organizationId: dto.organizationId, departmentId: dto.departmentId, crewId: dto.crewId, mealLocationId: dto.mealLocationId }, e as { mealLocationId?: string | null });
        if (dto.employeeCode !== undefined) await this.assertCodeUnique(tx, tenantId, dto.employeeCode, id);
        const fields = ['organizationId', 'departmentId', 'crewId', 'employeeCode', 'phone', 'email', 'status', 'mealLocationId', 'mealsIncluded'] as const;
        const names = resolveNames(dto, e as unknown as Parameters<typeof resolveNames>[1]);
        if (names && !names.firstName) throw badRequest('camp.err.employees.name_required');
        // S9: зассан талбарын «Мэдээлэл дутуу»-г арилгана (DTO = зөв утга)
        const cleared = clearedBy(dto);
        // R9: «HR ID хүлээгдэж байна» — код бодитоор өөрчлөгдсөн үед л арилна (маягт кодыг үргэлж илгээдэг)
        if (dto.employeeCode !== undefined && dto.employeeCode === (e as { employeeCode?: string }).employeeCode) delete cleared.employeeCode;
        const issuesBefore = Object.keys(cleared).length
          ? readIssues((await tx.hrEmployee.findFirst({ where: { id, tenantId }, select: { dataIssues: true } }))?.dataIssues)
          : [];
        const issuesAfter = applyIssues(issuesBefore, cleared);
        const data = {
          ...Object.fromEntries(fields.filter((f) => dto[f] !== undefined).map((f) => [f, f === 'email' && dto.email ? dto.email.toLowerCase() : dto[f]])),
          ...(names ?? {}),
          ...(issuesAfter.length !== issuesBefore.length ? { dataIssues: toJson(issuesAfter) } : {}),
          ...(await this.resolvePosition(tx, tenantId, dto, (e as { positionId?: string | null }).positionId)),
        };
        let updated = await tx.hrEmployee.update({ where: { id }, data: data as Prisma.HrEmployeeUncheckedUpdateInput, select: EMPLOYEE_SELECT });
        if (dto.extraPhones !== undefined || (dto.phone !== undefined && (updated.extraPhones?.length ?? 0) > 0)) {
          // Нэмэлт утсыг солих; үндсэн дугаар өөрчлөгдвөл түүнтэй давхцсаныг хасна
          const extra = normalizeExtraPhones(dto.extraPhones ?? phonesOut(updated.extraPhones), updated.phone);
          await replaceExtraPhones(tx, tenantId, id, extra);
          updated = { ...updated, extraPhones: extra.map((phone) => ({ phone })) };
        }
        await this.audit.record(tx, {
          tenantId, campId, entityType: 'employee', entityId: id, action: 'UPDATE', actorUserId,
          fields: EMPLOYEE_AUDIT_FIELDS, before: e, after: updated,
          summaryParams: { code: updated.employeeCode, name: updated.fullName },
        });
        return employeeOut(updated);
      }),
    );
  }

  /**
   * v0.2.1 — UI-д "эффектив" утга: ажилтан ?? албан тушаал(кемп) ?? анхдагч (хоолны тооцоотой ижил `effectiveEmployee`).
   * `mealSource`: EMPLOYEE | POSITION | DEFAULT
   */
  private async withEffective<T extends { positionId: string | null; mealLocationId: string | null; mealsIncluded: boolean | null }>(tx: Tx, tenantId: string, campId: string, rows: T[]) {
    if (rows.length === 0) return [];
    const [defaults, locs, settings] = await Promise.all([
      loadPositionDefaults(tx, tenantId, campId),
      tx.campMealLocation.findMany({ where: { tenantId, campId }, select: { id: true, name: true, nameI18n: true } }),
      getRosterSettings(tx, tenantId, campId),
    ]);
    const locName = new Map(locs.map((l) => [l.id, l]));
    return rows.map((r) => {
      const eff = effectiveEmployee(r, defaults, []);
      const p = r.positionId ? defaults.get(r.positionId) : undefined;
      const locId = eff.workMealLocationId ?? settings.defaultMealLocationId;
      return {
        ...r,
        effective: {
          mealLocationId: locId,
          mealLocationName: locId ? (locName.get(locId)?.name ?? null) : null,
          mealLocationNameI18n: locId ? (locName.get(locId)?.nameI18n ?? null) : null,
          mealLocationSource: r.mealLocationId ? 'EMPLOYEE' : p?.mealLocationId ? 'POSITION' : 'DEFAULT',
          mealsIncluded: eff.mealsIncluded,
          mealsIncludedSource: r.mealsIncluded !== null ? 'EMPLOYEE' : p?.mealsIncluded != null ? 'POSITION' : 'DEFAULT',
        },
      };
    });
  }

  /** v0.2.1 (Д-2) — олон ажилтанд нэг дор (≤ 500): хоол авах / ажлын хоолны байршил / албан тушаал. Нэг transaction, audit. */
  async bulkUpdate(tenantId: string, authId: string, campId: string, dto: BulkEmployeesDto) {
    return withCampErrors(() =>
      inTenantTx(
        this.prisma,
        tenantId,
        async (tx) => {
          const actorUserId = await this.access.require(tx, tenantId, authId, campId, P.EMPLOYEE_MANAGE);
          if (dto.mealsIncluded === undefined && dto.mealLocationId === undefined && dto.positionId === undefined) throw badRequest('camp.err.employees.bulk_empty');
          const before = await tx.hrEmployee.findMany({ where: { tenantId, campId, id: { in: dto.ids } }, select: EMPLOYEE_AUDIT_SELECT });
          if (before.length !== dto.ids.length) throw badRequest('camp.err.employees.bulk_not_found', { n: dto.ids.length - before.length });
          const terminated = before.filter((b) => (b as { status?: unknown }).status === CampEmployeeStatus.TERMINATED).length;
          if (terminated > 0) throw conflict('camp.err.employees.bulk_terminated', { n: terminated });
          if (dto.mealLocationId) await assertMealLocation(tx, tenantId, campId, dto.mealLocationId);
          const pos = dto.positionId !== undefined ? await this.resolvePosition(tx, tenantId, { positionId: dto.positionId }) : {};
          const data = {
            ...(dto.mealsIncluded !== undefined ? { mealsIncluded: dto.mealsIncluded } : {}),
            ...(dto.mealLocationId !== undefined ? { mealLocationId: dto.mealLocationId } : {}),
            ...pos,
          };
          await tx.hrEmployee.updateMany({ where: { tenantId, campId, id: { in: dto.ids } }, data });
          const after = await tx.hrEmployee.findMany({ where: { tenantId, campId, id: { in: dto.ids } }, select: EMPLOYEE_AUDIT_SELECT });
          const prev = new Map(before.map((b) => [b.id as unknown as string, b]));
          await this.audit.recordMany(
            tx,
            after.map((a) => ({
              tenantId, campId, entityType: 'employee' as const, entityId: a.id as unknown as string, action: 'UPDATE' as const, actorUserId,
              fields: EMPLOYEE_AUDIT_FIELDS, before: prev.get(a.id as unknown as string) ?? null, after: a as unknown as { id: string } & Record<string, unknown>,
              summaryParams: { code: String(a.employeeCode), name: String(a.fullName) },
            })),
          );
          return { updated: after.length };
        },
        { timeout: 30_000 },
      ),
    );
  }
}
