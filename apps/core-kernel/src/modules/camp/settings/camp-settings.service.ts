import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../common/camp-access.service';
import { CAMP_PERMISSIONS } from '../common/camp-permissions';
import { fromDbTime, inTenantTx, toDbTime, Tx } from '../common/camp-tx';
import { withCampErrors } from '../common/camp-errors';
import { assertMealLocation, getCampOr404 } from '../common/camp-lookup';
import { CreateMealLocationDto, QueryActiveDto, UpdateCampSettingsDto, UpdateMealLocationDto } from './camp-settings.dto';
import { badRequest, conflict, notFound } from '../../../common/i18n/app-error';
import { mergeCatalogNameI18n } from '../common/catalog-name-i18n';

const P = CAMP_PERMISSIONS;

/** Тохиргоо байхгүй кемпийн анхдагч утга (DB DEFAULT-тай ижил) */
const CAMP_SETTINGS_DEFAULTS = {
  vatRate: '10',
  changeoverWeekday: 3,
  rosterOnDays: 14,
  rosterOffDays: 14,
  mealOrderCutoffTime: null as string | null,
  defaultMealLocationId: null as string | null,
  cateringOrganizationId: null as string | null,
  autoCodePrefix: 'Z',
  mealOrderLeadDays: 1,
  mealOrderAfterCutoff: 'BLOCK',
  mealOrderRequiresAccept: true,
  mealOrderEditAfterAccept: 'TWO_SIDED',
  mealOrderDefaultFill: 'EMPTY',
  mealOrderAllowSelfAccept: false,
};

type SettingsRow = {
  vatRate: Prisma.Decimal;
  changeoverWeekday: number;
  rosterOnDays: number;
  rosterOffDays: number;
  mealOrderCutoffTime: Date | null;
  defaultMealLocationId: string | null;
  cateringOrganizationId: string | null;
  autoCodePrefix: string;
  mealOrderLeadDays: number;
  mealOrderAfterCutoff: string;
  mealOrderRequiresAccept: boolean;
  mealOrderEditAfterAccept: string;
  mealOrderDefaultFill: string;
  mealOrderAllowSelfAccept: boolean;
  updatedAt: Date;
};

const toSettingsView = (campId: string, s: SettingsRow | null) =>
  s
    ? {
        campId,
        configured: true,
        vatRate: new Prisma.Decimal(s.vatRate).toString(),
        changeoverWeekday: s.changeoverWeekday,
        rosterOnDays: s.rosterOnDays,
        rosterOffDays: s.rosterOffDays,
        mealOrderCutoffTime: s.mealOrderCutoffTime ? fromDbTime(s.mealOrderCutoffTime) : null,
        defaultMealLocationId: s.defaultMealLocationId,
        cateringOrganizationId: s.cateringOrganizationId,
        autoCodePrefix: s.autoCodePrefix,
        mealOrderLeadDays: s.mealOrderLeadDays,
        mealOrderAfterCutoff: s.mealOrderAfterCutoff,
        mealOrderRequiresAccept: s.mealOrderRequiresAccept,
        mealOrderEditAfterAccept: s.mealOrderEditAfterAccept,
        mealOrderDefaultFill: s.mealOrderDefaultFill,
        mealOrderAllowSelfAccept: s.mealOrderAllowSelfAccept,
        updatedAt: s.updatedAt,
      }
    : { campId, configured: false, ...CAMP_SETTINGS_DEFAULTS, updatedAt: null };

const SETTINGS_SELECT = {
  vatRate: true,
  changeoverWeekday: true,
  rosterOnDays: true,
  rosterOffDays: true,
  mealOrderCutoffTime: true,
  defaultMealLocationId: true,
  cateringOrganizationId: true,
  autoCodePrefix: true,
  mealOrderLeadDays: true,
  mealOrderAfterCutoff: true,
  mealOrderRequiresAccept: true,
  mealOrderEditAfterAccept: true,
  mealOrderDefaultFill: true,
  mealOrderAllowSelfAccept: true,
  updatedAt: true,
} as const;

/**
 * Кемпийн тохиргоо + хоол идэх байршил (Шат 2.3). Бичих: `camp.settings.manage` (тухайн кемпэд).
 */
