import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../../camp/common/camp-access.service';
import { CAMP_PERMISSIONS } from '../../camp/common/camp-permissions';
import { fromDbDate, inTenantTx, toDbDate } from '../../camp/common/camp-tx';
import { withCampErrors } from '../../camp/common/camp-errors';
import { badRequest, notFound } from '../../../common/i18n/app-error';
import type { ExchangeRateView } from '../../camp/contracts/contract.types';
import type { QueryExchangeRatesDto, UpsertExchangeRateDto } from './exchange-rates.dto';

const P = CAMP_PERMISSIONS;
const SELECT = { id: true, rateDate: true, baseCurrency: true, quoteCurrency: true, rate: true, sourceNote: true, createdAt: true } as const;
type Row = Prisma.CoreExchangeRateGetPayload<{ select: typeof SELECT }>;

const toView = (r: Row): ExchangeRateView => ({
  id: r.id,
  rateDate: fromDbDate(r.rateDate),
  baseCurrency: r.baseCurrency,
  quoteCurrency: r.quoteCurrency,
  rate: r.rate.toString(),
  sourceNote: r.sourceNote,
  createdAt: r.createdAt.toISOString(),
});

/**
 * v0.2.3 Блок 6б (V2-07) — ханш, гараар (tenant түвшин). Эрх: аль нэг кемпэд `camp.contract.manage` (унших ч).
 * Ижил (огноо, хос) → солино (upsert). Сар бүрийн бодлогод огноо = сарын 1 (UI санал болгоно; энд хязгаарлахгүй).
 */
@Injectable()
export class ExchangeRatesService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
  ) {}

  async list(tenantId: string, authId: string, q: QueryExchangeRatesDto): Promise<ExchangeRateView[]> {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.requireInAnyCamp(tx, tenantId, authId, P.CONTRACT_MANAGE);
        const rows = await tx.coreExchangeRate.findMany({
          where: {
            tenantId,
            ...(q.from || q.to ? { rateDate: { ...(q.from ? { gte: toDbDate(q.from) } : {}), ...(q.to ? { lte: toDbDate(q.to) } : {}) } } : {}),
            ...(q.currency ? { OR: [{ baseCurrency: q.currency }, { quoteCurrency: q.currency }] } : {}),
          },
          select: SELECT,
          orderBy: [{ rateDate: 'desc' }, { baseCurrency: 'asc' }, { quoteCurrency: 'asc' }],
          take: 500,
        });
        return rows.map(toView);
      }),
    );
  }

  async upsert(tenantId: string, authId: string, dto: UpsertExchangeRateDto): Promise<ExchangeRateView> {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const userId = await this.access.requireInAnyCamp(tx, tenantId, authId, P.CONTRACT_MANAGE);
        if (dto.baseCurrency === dto.quoteCurrency) throw badRequest('core.err.fx.1');
        const key = { tenantId, rateDate: toDbDate(dto.rateDate), baseCurrency: dto.baseCurrency, quoteCurrency: dto.quoteCurrency };
        const row = await tx.coreExchangeRate.upsert({
          where: { tenantId_rateDate_baseCurrency_quoteCurrency: key },
          create: { ...key, rate: dto.rate, sourceNote: dto.sourceNote ?? null, createdBy: userId },
          update: { rate: dto.rate, sourceNote: dto.sourceNote ?? null, createdBy: userId },
          select: SELECT,
        });
        return toView(row);
      }),
    );
  }

  async remove(tenantId: string, authId: string, id: string): Promise<void> {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.requireInAnyCamp(tx, tenantId, authId, P.CONTRACT_MANAGE);
        const { count } = await tx.coreExchangeRate.deleteMany({ where: { id, tenantId } });
        if (count === 0) throw notFound('core.err.fx.2');
      }),
    );
  }
}
