import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../common/camp-access.service';
import { CAMP_PERMISSIONS } from '../common/camp-permissions';
import { fromDbDate, inTenantTx, toDbDate, Tx } from '../common/camp-tx';
import { withCampErrors } from '../common/camp-errors';
import { getCampOr404, getRosterSettings } from '../common/camp-lookup';
import { CreateCrewDto, QueryActiveOnlyDto, UpdateCrewDto } from './camp-master.dto';

const P = CAMP_PERMISSIONS;
const WEEKDAYS = ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба'];
const CREW_SELECT = { id: true, code: true, name: true, rosterAnchorDate: true, isActive: true, createdAt: true, updatedAt: true } as const;

type CrewRow = { id: string; code: string; name: string | null; rosterAnchorDate: Date; isActive: boolean; createdAt: Date; updatedAt: Date };
const toCrewView = (c: CrewRow) => ({ ...c, rosterAnchorDate: fromDbDate(c.rosterAnchorDate) });

/** 'YYYY-MM-DD' хүчинтэй огноо эсэх (2026-02-30 г.м. татгалзана) */
const isRealDate = (iso: string) => fromDbDate(toDbDate(iso)) === iso;

/** Баг (ростер) — Шат 2.4. Багийн ирэх өдөр нь кемпийн солигдох гарагтай таарна. */
@Injectable()
export class CampCrewsService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
  ) {}

  private async assertAnchor(tx: Tx, tenantId: string, campId: string, iso: string) {
    if (!isRealDate(iso)) throw new BadRequestException(`rosterAnchorDate буруу огноо: ${iso}`);
    const { changeoverWeekday } = await getRosterSettings(tx, tenantId, campId);
    const dow = toDbDate(iso).getUTCDay();
    if (dow !== changeoverWeekday) {
      throw new BadRequestException(
        `Багийн ирэх өдөр (${iso}, ${WEEKDAYS[dow]}) кемпийн солигдох гарагтай (${WEEKDAYS[changeoverWeekday]}) таарах ёстой`,
      );
    }
  }

  async list(tenantId: string, authId: string, campId: string, q: QueryActiveOnlyDto) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, campId);
      await getCampOr404(tx, tenantId, campId);
      const rows = await tx.campCrew.findMany({
        where: { tenantId, campId, ...(q.activeOnly ? { isActive: true } : {}) },
        select: { ...CREW_SELECT, _count: { select: { employees: true } } },
        orderBy: { code: 'asc' },
      });
      return rows.map((r) => ({ ...toCrewView(r), employeeCount: r._count.employees }));
    });
  }

  async create(tenantId: string, authId: string, campId: string, dto: CreateCrewDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, campId, P.MASTER_MANAGE);
        await getCampOr404(tx, tenantId, campId);
        await this.assertAnchor(tx, tenantId, campId, dto.rosterAnchorDate);
        const dup = await tx.campCrew.findFirst({ where: { tenantId, campId, code: dto.code }, select: { id: true } });
        if (dup) throw new ConflictException(`"${dto.code}" баг аль хэдийн байна`);
        const c = await tx.campCrew.create({
          data: { tenantId, campId, code: dto.code, name: dto.name ?? null, rosterAnchorDate: toDbDate(dto.rosterAnchorDate) },
          select: CREW_SELECT,
        });
        return toCrewView(c);
      }),
    );
  }

  async update(tenantId: string, authId: string, campId: string, id: string, dto: UpdateCrewDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, campId, P.MASTER_MANAGE);
        const crew = await tx.campCrew.findFirst({ where: { id, tenantId, campId }, select: { id: true } });
        if (!crew) throw new NotFoundException('Баг олдсонгүй');
        if (dto.rosterAnchorDate !== undefined) await this.assertAnchor(tx, tenantId, campId, dto.rosterAnchorDate);
        if (dto.isActive === false) {
          const active = await tx.campEmployee.count({ where: { tenantId, crewId: id, status: 'ACTIVE' } });
          if (active > 0) throw new ConflictException(`Багт идэвхтэй ${active} ажилтан байна — эхлээд шилжүүлнэ үү`);
        }
        const c = await tx.campCrew.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.rosterAnchorDate !== undefined ? { rosterAnchorDate: toDbDate(dto.rosterAnchorDate) } : {}),
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          },
          select: CREW_SELECT,
        });
        return toCrewView(c);
      }),
    );
  }
}
