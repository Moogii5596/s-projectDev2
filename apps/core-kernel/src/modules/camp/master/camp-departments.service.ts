import { Injectable } from '@nestjs/common';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../common/camp-access.service';
import { CampAuditService } from '../common/camp-audit.service';
import { CAMP_PERMISSIONS } from '../common/camp-permissions';
import { inTenantTx, Tx } from '../common/camp-tx';
import { withCampErrors } from '../common/camp-errors';
import { getCampOr404, getRosterSettings } from '../common/camp-lookup';
import { CreateDepartmentDto, QueryActiveOnlyDto, SetShiftPatternDto, UpdateDepartmentDto } from './camp-master.dto';
import { normalizeShiftPattern, ShiftSegment } from './shift-pattern';
import { conflict, notFound } from '../../../common/i18n/app-error';

const P = CAMP_PERMISSIONS;
const DEPT_SELECT = {
  id: true,
  code: true,
  name: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  shiftPatterns: { select: { dayFrom: true, dayTo: true, shift: true }, orderBy: { dayFrom: 'asc' as const } },
} as const;

/** Түүхэд харьцуулах талбарууд (§0.4); ээлжийн загвар JSON-оор */
const DEPT_AUDIT_FIELDS = ['code', 'name', 'isActive', 'shiftPatterns'] as const;

/** Хэлтэс + ээлжийн загвар (Шат 2.4). Бичих: тухайн кемпийн `camp.master.manage`. */
@Injectable()
export class CampDepartmentsService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
    private readonly audit: CampAuditService,
  ) {}

  private async getDept(tx: Tx, tenantId: string, campId: string, id: string) {
    const d = await tx.campDepartment.findFirst({ where: { id, tenantId, campId }, select: DEPT_SELECT });
    if (!d) throw notFound('camp.err.departments.1');
    return d;
  }

  /** Загварыг бүхэлд нь солино (шалгасны дараа): устгаад шинээр бичнэ — EXCLUDE давхцлыг DB ч хамгаална */
  private async replacePattern(tx: Tx, tenantId: string, campId: string, departmentId: string, segments: ShiftSegment[]) {
    const { rosterOnDays } = await getRosterSettings(tx, tenantId, campId);
    const normalized = normalizeShiftPattern(segments, rosterOnDays);
    await tx.campDepartmentShiftPattern.deleteMany({ where: { tenantId, departmentId } });
    if (normalized.length > 0) {
      await tx.campDepartmentShiftPattern.createMany({ data: normalized.map((s) => ({ tenantId, departmentId, ...s })) });
    }
  }

  private recordAudit(
    tx: Tx,
    tenantId: string,
    campId: string,
    actorUserId: string,
    action: 'CREATE' | 'UPDATE',
    before: Record<string, unknown> | null,
    after: { id: string; code: string; name: string } & Record<string, unknown>,
  ) {
    return this.audit.record(tx, {
      tenantId, campId, entityType: 'department', entityId: after.id, action, actorUserId,
      fields: DEPT_AUDIT_FIELDS, before, after, summaryParams: { code: after.code, name: after.name },
    });
  }

  async list(tenantId: string, authId: string, campId: string, q: QueryActiveOnlyDto) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, campId);
      await getCampOr404(tx, tenantId, campId);
      const [rows, active] = await Promise.all([
        tx.campDepartment.findMany({
          where: { tenantId, campId, ...(q.activeOnly ? { isActive: true } : {}) },
          select: { ...DEPT_SELECT, _count: { select: { employees: true } } },
          orderBy: { code: 'asc' },
        }),
        // FB-03 (v0.2.0): идэвхтэй ажилтны тоо + албан тушаалын тоо (хоосон албан тушаал = "—" нэг бүлэг)
        tx.campEmployee.groupBy({ by: ['departmentId', 'position'], where: { tenantId, campId, status: 'ACTIVE' }, _count: { _all: true } }),
      ]);
      const stats = new Map<string, { activeEmployees: number; positions: number }>();
      for (const g of active) {
        const s = stats.get(g.departmentId) ?? { activeEmployees: 0, positions: 0 };
        s.activeEmployees += g._count._all;
        s.positions += 1;
        stats.set(g.departmentId, s);
      }
      return rows.map((d) => ({ ...d, activeEmployees: stats.get(d.id)?.activeEmployees ?? 0, positions: stats.get(d.id)?.positions ?? 0 }));
    });
  }

  async create(tenantId: string, authId: string, campId: string, dto: CreateDepartmentDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const actorUserId = await this.access.require(tx, tenantId, authId, campId, P.MASTER_MANAGE);
        await getCampOr404(tx, tenantId, campId);
        const dup = await tx.campDepartment.findFirst({ where: { tenantId, campId, code: dto.code }, select: { id: true } });
        if (dup) throw conflict('camp.err.departments.2', { code: dto.code });
        const d = await tx.campDepartment.create({
          data: { tenantId, campId, code: dto.code, name: dto.name },
          select: { id: true },
        });
        if (dto.shiftPattern) await this.replacePattern(tx, tenantId, campId, d.id, dto.shiftPattern);
        const after = await this.getDept(tx, tenantId, campId, d.id);
        await this.recordAudit(tx, tenantId, campId, actorUserId, 'CREATE', null, after);
        return after;
      }),
    );
  }

  /** v0.2.1 (Q1): хоолны байршил хэлтсээс хасагдсан — `mealLocationId` (хуучин клиент) үл тоогдоно */
  async update(tenantId: string, authId: string, campId: string, id: string, dto: UpdateDepartmentDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const actorUserId = await this.access.require(tx, tenantId, authId, campId, P.MASTER_MANAGE);
        const before = await this.getDept(tx, tenantId, campId, id);
        if (dto.isActive === false) {
          const active = await tx.campEmployee.count({ where: { tenantId, departmentId: id, status: 'ACTIVE' } });
          if (active > 0) throw conflict('camp.err.departments.3', { active });
        }
        await tx.campDepartment.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          },
        });
        const after = await this.getDept(tx, tenantId, campId, id);
        await this.recordAudit(tx, tenantId, campId, actorUserId, 'UPDATE', before, after);
        return after;
      }),
    );
  }

  async setShiftPattern(tenantId: string, authId: string, campId: string, id: string, dto: SetShiftPatternDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const actorUserId = await this.access.require(tx, tenantId, authId, campId, P.MASTER_MANAGE);
        const before = await this.getDept(tx, tenantId, campId, id);
        await this.replacePattern(tx, tenantId, campId, id, dto.segments);
        const after = await this.getDept(tx, tenantId, campId, id);
        await this.recordAudit(tx, tenantId, campId, actorUserId, 'UPDATE', before, after);
        return after;
      }),
    );
  }
}
