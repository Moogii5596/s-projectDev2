import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../common/camp-access.service';
import { CAMP_PERMISSIONS } from '../common/camp-permissions';
import { inTenantTx } from '../common/camp-tx';
import { withCampErrors } from '../common/camp-errors';
import { getCampOr404 } from '../common/camp-lookup';
import { CreateCampDto, QueryActiveOnlyDto, UpdateCampDto } from './camp-master.dto';

const P = CAMP_PERMISSIONS;
const CAMP_SELECT = { id: true, code: true, name: true, location: true, isActive: true, createdAt: true, updatedAt: true } as const;

/**
 * Кемп (Шат 2.4). Жагсаалт = хэрэглэгчийн эрхтэй кемпүүд. Үүсгэх = бүх кемпийн `camp.master.manage`
 * (кемп тус бүрийн эрх нь тэр кемп үүссэний дараа л өгөгдөнө). Үүсгэхэд анхдагч тохиргоо (camp_settings) хамт үүснэ.
 */
@Injectable()
export class CampsService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
  ) {}

  async list(tenantId: string, authId: string, q: QueryActiveOnlyDto) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      const actor = await this.access.requireAccess(tx, tenantId, authId, null);
      const all = actor.perms.isTenantAdmin || actor.perms.global.length > 0;
      const campIds = Object.entries(actor.perms.byCamp).filter(([, p]) => p.length > 0).map(([id]) => id);
      return tx.camp.findMany({
        where: { tenantId, ...(all ? {} : { id: { in: campIds } }), ...(q.activeOnly ? { isActive: true } : {}) },
        select: CAMP_SELECT,
        orderBy: { code: 'asc' },
      });
    });
  }

  async get(tenantId: string, authId: string, campId: string) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, campId);
      const camp = await tx.camp.findFirst({ where: { id: campId, tenantId }, select: CAMP_SELECT });
      if (!camp) throw new NotFoundException('Кемп олдсонгүй');
      return camp;
    });
  }

  async create(tenantId: string, authId: string, dto: CreateCampDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, null, P.MASTER_MANAGE);
        const dup = await tx.camp.findFirst({ where: { tenantId, code: dto.code }, select: { id: true } });
        if (dup) throw new ConflictException(`"${dto.code}" кодтой кемп аль хэдийн байна`);
        const camp = await tx.camp.create({
          data: { tenantId, code: dto.code, name: dto.name, location: dto.location ?? null },
          select: CAMP_SELECT,
        });
        await tx.campSetting.create({ data: { tenantId, campId: camp.id } });   // DB DEFAULT-ууд (НӨАТ 10%, Лхагва, 14/14)
        return camp;
      }),
    );
  }

  async update(tenantId: string, authId: string, campId: string, dto: UpdateCampDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, campId, P.MASTER_MANAGE);
        await getCampOr404(tx, tenantId, campId);
        return tx.camp.update({
          where: { id: campId },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.location !== undefined ? { location: dto.location } : {}),
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          },
          select: CAMP_SELECT,
        });
      }),
    );
  }
}
