import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../common/camp-access.service';
import { CAMP_PERMISSIONS } from '../common/camp-permissions';
import { inTenantTx, Tx } from '../common/camp-tx';
import { withCampErrors } from '../common/camp-errors';
import { CreateOrganizationDto, QueryOrganizationsDto, UpdateOrganizationDto } from './camp-master.dto';

const P = CAMP_PERMISSIONS;
const ORG_SELECT = {
  id: true,
  name: true,
  regNumber: true,
  orgType: true,
  isDisposalPoint: true,
  contactName: true,
  phone: true,
  email: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Байгууллага (Шат 2.4) — tenant түвшин (олон кемпэд үйлчилнэ). Унших: аль нэг кемпэд эрхтэй;
 * бичих: бүх кемпийн `camp.master.manage`.
 */
@Injectable()
export class CampOrganizationsService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
  ) {}

  private async assertRegUnique(tx: Tx, tenantId: string, regNumber: string | null | undefined, exceptId?: string) {
    if (!regNumber) return;
    const dup = await tx.campOrganization.findFirst({
      where: { tenantId, regNumber, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
      select: { name: true },
    });
    if (dup) throw new ConflictException(`Регистр ${regNumber} "${dup.name}" байгууллагад бүртгэгдсэн`);
  }

  async list(tenantId: string, authId: string, q: QueryOrganizationsDto) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, null);
      return tx.campOrganization.findMany({
        where: {
          tenantId,
          ...(q.activeOnly ? { isActive: true } : {}),
          ...(q.disposalPoint !== undefined ? { isDisposalPoint: q.disposalPoint } : {}),
          ...(q.orgType ? { orgType: q.orgType } : {}),
        },
        select: ORG_SELECT,
        orderBy: { name: 'asc' },
      });
    });
  }

  async create(tenantId: string, authId: string, dto: CreateOrganizationDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, null, P.MASTER_MANAGE);
        await this.assertRegUnique(tx, tenantId, dto.regNumber);
        return tx.campOrganization.create({
          data: {
            tenantId,
            name: dto.name,
            regNumber: dto.regNumber ?? null,
            orgType: dto.orgType,
            isDisposalPoint: dto.isDisposalPoint ?? false,
            contactName: dto.contactName ?? null,
            phone: dto.phone ?? null,
            email: dto.email ?? null,
          },
          select: ORG_SELECT,
        });
      }),
    );
  }

  async update(tenantId: string, authId: string, id: string, dto: UpdateOrganizationDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, null, P.MASTER_MANAGE);
        const org = await tx.campOrganization.findFirst({ where: { id, tenantId }, select: { id: true } });
        if (!org) throw new NotFoundException('Байгууллага олдсонгүй');
        await this.assertRegUnique(tx, tenantId, dto.regNumber, id);
        if (dto.isActive === false) {
          const employees = await tx.campEmployee.count({ where: { tenantId, organizationId: id, status: 'ACTIVE' } });
          const contracts = await tx.campContract.count({ where: { tenantId, organizationId: id, status: 'ACTIVE' } });
          if (employees + contracts > 0) {
            throw new ConflictException(`Идэвхгүй болгох боломжгүй: идэвхтэй ${employees} ажилтан, ${contracts} гэрээ холбоотой`);
          }
        }
        const fields = ['name', 'regNumber', 'orgType', 'isDisposalPoint', 'contactName', 'phone', 'email', 'isActive'] as const;
        const data = Object.fromEntries(fields.filter((f) => dto[f] !== undefined).map((f) => [f, dto[f]]));
        return tx.campOrganization.update({ where: { id }, data, select: ORG_SELECT });
      }),
    );
  }
}
