import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../common/camp-access.service';
import { CampAuditService } from '../common/camp-audit.service';
import { CAMP_PERMISSIONS } from '../common/camp-permissions';
import { inTenantTx, Tx } from '../common/camp-tx';
import { withCampErrors } from '../common/camp-errors';
import { getCampOr404 } from '../common/camp-lookup';
import { decodeCursor, encodeCursor } from '../../../common/utils/cursor';
import { CreateEmployeeDto, QueryEmployeesDto, UpdateEmployeeDto } from './camp-master.dto';
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
  createdAt: true,
  updatedAt: true,
  organization: { select: { name: true } },
  department: { select: { code: true, name: true } },
  crew: { select: { code: true } },
} as const;

/** Түүхэд харьцуулах талбарууд (§0.4) */
export const EMPLOYEE_AUDIT_FIELDS = ['employeeCode', 'fullName', 'position', 'phone', 'email', 'status', 'organizationId', 'departmentId', 'crewId'] as const;
const EMPLOYEE_AUDIT_SELECT = { id: true, ...Object.fromEntries(EMPLOYEE_AUDIT_FIELDS.map((f) => [f, true])) } as Record<string, true>;

/**
 * Ажилтан (Шат 2.4). employee_code = ирцийн xlsx импортын түлхүүр (tenant дотор давхардахгүй).
 * Хэлтэс/баг тухайн кемпийнх + идэвхтэй, байгууллага идэвхтэй байх ёстой.
 */
@Injectable()
export class CampEmployeesService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
    private readonly audit: CampAuditService,
  ) {}

  private async assertRefs(
    tx: Tx,
    tenantId: string,
    campId: string,
    refs: { organizationId?: string; departmentId?: string; crewId?: string | null },
  ) {
    if (refs.organizationId !== undefined) {
      const org = await tx.campOrganization.findFirst({ where: { id: refs.organizationId, tenantId }, select: { isActive: true } });
      if (!org) throw badRequest('camp.err.employees.1');
      if (!org.isActive) throw badRequest('camp.err.employees.2');
    }
    if (refs.departmentId !== undefined) {
      const d = await tx.campDepartment.findFirst({ where: { id: refs.departmentId, tenantId, campId }, select: { isActive: true } });
      if (!d) throw badRequest('camp.err.employees.3');
      if (!d.isActive) throw badRequest('camp.err.employees.4');
    }
    if (refs.crewId !== undefined && refs.crewId !== null) {
      const c = await tx.campCrew.findFirst({ where: { id: refs.crewId, tenantId, campId }, select: { isActive: true } });
      if (!c) throw badRequest('camp.err.employees.5');
      if (!c.isActive) throw badRequest('camp.err.employees.6');
    }
  }

  private async assertCodeUnique(tx: Tx, tenantId: string, code: string, exceptId?: string) {
    const dup = await tx.campEmployee.findFirst({
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
      const where: Prisma.CampEmployeeWhereInput = {
        tenantId,
        campId,
        ...(q.departmentId ? { departmentId: q.departmentId } : {}),
        ...(q.crewId ? { crewId: q.crewId === 'none' ? null : q.crewId } : {}),
        ...(q.organizationId ? { organizationId: q.organizationId } : {}),
        ...(q.status ? { status: q.status } : {}),
        ...(q.q
          ? { OR: [{ employeeCode: { contains: q.q, mode: 'insensitive' } }, { fullName: { contains: q.q, mode: 'insensitive' } }] }
          : {}),
        // created_at DESC, id DESC (idx_camp_employees_cursor)
        ...(cursor
          ? { AND: [{ OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }] }
          : {}),
      };
      const rows = await tx.campEmployee.findMany({
        where,
        select: EMPLOYEE_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      });
      const hasMore = rows.length > limit;
      const data = rows.slice(0, limit);
      const last = data[data.length - 1];
      return { data, nextCursor: hasMore && last ? encodeCursor(last.id, last.createdAt) : null, hasMore };
    });
  }

  async get(tenantId: string, authId: string, campId: string, id: string) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, campId);
      const e = await tx.campEmployee.findFirst({ where: { id, tenantId, campId }, select: EMPLOYEE_SELECT });
      if (!e) throw notFound('camp.err.employees.8');
      return e;
    });
  }

  async create(tenantId: string, authId: string, campId: string, dto: CreateEmployeeDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const actorUserId = await this.access.require(tx, tenantId, authId, campId, P.EMPLOYEE_MANAGE);
        await getCampOr404(tx, tenantId, campId);
        await this.assertRefs(tx, tenantId, campId, { organizationId: dto.organizationId, departmentId: dto.departmentId, crewId: dto.crewId ?? null });
        await this.assertCodeUnique(tx, tenantId, dto.employeeCode);
        const created = await tx.campEmployee.create({
          data: {
            tenantId,
            campId,
            organizationId: dto.organizationId,
            departmentId: dto.departmentId,
            crewId: dto.crewId ?? null,
            employeeCode: dto.employeeCode,
            fullName: dto.fullName,
            position: dto.position ?? null,
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
        const e = await tx.campEmployee.findFirst({ where: { id, tenantId, campId }, select: EMPLOYEE_AUDIT_SELECT });
        if (!e) throw notFound('camp.err.employees.8');
        await this.assertRefs(tx, tenantId, campId, { organizationId: dto.organizationId, departmentId: dto.departmentId, crewId: dto.crewId });
        if (dto.employeeCode !== undefined) await this.assertCodeUnique(tx, tenantId, dto.employeeCode, id);
        const fields = ['organizationId', 'departmentId', 'crewId', 'employeeCode', 'fullName', 'position', 'phone', 'email', 'status'] as const;
        const data = Object.fromEntries(
          fields.filter((f) => dto[f] !== undefined).map((f) => [f, f === 'email' && dto.email ? dto.email.toLowerCase() : dto[f]]),
        );
        const updated = await tx.campEmployee.update({ where: { id }, data, select: EMPLOYEE_SELECT });
        await this.audit.record(tx, {
          tenantId, campId, entityType: 'employee', entityId: id, action: 'UPDATE', actorUserId,
          fields: EMPLOYEE_AUDIT_FIELDS, before: e, after: updated,
          summaryParams: { code: updated.employeeCode, name: updated.fullName },
        });
        return updated;
      }),
    );
  }
}
