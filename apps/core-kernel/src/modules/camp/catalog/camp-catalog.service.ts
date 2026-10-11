import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../common/camp-access.service';
import { CampAuditService } from '../common/camp-audit.service';
import { CAMP_PERMISSIONS } from '../common/camp-permissions';
import { inTenantTx, Tx } from '../common/camp-tx';
import { withCampErrors } from '../common/camp-errors';
import { assertMealLocation, getCampOr404, getRosterSettings } from '../common/camp-lookup';
import { normalizeShiftPattern } from '../master/shift-pattern';
import { badRequest, conflict, notFound } from '../../../common/i18n/app-error';
import { CreateCatalogItemDto, QueryCatalogDto, UpdateCatalogItemDto, UpsertPositionSettingDto } from './camp-catalog.dto';

const P = CAMP_PERMISSIONS;
const ITEM = { id: true, name: true, isActive: true, createdAt: true, updatedAt: true } as const;
export type CatalogKind = 'position' | 'buildingType';

/** Нэрийг харьцуулах хэлбэр: илүү зай, том/жижиг үсэг үл хамаарна (DB-ийн uq_*_name индекстэй ижил) */
export const normName = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * v0.2.1 — байгууллагын каталог: албан тушаал (C-01, Q2), байрны төрөл (C-12, Q4).
 * Унших: аль нэг кемпэд эрхтэй; бичих: бүх кемпийн `camp.master.manage` (байгууллагатай ижил).
 * + Кемп × албан тушаалын анхдагч (хоолны байршил, хоол авах, ээлжийн загвар).
 */
@Injectable()
export class CampCatalogService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
    private readonly audit: CampAuditService,
  ) {}

  private model(tx: Tx, kind: CatalogKind) {
    return (kind === 'position' ? tx.campPosition : tx.campBuildingType) as unknown as Prisma.CampPositionDelegate;
  }

  private async assertUniqueName(tx: Tx, tenantId: string, kind: CatalogKind, name: string, exceptId?: string) {
    const all = await this.model(tx, kind).findMany({ where: { tenantId }, select: { id: true, name: true } });
    const dup = all.find((r) => normName(r.name) === normName(name) && r.id !== exceptId);
    if (dup) throw conflict(kind === 'position' ? 'camp.err.catalog.position_exists' : 'camp.err.catalog.building_type_exists', { name: dup.name });
  }

  async list(tenantId: string, authId: string, kind: CatalogKind, q: QueryCatalogDto) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, null);
      if (kind === 'position') {
        const [rows, counts] = await Promise.all([
          tx.campPosition.findMany({ where: { tenantId, ...(q.activeOnly ? { isActive: true } : {}) }, select: ITEM, orderBy: { name: 'asc' } }),
          tx.campEmployee.groupBy({ by: ['positionId'], where: { tenantId, status: 'ACTIVE', positionId: { not: null } }, _count: { _all: true } }),
        ]);
        const n = new Map(counts.map((c) => [c.positionId, c._count._all]));
        return rows.map((r) => ({ ...r, activeEmployees: n.get(r.id) ?? 0 }));
      }
      const [rows, counts] = await Promise.all([
        tx.campBuildingType.findMany({ where: { tenantId, ...(q.activeOnly ? { isActive: true } : {}) }, select: ITEM, orderBy: { name: 'asc' } }),
        tx.campBuilding.groupBy({ by: ['typeId'], where: { tenantId, typeId: { not: null } }, _count: { _all: true } }),
      ]);
      const n = new Map(counts.map((c) => [c.typeId, c._count._all]));
      return rows.map((r) => ({ ...r, buildings: n.get(r.id) ?? 0 }));
    });
  }

  async create(tenantId: string, authId: string, kind: CatalogKind, dto: CreateCatalogItemDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, null, P.MASTER_MANAGE);
        const name = dto.name.replace(/\s+/g, ' ');
        await this.assertUniqueName(tx, tenantId, kind, name);
        return this.model(tx, kind).create({ data: { tenantId, name }, select: ITEM });
      }),
    );
  }

  async update(tenantId: string, authId: string, kind: CatalogKind, id: string, dto: UpdateCatalogItemDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, null, P.MASTER_MANAGE);
        const cur = await this.model(tx, kind).findFirst({ where: { id, tenantId }, select: { id: true } });
        if (!cur) throw notFound(kind === 'position' ? 'camp.err.catalog.position_not_found' : 'camp.err.catalog.building_type_not_found');
        const name = dto.name?.replace(/\s+/g, ' ');
        if (name) await this.assertUniqueName(tx, tenantId, kind, name, id);
        return this.model(tx, kind).update({
          where: { id },
          data: { ...(name ? { name } : {}), ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}) },
          select: ITEM,
        });
      }),
    );
  }

  // ── Кемп × албан тушаал ─────────────────────────────────────

  /** Кемпийн бүх албан тушаал (каталог) + энэ кемп дэх анхдагч (байхгүй бол null-ууд), ажилтны тоо */
  async listSettings(tenantId: string, authId: string, campId: string) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, campId);
      await getCampOr404(tx, tenantId, campId);
      const [positions, settings, counts] = await Promise.all([
        tx.campPosition.findMany({ where: { tenantId }, select: { id: true, name: true, isActive: true }, orderBy: { name: 'asc' } }),
        tx.campPositionSetting.findMany({
          where: { tenantId, campId },
          select: {
            positionId: true, mealLocationId: true, mealsIncluded: true, updatedAt: true,
            mealLocation: { select: { name: true } },
            shiftPatterns: { select: { dayFrom: true, dayTo: true, shift: true }, orderBy: { dayFrom: 'asc' } },
          },
        }),
        tx.campEmployee.groupBy({ by: ['positionId'], where: { tenantId, campId, status: 'ACTIVE', positionId: { not: null } }, _count: { _all: true } }),
      ]);
      const byPos = new Map(settings.map((s) => [s.positionId, s]));
      const n = new Map(counts.map((c) => [c.positionId, c._count._all]));
      return positions
        .filter((p) => p.isActive || byPos.has(p.id) || (n.get(p.id) ?? 0) > 0)
        .map((p) => {
          const s = byPos.get(p.id);
          return {
            positionId: p.id,
            name: p.name,
            isActive: p.isActive,
            activeEmployees: n.get(p.id) ?? 0,
            mealLocationId: s?.mealLocationId ?? null,
            mealLocationName: s?.mealLocation?.name ?? null,
            mealsIncluded: s?.mealsIncluded ?? null,
            shiftPattern: s?.shiftPatterns ?? [],
          };
        });
    });
  }

  async upsertSetting(tenantId: string, authId: string, campId: string, positionId: string, dto: UpsertPositionSettingDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const actorUserId = await this.access.require(tx, tenantId, authId, campId, P.MASTER_MANAGE);
        await getCampOr404(tx, tenantId, campId);
        const pos = await tx.campPosition.findFirst({ where: { id: positionId, tenantId }, select: { id: true, name: true } });
        if (!pos) throw notFound('camp.err.catalog.position_not_found');
        if (dto.mealLocationId) await assertMealLocation(tx, tenantId, campId, dto.mealLocationId);
        // Загварыг бичихээс ӨМНӨ шалгана (ростерын урт)
        const normalized =
          dto.shiftPattern !== undefined ? normalizeShiftPattern(dto.shiftPattern, (await getRosterSettings(tx, tenantId, campId)).rosterOnDays) : undefined;
        const before = await this.settingView(tx, tenantId, campId, positionId);
        const s = await tx.campPositionSetting.upsert({
          where: { tenantId_campId_positionId: { tenantId, campId, positionId } },
          create: {
            tenantId, campId, positionId,
            mealLocationId: dto.mealLocationId ?? null,
            mealsIncluded: dto.mealsIncluded ?? null,
          },
          update: {
            ...(dto.mealLocationId !== undefined ? { mealLocationId: dto.mealLocationId } : {}),
            ...(dto.mealsIncluded !== undefined ? { mealsIncluded: dto.mealsIncluded } : {}),
          },
          select: { id: true },
        });
        if (normalized !== undefined) {
          await tx.campPositionShiftPattern.deleteMany({ where: { tenantId, positionSettingId: s.id } });
          if (normalized.length > 0) {
            await tx.campPositionShiftPattern.createMany({ data: normalized.map((x) => ({ tenantId, positionSettingId: s.id, ...x })) });
          }
        }
        const after = await this.settingView(tx, tenantId, campId, positionId);
        await this.audit.record(tx, {
          tenantId, campId, entityType: 'position_setting', entityId: s.id, action: before ? 'UPDATE' : 'CREATE', actorUserId,
          fields: ['mealLocationId', 'mealsIncluded', 'shiftPatterns'], before, after: { ...after!, id: s.id },
          summaryParams: { name: pos.name },
        });
        return after;
      }),
    );
  }

  private async settingView(tx: Tx, tenantId: string, campId: string, positionId: string) {
    const s = await tx.campPositionSetting.findFirst({
      where: { tenantId, campId, positionId },
      select: { mealLocationId: true, mealsIncluded: true, shiftPatterns: { select: { dayFrom: true, dayTo: true, shift: true }, orderBy: { dayFrom: 'asc' } } },
    });
    return s ? { mealLocationId: s.mealLocationId, mealsIncluded: s.mealsIncluded, shiftPatterns: s.shiftPatterns } : null;
  }
}

