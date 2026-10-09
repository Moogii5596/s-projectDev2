import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../common/camp-access.service';
import { CAMP_PERMISSIONS } from '../common/camp-permissions';
import { inTenantTx, Tx } from '../common/camp-tx';
import { withCampErrors } from '../common/camp-errors';
import { getCampOr404 } from '../common/camp-lookup';
import { decodeCursor, encodeCursor } from '../../../common/utils/cursor';
import { CreateEmployeeDto, QueryEmployeesDto, UpdateEmployeeDto } from './camp-master.dto';

const P = CAMP_PERMISSIONS;
const EMPLOYEE_SELECT = {
  id: true,
  employeeCode: true,
  fullName: true,
  position: true,
  phone: true,
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

/**
 * Ажилтан (Шат 2.4). employee_code = ирцийн xlsx импортын түлхүүр (tenant дотор давхардахгүй).
 * Хэлтэс/баг тухайн кемпийнх + идэвхтэй, байгууллага идэвхтэй байх ёстой.
 */
@Injectable()
export class CampEmployeesService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
  ) {}

  private async assertRefs(
    tx: Tx,
    tenantId: string,
    campId: string,
    refs: { organizationId?: string; departmentId?: string; crewId?: string | null },
  ) {
    if (refs.organizationId !== undefined) {
      const org = await tx.campOrganization.findFirst({ where: { id: refs.organizationId, tenantId }, select: { isActive: true } });
      if (!org) throw new BadRequestException('Байгууллага олдсонгүй');
      if (!org.isActive) throw new BadRequestException('Байгууллага идэвхгүй байна');
    }
    if (refs.departmentId !== undefined) {
      const d = await tx.campDepartment.findFirst({ where: { id: refs.departmentId, tenantId, campId }, select: { isActive: true } });
      if (!d) throw new BadRequestException('Хэлтэс энэ кемпэд олдсонгүй');
      if (!d.isActive) throw new BadRequestException('Хэлтэс идэвхгүй байна');
    }
    if (refs.crewId !== undefined && refs.crewId !== null) {
      const c = await tx.campCrew.findFirst({ where: { id: refs.crewId, tenantId, campId }, select: { isActive: true } });
      if (!c) throw new BadRequestException('Баг энэ кемпэд олдсонгүй');
      if (!c.isActive) throw new BadRequestException('Баг идэвхгүй байна');
    }
  }

  private async assertCodeUnique(tx: Tx, tenantId: string, code: string, exceptId?: string) {
    const dup = await tx.campEmployee.findFirst({
      where: { tenantId, employeeCode: code, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
      select: { fullName: true },
    });
    if (dup) throw new ConflictException(`Ажилтны код "${code}" (${dup.fullName}) аль хэдийн бүртгэгдсэн`);
  }

  async list(tenantId: string, authId: string, campId: string, q: QueryEmployeesDto) {
    const limit = q.limit ?? 20;
    let cursor: { id: string; createdAt: Date } | null = null;
    if (q.cursor) {
      try {
        cursor = decodeCursor(q.cursor);
      } catch {
        throw new BadRequestException('cursor буруу байна');
      }
    }
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, campId);
      await getCampOr404(tx, tenantId, campId);
      const where: Prisma.CampEmployeeWhereInput = {
        tenantId,
        campId,
        ...(q.departmentId ? { departmentId: q.departmentId } : {}),
        ...(q.crewId ? { crewId: q.crewId } : {}),
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
      if (!e) throw new NotFoundException('Ажилтан олдсонгүй');
      return e;
    });
  }

  async create(tenantId: string, authId: string, campId: string, dto: CreateEmployeeDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, campId, P.EMPLOYEE_MANAGE);
        await getCampOr404(tx, tenantId, campId);
        await this.assertRefs(tx, tenantId, campId, { organizationId: dto.organizationId, departmentId: dto.departmentId, crewId: dto.crewId ?? null });
        await this.assertCodeUnique(tx, tenantId, dto.employeeCode);
        return tx.campEmployee.create({
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
          },
          select: EMPLOYEE_SELECT,
        });
      }),
    );
  }

  async update(tenantId: string, authId: string, campId: string, id: string, dto: UpdateEmployeeDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, campId, P.EMPLOYEE_MANAGE);
        const e = await tx.campEmployee.findFirst({ where: { id, tenantId, campId }, select: { id: true } });
        if (!e) throw new NotFoundException('Ажилтан олдсонгүй');
        await this.assertRefs(tx, tenantId, campId, { organizationId: dto.organizationId, departmentId: dto.departmentId, crewId: dto.crewId });
        if (dto.employeeCode !== undefined) await this.assertCodeUnique(tx, tenantId, dto.employeeCode, id);
        const fields = ['organizationId', 'departmentId', 'crewId', 'employeeCode', 'fullName', 'position', 'phone', 'status'] as const;
        const data = Object.fromEntries(fields.filter((f) => dto[f] !== undefined).map((f) => [f, dto[f]]));
        return tx.campEmployee.update({ where: { id }, data, select: EMPLOYEE_SELECT });
      }),
    );
  }
}
