import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../common/camp-access.service';
import { CAMP_PERMISSIONS } from '../common/camp-permissions';
import { fromDbDate, inTenantTx, toDbDate, type Tx } from '../common/camp-tx';
import { withCampErrors } from '../common/camp-errors';
import { getCampOr404 } from '../common/camp-lookup';
import { badRequest, notFound } from '../../../common/i18n/app-error';
import { billableOn, convertAmounts, invertRate, lineAmounts, monthStart, paymentRate, priceAt } from './contract-pricing';
import type { ContractStatus, PriceQuote, RatePolicy } from './contract.types';
import type { QuoteDto } from './contracts.dto';

const P = CAMP_PERMISSIONS;

export interface ResolvedPrice {
  contractId: string;
  currency: string;
  paymentCurrency: string;
  vatRate: Prisma.Decimal;
  ratePolicy: RatePolicy;
  unitPrice: Prisma.Decimal;
  vatIncluded: boolean;
  priceCurrency: string;
}

/**
 * v0.2.3 Блок 6б — (огноо, гэрээний ажил) → хүчинтэй үнэ, НӨАТ, ханш. Сарын тооцоо (V2-08, v0.2.4) энэ service-ийг
 * transaction дотроо (`resolve`, `rateFor`) дуудна. G-1: бүх утга гэрээний өгөгдлөөс.
 */
@Injectable()
export class ContractPricingService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
  ) {}

  /** Тухайн өдрийн үнэ — гэрээ хүчингүй (21) эсвэл үнэгүй (22) бол алдаа */
  async resolve(tx: Tx, tenantId: string, campId: string, contractId: string, itemId: string, date: string): Promise<ResolvedPrice> {
    const item = await tx.campContractItem.findFirst({
      where: { id: itemId, tenantId, campId, contractId },
      select: {
        contract: {
          select: { status: true, startDate: true, endDate: true, terminatedAt: true, currency: true, paymentCurrency: true, vatRate: true, ratePolicy: true },
        },
        prices: { select: { effectiveFrom: true, unitPrice: true, vatIncluded: true, currency: true } },
      },
    });
    if (!item) throw notFound('camp.err.contract.11');
    const c = item.contract;
    const period = {
      status: c.status as ContractStatus,
      startDate: fromDbDate(c.startDate),
      endDate: c.endDate ? fromDbDate(c.endDate) : null,
      terminatedAt: c.terminatedAt ? fromDbDate(c.terminatedAt) : null,
    };
    if (!billableOn(period, date)) throw badRequest('camp.err.contract.21', { date });
    const price = priceAt(
      item.prices.map((p) => ({ ...p, effectiveFrom: fromDbDate(p.effectiveFrom) })),
      date,
    );
    if (!price) throw badRequest('camp.err.contract.22', { date });
    return {
      contractId,
      currency: c.currency,
      paymentCurrency: c.paymentCurrency,
      vatRate: c.vatRate,
      ratePolicy: c.ratePolicy as RatePolicy,
      unitPrice: price.unitPrice,
      vatIncluded: price.vatIncluded,
      priceCurrency: price.currency,
    };
  }

  /**
   * 1 `from` = ? `to`. NONE → 1; FIXED → гэрээний тогтмол ханш; MONTHLY_MANUAL → `core_exchange_rates`
   * (rate_date = сарын 1; шууд хос, байхгүй бол урвуу хос). Дутуу бол алдаа (23).
   */
  async rateFor(tx: Tx, tenantId: string, contractId: string, from: string, to: string, date: string): Promise<{ rate: Prisma.Decimal; rateDate: string | null }> {
    if (from === to) return { rate: new Prisma.Decimal(1), rateDate: null };
    const c = await tx.campContract.findFirst({ where: { id: contractId, tenantId }, select: { ratePolicy: true, fixedRate: true } });
    if (!c) throw notFound('camp.err.contract.1');
    const month = monthStart(date);
    let monthly: Prisma.Decimal | null = null;
    if (c.ratePolicy === 'MONTHLY_MANUAL') {
      const rows = await tx.coreExchangeRate.findMany({
        where: {
          tenantId,
          rateDate: toDbDate(month),
          OR: [
            { baseCurrency: from, quoteCurrency: to },
            { baseCurrency: to, quoteCurrency: from },
          ],
        },
        select: { baseCurrency: true, rate: true },
      });
      const direct = rows.find((r) => r.baseCurrency === from);
      const inverse = rows.find((r) => r.baseCurrency === to);
      monthly = direct ? direct.rate : inverse ? invertRate(inverse.rate) : null;
    }
    const rate = paymentRate({ policy: c.ratePolicy as RatePolicy, fixedRate: c.fixedRate, monthlyRate: monthly });
    if (!rate) throw badRequest('camp.err.contract.23', { base: from, quote: to, month: month.slice(0, 7) });
    return { rate, rateDate: c.ratePolicy === 'MONTHLY_MANUAL' ? month : null };
  }

  async quoteIn(tx: Tx, tenantId: string, campId: string, contractId: string, q: QuoteDto): Promise<PriceQuote> {
    const r = await this.resolve(tx, tenantId, campId, contractId, q.itemId, q.date);
    const amounts = lineAmounts({ quantity: q.quantity, unitPrice: r.unitPrice, vatIncluded: r.vatIncluded, vatRate: r.vatRate });
    const { rate, rateDate } = await this.rateFor(tx, tenantId, contractId, r.priceCurrency, r.paymentCurrency, q.date);
    const pay = convertAmounts(amounts, rate);
    return {
      date: q.date,
      contractItemId: q.itemId,
      quantity: new Prisma.Decimal(q.quantity).toString(),
      unitPrice: r.unitPrice.toFixed(2),
      currency: r.priceCurrency,
      vatIncluded: r.vatIncluded,
      vatRate: r.vatRate.toString(),
      net: amounts.net.toFixed(2),
      vat: amounts.vat.toFixed(2),
      gross: amounts.gross.toFixed(2),
      paymentCurrency: r.paymentCurrency,
      rate: rate.toString(),
      rateDate,
      paymentNet: pay.net.toFixed(2),
      paymentVat: pay.vat.toFixed(2),
      paymentGross: pay.gross.toFixed(2),
    };
  }

  async quote(tenantId: string, authId: string, campId: string, contractId: string, q: QuoteDto): Promise<PriceQuote> {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, campId, P.CONTRACT_MANAGE);
        await getCampOr404(tx, tenantId, campId);
        return this.quoteIn(tx, tenantId, campId, contractId, q);
      }),
    );
  }
}