/**
 * Албан тушаалын нэрийг каталогоос олно (нэрийн нормчлолоор), байхгүй бол ҮҮСГЭНЭ (хуучин клиент / импортын чөлөөт текст).
 * Идэвхгүй албан тушаалыг сонгосон бол алдаа (одоогийнх хэвээр бол зөвшөөрнө — `currentId`).
 */
export async function resolvePositionByName(tx: Tx, tenantId: string, name: string, currentId?: string | null): Promise<{ id: string; name: string; created: boolean }> {
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, 100);
  const all = await tx.campPosition.findMany({ where: { tenantId }, select: { id: true, name: true, isActive: true } });
  const hit = all.find((p) => normName(p.name) === normName(clean));
  if (hit) {
    if (!hit.isActive && hit.id !== currentId) throw badRequest('camp.err.catalog.position_inactive', { name: hit.name });
    return { id: hit.id, name: hit.name, created: false };
  }
  const p = await tx.campPosition.create({ data: { tenantId, name: clean }, select: { id: true, name: true } });
  return { ...p, created: true };
}

/** positionId → каталогийн мөр (идэвхтэй эсвэл одоогийнх) */
export async function assertPosition(tx: Tx, tenantId: string, positionId: string, currentId?: string | null): Promise<{ id: string; name: string }> {
  const p = await tx.campPosition.findFirst({ where: { id: positionId, tenantId }, select: { id: true, name: true, isActive: true } });
  if (!p) throw badRequest('camp.err.catalog.position_not_found');
  if (!p.isActive && p.id !== currentId) throw badRequest('camp.err.catalog.position_inactive', { name: p.name });
  return { id: p.id, name: p.name };
}
