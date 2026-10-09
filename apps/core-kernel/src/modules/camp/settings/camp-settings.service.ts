import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../common/camp-access.service';
import { CAMP_PERMISSIONS } from '../common/camp-permissions';
import { fromDbTime, inTenantTx, toDbTime, Tx } from '../common/camp-tx';
import { withCampErrors } from '../common/camp-errors';
import { assertMealLocation, getCampOr404 } from '../common/camp-lookup';
import { CreateMealLocationDto, QueryActiveDto, UpdateCampSettingsDto, UpdateMealLocationDto } from './camp-settings.dto';

const P = CAMP_PERMISSIONS;

/** Тохиргоо байхгүй кемпийн анхдагч утга (DB DEFAULT-тай ижил) */
export const CAMP_SETTINGS_DEFAULTS = {
  vatRate: '10',
  changeoverWeekday: 3,
  rosterOnDays: 14,
  rosterOffDays: 14,
  mealOrderCutoffTime: null as string | null,
  defaultMealLocationId: null as string | null,
};

type SettingsRow = {
  vatRate: Prisma.Decimal;
  changeoverWeekday: number;
  rosterOnDays: number;
  rosterOffDays: number;
  mealOrderCutoffTime: Date | null;
  defaultMealLocationId: string | null;
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
        await this.assertRosterChangeAllowed(tx, tenantId, campId, dto.rosterOnDays);
        const data = {
          vatRate: new Prisma.Decimal(dto.vatRate),
          changeoverWeekday: dto.changeoverWeekday,
          rosterOnDays: dto.rosterOnDays,
          rosterOffDays: dto.rosterOffDays,
          mealOrderCutoffTime: dto.mealOrderCutoffTime === null ? null : toDbTime(dto.mealOrderCutoffTime),
          defaultMealLocationId: dto.defaultMealLocationId,
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

  /**
   * Ээлжийн загвар нь 1..roster_on_days-ийг яг бүрхдэг тул ростерын урт өөрчлөгдөхөд загвартай хэлтэс бүр буруу болно.
   * → загвартай хэлтэс байвал 409 (эхлээд загварыг устгах/шинэчлэх).
   */
  private async assertRosterChangeAllowed(tx: Tx, tenantId: string, campId: string, rosterOnDays: number) {
    const current = await tx.campSetting.findFirst({ where: { tenantId, campId }, select: { rosterOnDays: true } });
    const currentDays = current?.rosterOnDays ?? 14;
    if (currentDays === rosterOnDays) return;
    const depts = await tx.campDepartment.findMany({
      where: { tenantId, campId, shiftPatterns: { some: {} } },
      select: { code: true },
      orderBy: { code: 'asc' },
    });
    if (depts.length > 0) {
      throw new ConflictException(
        `Ростерын урт ${currentDays} → ${rosterOnDays} өөрчлөхөд ээлжийн загвар буруу болно. ` +
          `Эхлээд эдгээр хэлтсийн загварыг шинэчилнэ үү: ${depts.map((d) => d.code).join(', ')}`,
      );
    }
  }

  // ── Хоол идэх байршил ───────────────────────────────────────

  async listMealLocations(tenantId: string, authId: string, campId: string, q: QueryActiveDto) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, campId);
      await getCampOr404(tx, tenantId, campId);
      return tx.campMealLocation.findMany({
        where: { tenantId, campId, ...(q.activeOnly ? { isActive: true } : {}) },
        select: { id: true, name: true, isActive: true, createdAt: true, updatedAt: true },
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
        if (dup) throw new ConflictException(`"${dto.name}" байршил аль хэдийн байна`);
        return tx.campMealLocation.create({
          data: { tenantId, campId, name: dto.name },
          select: { id: true, name: true, isActive: true, createdAt: true, updatedAt: true },
        });
      }),
    );
  }

  async updateMealLocation(tenantId: string, authId: string, campId: string, id: string, dto: UpdateMealLocationDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, campId, P.SETTINGS_MANAGE);
        const loc = await tx.campMealLocation.findFirst({ where: { id, tenantId, campId }, select: { id: true } });
        if (!loc) throw new NotFoundException('Хоол идэх байршил олдсонгүй');
        if (dto.name !== undefined) {
          const dup = await tx.campMealLocation.findFirst({ where: { tenantId, campId, name: dto.name, NOT: { id } }, select: { id: true } });
          if (dup) throw new ConflictException(`"${dto.name}" байршил аль хэдийн байна`);
        }
        if (dto.isActive === false) {
          const isDefault = await tx.campSetting.findFirst({ where: { tenantId, campId, defaultMealLocationId: id }, select: { id: true } });
          if (isDefault) throw new ConflictException('Кемпийн анхдагч байршлыг идэвхгүй болгохын өмнө тохиргоонд өөр байршил сонгоно уу');
          const depts = await tx.campDepartment.findMany({ where: { tenantId, campId, mealLocationId: id, isActive: true }, select: { code: true } });
          if (depts.length > 0) {
            throw new ConflictException(`Идэвхтэй хэлтэс энэ байршлыг ашиглаж байна: ${depts.map((d) => d.code).join(', ')}`);
          }
        }
        return tx.campMealLocation.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          },
          select: { id: true, name: true, isActive: true, createdAt: true, updatedAt: true },
        });
      }),
    );
  }
}
