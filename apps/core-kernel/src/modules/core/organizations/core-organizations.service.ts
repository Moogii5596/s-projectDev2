import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../../camp/common/camp-access.service';
import { inTenantTx, Tx } from '../../camp/common/camp-tx';
import { withCampErrors } from '../../camp/common/camp-errors';
import { CreateOrganizationDto, QueryOrganizationsDto, UpdateOrganizationDto } from './core-organizations.dto';
import { badRequest, conflict, notFound } from '../../../common/i18n/app-error';
import { PERMISSIONS } from '../permissions/permission-registry';

const ORG_SELECT = {
  id: true,
  name: true,
  regNumber: true,
  orgType: true,
  serviceTypes: { select: { serviceType: { select: { code: true } } } },
  contactName: true,
  phone: true,
  email: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;
type OrganizationRow = Prisma.CoreOrganizationGetPayload<{ select: typeof ORG_SELECT }>;
type ServiceTypeRow = { id: string; code: string; isActive: boolean };

function present(row: OrganizationRow) {
  return {
    ...row,
    serviceTypes: row.serviceTypes
      .map(({ serviceType }) => serviceType.code)
      .sort((left, right) => left.localeCompare(right)),
  };
}

/**
 * Байгууллага (Шат 2.4) — tenant түвшин (олон кемпэд үйлчилнэ). Унших: аль нэг кемпэд эрхтэй;
 * бичих: `core.organization.manage`.
 */
@Injectable()
export class CoreOrganizationsService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
  ) {}

  private async assertRegUnique(tx: Tx, tenantId: string, regNumber: string | null | undefined, exceptId?: string) {
    if (!regNumber) return;
    const dup = await tx.coreOrganization.findFirst({
      where: { tenantId, regNumber, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
      select: { name: true },
    });
    if (dup) throw conflict('camp.err.organizations.1', { regNumber, name: dup.name });
  }

  private async resolveServiceTypes(
    tx: Tx,
    tenantId: string,
    codes: readonly string[],
    existingCodes: readonly string[] = [],
  ): Promise<ServiceTypeRow[]> {
    if (codes.length === 0) return [];
    const rows = await tx.campServiceType.findMany({
      where: { tenantId, code: { in: [...codes] } },
      select: { id: true, code: true, isActive: true },
    });
    const existing = new Set(existingCodes);
    if (rows.length !== codes.length || rows.some((row) => !row.isActive && !existing.has(row.code))) {
      throw badRequest('core.organization.invalid_service_type');
    }
    return rows;
  }

  async list(tenantId: string, authId: string, q: QueryOrganizationsDto) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, null);
      return tx.coreOrganization.findMany({
        where: {
          tenantId,
          ...(q.activeOnly ? { isActive: true } : {}),
          ...(q.serviceType ? { serviceTypes: { some: { serviceType: { code: q.serviceType } } } } : {}),
          ...(q.orgType ? { orgType: q.orgType } : {}),
        },
        select: ORG_SELECT,
        orderBy: { name: 'asc' },
      }).then((rows) => rows.map(present));
    });
  }

  async serviceTypeCatalog(tenantId: string, authId: string) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, null);
      const rows = await tx.campServiceType.findMany({
        where: { tenantId },
        select: { code: true, nameMn: true, nameEn: true, nameZh: true, isActive: true, sortOrder: true },
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      });
      return rows;
    });
  }

  async create(tenantId: string, authId: string, dto: CreateOrganizationDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, null, PERMISSIONS.ORGANIZATION_MANAGE);
        await this.assertRegUnique(tx, tenantId, dto.regNumber);
        const serviceTypes = await this.resolveServiceTypes(tx, tenantId, dto.serviceTypes ?? []);
        const organization = await tx.coreOrganization.create({
          data: {
            tenantId,
            name: dto.name,
            regNumber: dto.regNumber ?? null,
            orgType: dto.orgType,
            contactName: dto.contactName ?? null,
            phone: dto.phone ?? null,
            email: dto.email ?? null,
          },
          select: ORG_SELECT,
        });
        if (serviceTypes.length > 0) {
          await tx.coreOrganizationServiceType.createMany({
            data: serviceTypes.map((serviceType) => ({ tenantId, organizationId: organization.id, serviceTypeId: serviceType.id })),
          });
        }
        return present(await tx.coreOrganization.findFirstOrThrow({ where: { tenantId, id: organization.id }, select: ORG_SELECT }));
      }),
    );
  }

  async update(tenantId: string, authId: string, id: string, dto: UpdateOrganizationDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, null, PERMISSIONS.ORGANIZATION_MANAGE);
        const org = await tx.coreOrganization.findFirst({ where: { id, tenantId }, select: { id: true, serviceTypes: { select: { serviceType: { select: { code: true } } } } } });
        if (!org) throw notFound('camp.err.employees.1');
        await this.assertRegUnique(tx, tenantId, dto.regNumber, id);
        const existingCodes = org.serviceTypes.map(({ serviceType }) => serviceType.code);
        // Кемпийн катеринг байгууллага бол CATERING-ийг хасах / идэвхгүй болгох → 409
        if (dto.isActive === false || (dto.serviceTypes !== undefined && !dto.serviceTypes.includes('CATERING'))) {
          const camps = await tx.campSetting.findMany({ where: { tenantId, cateringOrganizationId: id }, select: { camp: { select: { code: true } } } });
          if (camps.length > 0) {
            throw conflict('camp.err.organizations.2', { camps: camps.map((c) => c.camp.code).join(', ') });
          }
        }
        if (dto.isActive === false) {
          const employees = await tx.hrEmployee.count({ where: { tenantId, organizationId: id, status: 'ACTIVE' } });
          const contracts = await tx.campContract.count({ where: { tenantId, organizationId: id, status: 'ACTIVE' } });
          if (employees + contracts > 0) {
            throw conflict('camp.err.organizations.3', { employees, contracts });
          }
        }
        const serviceTypes = dto.serviceTypes === undefined ? undefined : await this.resolveServiceTypes(tx, tenantId, dto.serviceTypes, existingCodes);
        const fields = ['name', 'regNumber', 'orgType', 'contactName', 'phone', 'email', 'isActive'] as const;
        const data = Object.fromEntries(fields.filter((f) => dto[f] !== undefined).map((f) => [f, dto[f]]));
        await tx.coreOrganization.update({ where: { id }, data, select: { id: true } });
        if (serviceTypes) {
          await tx.coreOrganizationServiceType.deleteMany({ where: { tenantId, organizationId: id } });
          if (serviceTypes.length > 0) {
            await tx.coreOrganizationServiceType.createMany({
              data: serviceTypes.map((serviceType) => ({ tenantId, organizationId: id, serviceTypeId: serviceType.id })),
            });
          }
        }
        return present(await tx.coreOrganization.findFirstOrThrow({ where: { tenantId, id }, select: ORG_SELECT }));
      }),
    );
  }
}
