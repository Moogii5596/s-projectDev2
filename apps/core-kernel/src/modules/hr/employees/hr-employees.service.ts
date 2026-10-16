import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

const P = CAMP_PERMISSIONS;
const EMPLOYEE_SELECT = {
  id: true,
  employeeCode: true,
  fullName: true,
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
  createdAt: true,
  updatedAt: true,
  organization: { select: { name: true } },
  department: { select: { code: true, name: true } },
  crew: { select: { code: true } },
  positionRef: { select: { name: true } },
  workMealLocation: { select: { name: true } },
} as const;

/** Түүхэд харьцуулах талбарууд (§0.4) */
export const EMPLOYEE_AUDIT_FIELDS = ['employeeCode', 'fullName', 'position', 'phone', 'email', 'status', 'organizationId', 'departmentId', 'crewId', 'positionId', 'mealLocationId', 'mealsIncluded'] as const;
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

  private async assertRefs(
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
  private async resolvePosition(tx: Tx, tenantId: string, dto: { positionId?: string | null; position?: string | null }, currentId?: string | null) {
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

  private async assertCodeUnique(tx: Tx, tenantId: string, code: string, exceptId?: string) {
    const dup = await tx.hrEmployee.findFirst({
      where: { tenantId, employeeCode: code, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
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
        ...(q.status ? { status: q.status } : {}),
        ...(q.positionId ? { positionId: q.positionId === 'none' ? null : q.positionId } : {}),
        ...(q.mealsIncluded !== undefined ? { mealsIncluded: q.mealsIncluded } : {}),
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
      const data = await this.withEffective(tx, tenantId, campId, rows.slice(0, limit));
      const last = data[data.length - 1];
      return { data, nextCursor: hasMore && last ? encodeCursor(last.id, last.createdAt) : null, hasMore };
    });
  }

  async get(tenantId: string, authId: string, campId: string, id: string) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, campId);
      const e = await tx.hrEmployee.findFirst({ where: { id, tenantId, campId }, select: EMPLOYEE_SELECT });
      if (!e) throw notFound('camp.err.employees.8');
      return (await this.withEffective(tx, tenantId, campId, [e]))[0];
    });
  }

  async create(tenantId: string, authId: string, campId: string, dto: CreateEmployeeDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const actorUserId = await this.access.require(tx, tenantId, authId, campId, P.EMPLOYEE_MANAGE);
        await getCampOr404(tx, tenantId, campId);
        await this.assertRefs(tx, tenantId, campId, { organizationId: dto.organizationId, departmentId: dto.departmentId, crewId: dto.crewId ?? null, mealLocationId: dto.mealLocationId });
        await this.assertCodeUnique(tx, tenantId, dto.employeeCode);
        const pos = await this.resolvePosition(tx, tenantId, dto);
        const created = await tx.hrEmployee.create({
          data: {
            tenantId,
            campId,
            organizationId: dto.organizationId,
            departmentId: dto.departmentId,
            crewId: dto.crewId ?? null,
            employeeCode: dto.employeeCode,
            fullName: dto.fullName,
            position: pos.position ?? null,
            positionId: pos.positionId ?? null,
            mealLocationId: dto.mealLocationId ?? null,
            mealsIncluded: dto.mealsIncluded ?? null,
            phone: dto.phone ?? null,
            email: dto.email ? dto.email.toLowerCase() : null,
          },
          select: EMPLOYEE_SELECT,
        });
        await this.audit.record(tx, {
          tenantId, campId, entityType: 'employee', entityId: created.id, action: 'CREATE', actorUserId,
          fields: EMPLOYEE_AUDIT_FIELDS, before: null, after: created,
          summaryParams: { code: created.employeeCode, name: created.fullName },
        });
        return created;
      }),
    );
  }

  async update(tenantId: string, authId: string, campId: string, id: string, dto: UpdateEmployeeDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const actorUserId = await this.access.require(tx, tenantId, authId, campId, P.EMPLOYEE_MANAGE);
        const e = await tx.hrEmployee.findFirst({ where: { id, tenantId, campId }, select: EMPLOYEE_AUDIT_SELECT });
        if (!e) throw notFound('camp.err.employees.8');
        await this.assertRefs(tx, tenantId, campId, { organizationId: dto.organizationId, departmentId: dto.departmentId, crewId: dto.crewId, mealLocationId: dto.mealLocationId }, e as { mealLocationId?: string | null });
        if (dto.employeeCode !== undefined) await this.assertCodeUnique(tx, tenantId, dto.employeeCode, id);
        const fields = ['organizationId', 'departmentId', 'crewId', 'employeeCode', 'fullName', 'phone', 'email', 'status', 'mealLocationId', 'mealsIncluded'] as const;
        const data = {
          ...Object.fromEntries(fields.filter((f) => dto[f] !== undefined).map((f) => [f, f === 'email' && dto.email ? dto.email.toLowerCase() : dto[f]])),
          ...(await this.resolvePosition(tx, tenantId, dto, (e as { positionId?: string | null }).positionId)),
        };
        const updated = await tx.hrEmployee.update({ where: { id }, data: data as Prisma.HrEmployeeUncheckedUpdateInput, select: EMPLOYEE_SELECT });
        await this.audit.record(tx, {
          tenantId, campId, entityType: 'employee', entityId: id, action: 'UPDATE', actorUserId,
          fields: EMPLOYEE_AUDIT_FIELDS, before: e, after: updated,
          summaryParams: { code: updated.employeeCode, name: updated.fullName },
        });
        return updated;
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
      tx.campMealLocation.findMany({ where: { tenantId, campId }, select: { id: true, name: true } }),
      getRosterSettings(tx, tenantId, campId),
    ]);
    const locName = new Map(locs.map((l) => [l.id, l.name]));
    return rows.map((r) => {
      const eff = effectiveEmployee(r, defaults, []);
      const p = r.positionId ? defaults.get(r.positionId) : undefined;
      const locId = eff.workMealLocationId ?? settings.defaultMealLocationId;
      return {
        ...r,
        effective: {
          mealLocationId: locId,
          mealLocationName: locId ? (locName.get(locId) ?? null) : null,
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
