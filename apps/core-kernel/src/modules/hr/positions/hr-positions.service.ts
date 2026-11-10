import { Injectable } from '@nestjs/common';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../../camp/common/camp-access.service';
import { CAMP_PERMISSIONS } from '../../camp/common/camp-permissions';
import { inTenantTx, Tx } from '../../camp/common/camp-tx';
import { withCampErrors } from '../../camp/common/camp-errors';
import { badRequest, conflict, notFound } from '../../../common/i18n/app-error';
import { CreateCatalogItemDto, QueryCatalogDto, UpdateCatalogItemDto } from '../../camp/common/common.dto';
import { mergeCatalogNameI18n } from '../../camp/common/catalog-name-i18n';

const P = CAMP_PERMISSIONS;
const ITEM = { id: true, name: true, nameI18n: true, code: true, isActive: true, createdAt: true, updatedAt: true } as const;

/** Нэрийг харьцуулах хэлбэр: илүү зай, том/жижиг үсэг үл хамаарна (DB-ийн uq_*_name индекстэй ижил) */
export const normName = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * HR — албан тушаалын каталог (байгууллагын түвшин; v0.2.1 C-01, Q2 → v0.2.2 H1-д HR руу).
 * Унших: аль нэг кемпэд эрхтэй; бичих: бүх кемпийн `camp.master.manage` (эрхийн код v0.3 хүртэл хэвээр).
 * Кемп × албан тушаалын анхдагч (хоол, ээлжийн загвар) — Кемпийн `CampCatalogService.listSettings/upsertSetting`.
 */
@Injectable()
export class HrPositionsService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
  ) {}

  private async assertUniqueName(tx: Tx, tenantId: string, name: string, exceptId?: string) {
    const all = await tx.hrPosition.findMany({ where: { tenantId }, select: { id: true, name: true } });
    const dup = all.find((r) => normName(r.name) === normName(name) && r.id !== exceptId);
    if (dup) throw conflict('camp.err.catalog.position_exists', { name: dup.name });
  }

  async list(tenantId: string, authId: string, q: QueryCatalogDto) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, null);
      const [rows, counts] = await Promise.all([
        tx.hrPosition.findMany({ where: { tenantId, ...(q.activeOnly ? { isActive: true } : {}) }, select: ITEM, orderBy: { name: 'asc' } }),
        tx.hrEmployee.groupBy({ by: ['positionId'], where: { tenantId, status: 'ACTIVE', positionId: { not: null } }, _count: { _all: true } }),
      ]);
      const n = new Map(counts.map((c) => [c.positionId, c._count._all]));
      return rows.map((r) => ({ ...r, activeEmployees: n.get(r.id) ?? 0 }));
    });
  }

  async create(tenantId: string, authId: string, dto: CreateCatalogItemDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, null, P.MASTER_MANAGE);
        const name = dto.name.replace(/\s+/g, ' ');
        await this.assertUniqueName(tx, tenantId, name);
        return tx.hrPosition.create({ data: { tenantId, name, nameI18n: mergeCatalogNameI18n(name, undefined, dto.nameI18n) }, select: ITEM });
      }),
    );
  }

  async update(tenantId: string, authId: string, id: string, dto: UpdateCatalogItemDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, null, P.MASTER_MANAGE);
        const cur = await tx.hrPosition.findFirst({ where: { id, tenantId }, select: { id: true, name: true, nameI18n: true } });
        if (!cur) throw notFound('camp.err.catalog.position_not_found');
        const name = dto.name?.replace(/\s+/g, ' ');
        if (name) await this.assertUniqueName(tx, tenantId, name, id);
        return tx.hrPosition.update({
          where: { id },
          data: {
            ...(name ? { name } : {}),
            ...((name !== undefined || dto.nameI18n !== undefined)
              ? { nameI18n: mergeCatalogNameI18n(name ?? cur.name, cur.nameI18n, dto.nameI18n) }
              : {}),
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          },
          select: ITEM,
        });
      }),
    );
  }
}

/**
 * Албан тушаалын нэрийг каталогоос олно (нэрийн нормчлолоор), байхгүй бол ҮҮСГЭНЭ (хуучин клиент / импортын чөлөөт текст).
 * Идэвхгүй албан тушаалыг сонгосон бол алдаа (одоогийнх хэвээр бол зөвшөөрнө — `currentId`).
 */
export async function resolvePositionByName(tx: Tx, tenantId: string, name: string, currentId?: string | null): Promise<{ id: string; name: string; created: boolean }> {
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, 100);
  const all = await tx.hrPosition.findMany({ where: { tenantId }, select: { id: true, name: true, isActive: true } });
  const hit = all.find((p) => normName(p.name) === normName(clean));
  if (hit) {
    if (!hit.isActive && hit.id !== currentId) throw badRequest('camp.err.catalog.position_inactive', { name: hit.name });
    return { id: hit.id, name: hit.name, created: false };
  }
  const p = await tx.hrPosition.create({
    data: { tenantId, name: clean, nameI18n: mergeCatalogNameI18n(clean) },
    select: { id: true, name: true },
  });
  return { ...p, created: true };
}

/** positionId → каталогийн мөр (идэвхтэй эсвэл одоогийнх) */
export async function assertPosition(tx: Tx, tenantId: string, positionId: string, currentId?: string | null): Promise<{ id: string; name: string }> {
  const p = await tx.hrPosition.findFirst({ where: { id: positionId, tenantId }, select: { id: true, name: true, isActive: true } });
  if (!p) throw badRequest('camp.err.catalog.position_not_found');
  if (!p.isActive && p.id !== currentId) throw badRequest('camp.err.catalog.position_inactive', { name: p.name });
  return { id: p.id, name: p.name };
}
