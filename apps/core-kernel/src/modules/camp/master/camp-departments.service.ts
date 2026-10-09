import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../common/camp-access.service';
import { CAMP_PERMISSIONS } from '../common/camp-permissions';
import { inTenantTx, Tx } from '../common/camp-tx';
import { withCampErrors } from '../common/camp-errors';
import { assertMealLocation, getCampOr404, getRosterSettings } from '../common/camp-lookup';
import { CreateDepartmentDto, QueryActiveOnlyDto, SetShiftPatternDto, UpdateDepartmentDto } from './camp-master.dto';
import { normalizeShiftPattern, ShiftSegment } from './shift-pattern';

const P = CAMP_PERMISSIONS;
const DEPT_SELECT = {
  id: true,
  code: true,
  name: true,
  mealLocationId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  mealLocation: { select: { name: true } },
  shiftPatterns: { select: { dayFrom: true, dayTo: true, shift: true }, orderBy: { dayFrom: 'asc' as const } },
} as const;

/** Хэлтэс + ээлжийн загвар (Шат 2.4). Бичих: тухайн кемпийн `camp.master.manage`. */
@Injectable()
export class CampDepartmentsService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
  ) {}

  private async getDept(tx: Tx, tenantId: string, campId: string, id: string) {
    const d = await tx.campDepartment.findFirst({ where: { id, tenantId, campId }, select: DEPT_SELECT });
    if (!d) throw new NotFoundException('Хэлтэс олдсонгүй');
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

  async list(tenantId: string, authId: string, campId: string, q: QueryActiveOnlyDto) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, campId);
      await getCampOr404(tx, tenantId, campId);
      return tx.campDepartment.findMany({
        where: { tenantId, campId, ...(q.activeOnly ? { isActive: true } : {}) },
        select: { ...DEPT_SELECT, _count: { select: { employees: true } } },
        orderBy: { code: 'asc' },
      });
    });
  }

  async create(tenantId: string, authId: string, campId: string, dto: CreateDepartmentDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, campId, P.MASTER_MANAGE);
        await getCampOr404(tx, tenantId, campId);
        await assertMealLocation(tx, tenantId, campId, dto.mealLocationId);
        const dup = await tx.campDepartment.findFirst({ where: { tenantId, campId, code: dto.code }, select: { id: true } });
        if (dup) throw new ConflictException(`"${dto.code}" кодтой хэлтэс аль хэдийн байна`);
        const d = await tx.campDepartment.create({
          data: { tenantId, campId, code: dto.code, name: dto.name, mealLocationId: dto.mealLocationId },
          select: { id: true },
        });
        if (dto.shiftPattern) await this.replacePattern(tx, tenantId, campId, d.id, dto.shiftPattern);
        return this.getDept(tx, tenantId, campId, d.id);
      }),
    );
  }

  /** Байршлыг солиход өмнөх хоолны захиалга өөрчлөгдөхгүй (мөрөнд snapshot) — ERD v4 */
  async update(tenantId: string, authId: string, campId: string, id: string, dto: UpdateDepartmentDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, campId, P.MASTER_MANAGE);
        await this.getDept(tx, tenantId, campId, id);
        if (dto.mealLocationId !== undefined) await assertMealLocation(tx, tenantId, campId, dto.mealLocationId);
        if (dto.isActive === false) {
          const active = await tx.campEmployee.count({ where: { tenantId, departmentId: id, status: 'ACTIVE' } });
          if (active > 0) throw new ConflictException(`Хэлтэст идэвхтэй ${active} ажилтан байна — эхлээд шилжүүлнэ үү`);
        }
        await tx.campDepartment.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.mealLocationId !== undefined ? { mealLocationId: dto.mealLocationId } : {}),
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          },
        });
        return this.getDept(tx, tenantId, campId, id);
      }),
    );
  }

  async setShiftPattern(tenantId: string, authId: string, campId: string, id: string, dto: SetShiftPatternDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, campId, P.MASTER_MANAGE);
        await this.getDept(tx, tenantId, campId, id);
        await this.replacePattern(tx, tenantId, campId, id, dto.segments);
        return this.getDept(tx, tenantId, campId, id);
      }),
    );
  }
}