@Injectable()
export class CampSettingsService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
  ) {}

  async getSettings(tenantId: string, authId: string, campId: string) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, campId);
      await getCampOr404(tx, tenantId, campId);
      const s = await tx.campSetting.findFirst({ where: { tenantId, campId }, select: SETTINGS_SELECT });
      return toSettingsView(campId, s);
    });
  }

  async updateSettings(tenantId: string, authId: string, campId: string, dto: UpdateCampSettingsDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, campId, P.SETTINGS_MANAGE);
        await getCampOr404(tx, tenantId, campId);
        if (dto.defaultMealLocationId !== null) await assertMealLocation(tx, tenantId, campId, dto.defaultMealLocationId);
        if (dto.cateringOrganizationId) await this.assertCateringOrg(tx, tenantId, dto.cateringOrganizationId);
        await this.assertRosterChangeAllowed(tx, tenantId, campId, dto.rosterOnDays);
        const data = {
          vatRate: new Prisma.Decimal(dto.vatRate),
          changeoverWeekday: dto.changeoverWeekday,
          rosterOnDays: dto.rosterOnDays,
          rosterOffDays: dto.rosterOffDays,
          mealOrderCutoffTime: dto.mealOrderCutoffTime === null ? null : toDbTime(dto.mealOrderCutoffTime),
          defaultMealLocationId: dto.defaultMealLocationId,
          ...(dto.cateringOrganizationId !== undefined ? { cateringOrganizationId: dto.cateringOrganizationId } : {}),
          ...(dto.autoCodePrefix !== undefined ? { autoCodePrefix: dto.autoCodePrefix } : {}),
          ...(dto.mealOrderLeadDays !== undefined ? { mealOrderLeadDays: dto.mealOrderLeadDays } : {}),
          ...(dto.mealOrderAfterCutoff !== undefined ? { mealOrderAfterCutoff: dto.mealOrderAfterCutoff } : {}),
          ...(dto.mealOrderRequiresAccept !== undefined ? { mealOrderRequiresAccept: dto.mealOrderRequiresAccept } : {}),
          ...(dto.mealOrderEditAfterAccept !== undefined ? { mealOrderEditAfterAccept: dto.mealOrderEditAfterAccept } : {}),
          ...(dto.mealOrderDefaultFill !== undefined ? { mealOrderDefaultFill: dto.mealOrderDefaultFill } : {}),
          ...(dto.mealOrderAllowSelfAccept !== undefined ? { mealOrderAllowSelfAccept: dto.mealOrderAllowSelfAccept } : {}),
        };
        const s = await tx.campSetting.upsert({
          where: { tenantId_campId: { tenantId, campId } },
          create: { tenantId, campId, ...data },
          update: data,
          select: SETTINGS_SELECT,
        });
        return toSettingsView(campId, s);
      }),
    );
  }

  /** Катеринг байгууллага: tenant-д байгаа, идэвхтэй, CATERING үйлчилгээтэй (400) */
  private async assertCateringOrg(tx: Tx, tenantId: string, id: string) {
    const org = await tx.coreOrganization.findFirst({
      where: { id, tenantId },
      select: {
        name: true,
        isActive: true,
        serviceTypes: { where: { serviceType: { code: 'CATERING' } }, select: { serviceTypeId: true } },
      },
    });
    if (!org) throw badRequest('camp.err.settings.1');
    if (!org.isActive) throw badRequest('camp.err.settings.2', { name: org.name });
    if (org.serviceTypes.length === 0) {
      throw badRequest('camp.err.settings.3', { name: org.name });
    }
  }

  /**
   * Ээлжийн загвар нь 1..roster_on_days-ийг яг бүрхдэг тул ростерын урт өөрчлөгдөхөд загвартай хэлтэс бүр буруу болно.
   * → загвартай хэлтэс байвал 409 (эхлээд загварыг устгах/шинэчлэх).
   */
  private async assertRosterChangeAllowed(tx: Tx, tenantId: string, campId: string, rosterOnDays: number) {
    const current = await tx.campSetting.findFirst({ where: { tenantId, campId }, select: { rosterOnDays: true } });
    const currentDays = current?.rosterOnDays ?? 14;
    if (currentDays === rosterOnDays) return;
    const depts = await tx.hrDepartment.findMany({
      where: { tenantId, campId, shiftPatterns: { some: {} } },
      select: { code: true },
      orderBy: { code: 'asc' },
    });
    if (depts.length > 0) {
      throw conflict('camp.err.settings.8', { from: currentDays, to: rosterOnDays, codes: depts.map((d) => d.code).join(', ') });
    }    // v0.2.1 (Д-1): кемп × албан тушаалын ээлжийн загвар ч ростерын урттай холбоотой
    const positions = await tx.campPositionSetting.findMany({
      where: { tenantId, campId, shiftPatterns: { some: {} } },
      select: { position: { select: { name: true } } },
      orderBy: { position: { name: 'asc' } },
    });
    if (positions.length > 0) {
      throw conflict('camp.err.settings.10', { from: currentDays, to: rosterOnDays, names: positions.map((p) => p.position.name).join(', ') });
    }
  }

  // ── Хоол идэх байршил ───────────────────────────────────────

  async listMealLocations(tenantId: string, authId: string, campId: string, q: QueryActiveDto) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, campId);
      await getCampOr404(tx, tenantId, campId);
      return tx.campMealLocation.findMany({
        where: { tenantId, campId, ...(q.activeOnly ? { isActive: true } : {}) },
        select: { id: true, name: true, nameI18n: true, isActive: true, createdAt: true, updatedAt: true },
        orderBy: { name: 'asc' },
      });
    });
  }

  async createMealLocation(tenantId: string, authId: string, campId: string, dto: CreateMealLocationDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, campId, P.SETTINGS_MANAGE);
        await getCampOr404(tx, tenantId, campId);
        const dup = await tx.campMealLocation.findFirst({ where: { tenantId, campId, name: dto.name }, select: { id: true } });
        if (dup) throw conflict('camp.err.settings.4', { name: dto.name });
        return tx.campMealLocation.create({
          data: { tenantId, campId, name: dto.name, nameI18n: mergeCatalogNameI18n(dto.name, undefined, dto.nameI18n) },
          select: { id: true, name: true, nameI18n: true, isActive: true, createdAt: true, updatedAt: true },
        });
      }),
    );
  }

  async updateMealLocation(tenantId: string, authId: string, campId: string, id: string, dto: UpdateMealLocationDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, campId, P.SETTINGS_MANAGE);
        const loc = await tx.campMealLocation.findFirst({ where: { id, tenantId, campId }, select: { id: true, name: true, nameI18n: true } });
        if (!loc) throw notFound('camp.err.settings.5');
        if (dto.name !== undefined) {
          const dup = await tx.campMealLocation.findFirst({ where: { tenantId, campId, name: dto.name, NOT: { id } }, select: { id: true } });
          if (dup) throw conflict('camp.err.settings.4', { name: dto.name });
        }
        if (dto.isActive === false) {
          const isDefault = await tx.campSetting.findFirst({ where: { tenantId, campId, defaultMealLocationId: id }, select: { id: true } });
          if (isDefault) throw conflict('camp.err.settings.6');
          // v0.2.1 (Q1): байршлыг ажилтан / албан тушаалын тохиргоо ашигладаг (хэлтэс биш)
          const [employees, positions] = await Promise.all([
            tx.hrEmployee.count({ where: { tenantId, campId, mealLocationId: id, status: 'ACTIVE' } }),
            tx.campPositionSetting.count({ where: { tenantId, campId, mealLocationId: id } }),
          ]);
          if (employees + positions > 0) throw conflict('camp.err.settings.9', { employees, positions });
        }
        return tx.campMealLocation.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...((dto.name !== undefined || dto.nameI18n !== undefined)
              ? { nameI18n: mergeCatalogNameI18n(dto.name ?? loc.name, loc.nameI18n, dto.nameI18n) }
              : {}),
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          },
          select: { id: true, name: true, nameI18n: true, isActive: true, createdAt: true, updatedAt: true },
        });
      }),
    );
  }
}
