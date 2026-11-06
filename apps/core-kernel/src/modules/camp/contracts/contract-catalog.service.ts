import { Injectable } from '@nestjs/common';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../common/camp-access.service';
import { CAMP_PERMISSIONS } from '../common/camp-permissions';
import { inTenantTx, type Tx } from '../common/camp-tx';
import { withCampErrors } from '../common/camp-errors';
import { badRequest, conflict, notFound } from '../../../common/i18n/app-error';
import type { ContractCatalogView, QuantitySource, ServiceTypeView, UnitView } from './contract.types';
import type { CreateServiceTypeDto, CreateUnitDto, UpdateServiceTypeDto, UpdateUnitDto } from './contracts.dto';

const P = CAMP_PERMISSIONS;

const UNIT_SELECT = { id: true, code: true, nameMn: true, nameEn: true, nameZh: true, decimals: true, sortOrder: true, isActive: true } as const;
const TYPE_SELECT = {
  id: true,
  code: true,
  nameMn: true,
  nameEn: true,
  nameZh: true,
  quantitySource: true,
  defaultUnitId: true,
  sortOrder: true,
  isActive: true,
} as const;

const toType = (r: Omit<ServiceTypeView, 'quantitySource'> & { quantitySource: string }): ServiceTypeView => ({
  ...r,
  quantitySource: r.quantitySource as QuantitySource,
});

/**
 * v0.2.3 Блок 6б (G-1) — гэрээний каталог: нэгж (`core_units`), үйлчилгээний төрөл (`camp_service_types`). Tenant түвшин.
 * Унших: аль нэг кемпэд эрхтэй (маягтад хэрэгтэй); бичих: аль нэг кемпэд `camp.contract.manage`. Устгахгүй — идэвхгүй болгоно.
 * Каталог хоосон бол анхдагчийг (`camp_seed_contract_catalog`, idempotent) үүсгэнэ.
 */
@Injectable()
export class ContractCatalogService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
  ) {}

  private async ensureSeeded(tx: Tx, tenantId: string): Promise<void> {
    const any = await tx.coreUnit.findFirst({ where: { tenantId }, select: { id: true } });
    if (!any) await tx.$executeRaw`SELECT camp_seed_contract_catalog(${tenantId}::uuid)`;
  }

  async catalog(tenantId: string, authId: string): Promise<ContractCatalogView> {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.requireAccess(tx, tenantId, authId, null);
        await this.ensureSeeded(tx, tenantId);
        const [units, types] = await Promise.all([
          tx.coreUnit.findMany({ where: { tenantId }, select: UNIT_SELECT, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] }),
          tx.campServiceType.findMany({ where: { tenantId }, select: TYPE_SELECT, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] }),
        ]);
        return { units, serviceTypes: types.map(toType) };
      }),
    );
  }

  async createUnit(tenantId: string, authId: string, dto: CreateUnitDto): Promise<UnitView> {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.requireInAnyCamp(tx, tenantId, authId, P.CONTRACT_MANAGE);
        return tx.coreUnit.create({
          data: {
            tenantId,
            code: dto.code,
            nameMn: dto.nameMn,
            nameEn: dto.nameEn ?? null,
            nameZh: dto.nameZh ?? null,
            decimals: dto.decimals ?? 0,
            sortOrder: dto.sortOrder ?? 0,
          },
          select: UNIT_SELECT,
        });
      }),
    );
  }

  async updateUnit(tenantId: string, authId: string, id: string, dto: UpdateUnitDto): Promise<UnitView> {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.requireInAnyCamp(tx, tenantId, authId, P.CONTRACT_MANAGE);
        const found = await tx.coreUnit.findFirst({ where: { id, tenantId }, select: { id: true } });
        if (!found) throw notFound('camp.err.contractcat.1');
        const fields = ['nameMn', 'nameEn', 'nameZh', 'decimals', 'sortOrder', 'isActive'] as const;
        const data = Object.fromEntries(fields.filter((f) => dto[f] !== undefined).map((f) => [f, dto[f]]));
        return tx.coreUnit.update({ where: { id }, data, select: UNIT_SELECT });
      }),
    );
  }

  private async assertUnit(tx: Tx, tenantId: string, unitId: string | null | undefined): Promise<void> {
    if (!unitId) return;
    const u = await tx.coreUnit.findFirst({ where: { id: unitId, tenantId }, select: { isActive: true } });
    if (!u?.isActive) throw badRequest('camp.err.contract.12', { field: 'defaultUnitId' });
  }

  async createServiceType(tenantId: string, authId: string, dto: CreateServiceTypeDto): Promise<ServiceTypeView> {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.requireInAnyCamp(tx, tenantId, authId, P.CONTRACT_MANAGE);
        await this.assertUnit(tx, tenantId, dto.defaultUnitId);
        const row = await tx.campServiceType.create({
          data: {
            tenantId,
            code: dto.code,
            nameMn: dto.nameMn,
            nameEn: dto.nameEn ?? null,
            nameZh: dto.nameZh ?? null,
            quantitySource: dto.quantitySource,
            defaultUnitId: dto.defaultUnitId ?? null,
            sortOrder: dto.sortOrder ?? 0,
          },
          select: TYPE_SELECT,
        });
        return toType(row);
      }),
    );
  }

  async updateServiceType(tenantId: string, authId: string, id: string, dto: UpdateServiceTypeDto): Promise<ServiceTypeView> {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.requireInAnyCamp(tx, tenantId, authId, P.CONTRACT_MANAGE);
        const found = await tx.campServiceType.findFirst({ where: { id, tenantId }, select: { quantitySource: true } });
        if (!found) throw notFound('camp.err.contractcat.1');
        if (dto.quantitySource !== undefined && dto.quantitySource !== found.quantitySource) {
          const count = await tx.campContractItem.count({ where: { tenantId, serviceTypeId: id } });
          if (count > 0) throw conflict('camp.err.contractcat.2', { count });
        }
        await this.assertUnit(tx, tenantId, dto.defaultUnitId);
        const fields = ['nameMn', 'nameEn', 'nameZh', 'quantitySource', 'defaultUnitId', 'sortOrder', 'isActive'] as const;
        const data = Object.fromEntries(fields.filter((f) => dto[f] !== undefined).map((f) => [f, dto[f]]));
        return toType(await tx.campServiceType.update({ where: { id }, data, select: TYPE_SELECT }));
      }),
    );
  }
}
