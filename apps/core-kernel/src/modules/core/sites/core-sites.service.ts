import { Injectable } from '@nestjs/common';
import { CampAuditAction } from '@prisma/client';
import { conflict, notFound } from '../../../common/i18n/app-error';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../../camp/common/camp-access.service';
import { CampAuditService } from '../../camp/common/camp-audit.service';
import { withCampErrors } from '../../camp/common/camp-errors';
import { inTenantTx } from '../../camp/common/camp-tx';
import { CreateSiteDto, QuerySitesDto, UpdateSiteDto } from './core-sites.dto';

const SITE_SELECT = {
  id: true,
  type: true,
  code: true,
  name: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;
const SITE_FIELDS = ['type', 'code', 'name', 'isActive'] as const;

@Injectable()
export class CoreSitesService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
    private readonly audit: CampAuditService,
  ) {}

  async list(tenantId: string, authId: string, query: QuerySitesDto) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireTenantAdmin(tx, tenantId, authId);
      return tx.coreSite.findMany({
        where: { tenantId, ...(query.activeOnly ? { isActive: true } : {}) },
        select: SITE_SELECT,
        orderBy: [{ type: 'asc' }, { code: 'asc' }],
      });
    });
  }

  async create(tenantId: string, authId: string, dto: CreateSiteDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const actorId = await this.access.requireTenantAdmin(tx, tenantId, authId);
        const duplicate = await tx.coreSite.findFirst({ where: { tenantId, code: dto.code }, select: { id: true } });
        if (duplicate) throw conflict('core.site.code_exists', { code: dto.code });

        const site = await tx.coreSite.create({
          data: { tenantId, type: dto.type, code: dto.code, name: dto.name },
          select: SITE_SELECT,
        });
        if (dto.type === 'CAMP') {
          const camp = await tx.camp.create({
            data: { tenantId, siteId: site.id, code: site.code, name: site.name, isActive: site.isActive },
            select: { id: true },
          });
          await tx.campSetting.create({ data: { tenantId, campId: camp.id } });
        }
        await this.audit.record(tx, {
          tenantId,
          campId: null,
          entityType: 'site',
          entityId: site.id,
          action: CampAuditAction.CREATE,
          actorUserId: actorId,
          fields: SITE_FIELDS,
          after: site,
          summaryParams: { code: site.code, name: site.name },
        });
        return site;
      }),
    );
  }

  async update(tenantId: string, authId: string, id: string, dto: UpdateSiteDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const actorId = await this.access.requireTenantAdmin(tx, tenantId, authId);
        const before = await tx.coreSite.findFirst({ where: { tenantId, id }, select: SITE_SELECT });
        if (!before) throw notFound('core.site.not_found');

        const type = dto.type ?? before.type;
        if (before.type === 'CAMP' && type !== 'CAMP') {
          throw conflict('core.site.camp_type_immutable', { code: before.code });
        }
        const duplicate = dto.code === undefined ? null : await tx.coreSite.findFirst({
          where: { tenantId, code: dto.code, NOT: { id } },
          select: { id: true },
        });
        if (duplicate) throw conflict('core.site.code_exists', { code: dto.code });

        const camp = before.type === 'CAMP'
          ? await tx.camp.findFirst({ where: { tenantId, siteId: id }, select: { id: true } })
          : null;
        if (before.type === 'CAMP' && !camp) throw conflict('core.site.camp_link_missing', { code: before.code });

        const data = {
          type,
          ...(dto.code !== undefined ? { code: dto.code } : {}),
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        };
        if (camp && type === 'CAMP') {
          const campCode = dto.code ?? before.code;
          if (dto.code !== undefined) {
            const duplicateCamp = await tx.camp.findFirst({
              where: { tenantId, code: campCode, NOT: { id: camp.id } },
              select: { id: true },
            });
            if (duplicateCamp) throw conflict('core.site.code_exists', { code: campCode });
          }
          await tx.camp.update({
            where: { id: camp.id },
            data: {
              ...(dto.code !== undefined ? { code: dto.code } : {}),
              ...(dto.name !== undefined ? { name: dto.name } : {}),
              ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
            },
          });
          await tx.coreSite.update({ where: { id }, data, select: { id: true } });
        } else {
          const updated = await tx.coreSite.update({ where: { id }, data, select: SITE_SELECT });
          if (type === 'CAMP') {
            const newCamp = await tx.camp.create({
              data: { tenantId, siteId: id, code: updated.code, name: updated.name, isActive: updated.isActive },
              select: { id: true },
            });
            await tx.campSetting.create({ data: { tenantId, campId: newCamp.id } });
          }
        }

        const updated = await tx.coreSite.findFirstOrThrow({ where: { tenantId, id }, select: SITE_SELECT });
        await this.audit.record(tx, {
          tenantId,
          campId: null,
          entityType: 'site',
          entityId: id,
          action: CampAuditAction.UPDATE,
          actorUserId: actorId,
          fields: SITE_FIELDS,
          before,
          after: updated,
          summaryParams: { code: updated.code, name: updated.name },
        });
        return updated;
      }),
    );
  }

  async archive(tenantId: string, authId: string, id: string) {
    return this.update(tenantId, authId, id, { isActive: false });
  }
}
