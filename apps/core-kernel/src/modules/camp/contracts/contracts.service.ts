import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../common/camp-access.service';
import { CAMP_PERMISSIONS } from '../common/camp-permissions';
import { fromDbDate, inTenantTx, toDbDate, type Tx } from '../common/camp-tx';
import { withCampErrors } from '../common/camp-errors';
import { getCampOr404 } from '../common/camp-lookup';
import { todayUb } from '../common/camp-date';
import { badRequest, conflict, notFound } from '../../../common/i18n/app-error';
import { effectiveEnd, paymentTermsError, priceAt, quantityRuleError, ratePolicyError, withinPeriod } from './contract-pricing';
import type {
  AmendmentType,
  ContractAmendmentView,
  ContractItemView,
  ContractListItem,
  ContractMealType,
  ContractPriceView,
  ContractStatus,
  ContractView,
  PaymentTerm,
  PaymentTermRule,
  QuantityRule,
  QuantitySource,
  RatePolicy,
} from './contract.types';
import type {
  AddAmendmentDto,
  AddContractPriceDto,
  CreateContractDto,
  CreateContractItemDto,
  QueryContractsDto,
  TerminateContractDto,
  UpdateContractDto,
  UpdateContractItemDto,
} from './contracts.dto';

const P = CAMP_PERMISSIONS;

const PRICE_SELECT = {
  id: true,
  effectiveFrom: true,
  unitPrice: true,
  vatIncluded: true,
  currency: true,
  note: true,
  amendmentId: true,
  createdAt: true,
} satisfies Prisma.CampContractItemPriceSelect;

const ITEM_SELECT = {
  id: true,
  serviceTypeId: true,
  unitId: true,
  quantityRule: true,
  quantityDivisor: true,
  mealType: true,
  description: true,
  serviceType: { select: { code: true, quantitySource: true } },
  unit: { select: { code: true } },
  prices: { select: PRICE_SELECT, orderBy: { effectiveFrom: 'asc' as const } },
} satisfies Prisma.CampContractItemSelect;

const LIST_SELECT = {
  id: true,
  campId: true,
  contractNo: true,
  title: true,
  organizationId: true,
  customerOrganizationId: true,
  startDate: true,
  endDate: true,
  status: true,
  terminatedAt: true,
  currency: true,
  paymentCurrency: true,
  organization: { select: { name: true } },
  customer: { select: { name: true } },
  _count: { select: { items: true } },
} satisfies Prisma.CampContractSelect;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  note: true,
  vatRate: true,
  ratePolicy: true,
  fixedRate: true,
  paymentTerms: true,
  items: { select: ITEM_SELECT, orderBy: { createdAt: 'asc' as const } },
  amendments: {
    select: {
      id: true,
      amendmentType: true,
      effectiveDate: true,
      previousEndDate: true,
      newEndDate: true,
      documentNo: true,
      note: true,
      createdBy: true,
      createdAt: true,
      createdByUser: { select: { fullName: true, email: true } },
    },
    orderBy: [{ effectiveDate: 'asc' as const }, { createdAt: 'asc' as const }],
  },
} satisfies Prisma.CampContractSelect;

type ListRow = Prisma.CampContractGetPayload<{ select: typeof LIST_SELECT }>;
type DetailRow = Prisma.CampContractGetPayload<{ select: typeof DETAIL_SELECT }>;
type ItemRow = Prisma.CampContractItemGetPayload<{ select: typeof ITEM_SELECT }>;
type PriceRowDb = Prisma.CampContractItemPriceGetPayload<{ select: typeof PRICE_SELECT }>;

const d = (v: Date | null): string | null => (v ? fromDbDate(v) : null);
const dec = (v: Prisma.Decimal | null): string | null => (v === null ? null : v.toString());

/** ACTIVE гэрээнд түгжигдэх талбарууд (хугацаа → сунгалт, валют → шинэ гэрээ) */
const LOCKED_WHEN_ACTIVE = ['contractNo', 'organizationId', 'currency', 'startDate', 'endDate'] as const;
/** ACTIVE гэрээнд өөрчлөгдвөл TERMS нэмэлт өөрчлөлт автоматаар бичигдэнэ */
const TERMS_FIELDS = ['customerOrganizationId', 'paymentCurrency', 'vatRate', 'ratePolicy', 'fixedRate', 'paymentTerms'] as const;

export function toPriceView(p: PriceRowDb): ContractPriceView {
  return {
    id: p.id,
    effectiveFrom: fromDbDate(p.effectiveFrom),
    unitPrice: p.unitPrice.toString(),
    vatIncluded: p.vatIncluded,
    currency: p.currency,
    note: p.note,
    amendmentId: p.amendmentId,
    createdAt: p.createdAt.toISOString(),
  };
}

export function toItemView(i: ItemRow, today: string): ContractItemView {
  const prices = i.prices.map(toPriceView);
  return {
    id: i.id,
    serviceTypeId: i.serviceTypeId,
    serviceTypeCode: i.serviceType.code,
    quantitySource: i.serviceType.quantitySource as QuantitySource,
    unitId: i.unitId,
    unitCode: i.unit.code,
    quantityRule: i.quantityRule as QuantityRule | null,
    quantityDivisor: dec(i.quantityDivisor),
    mealType: i.mealType as ContractMealType | null,
    description: i.description,
    prices,
    currentPrice: priceAt(prices, today),
  };
}

function toListItem(r: ListRow): ContractListItem {
  return {
    id: r.id,
    campId: r.campId,
    contractNo: r.contractNo,
    title: r.title,
    organizationId: r.organizationId,
    organizationName: r.organization.name,
    customerOrganizationId: r.customerOrganizationId,
    customerOrganizationName: r.customer?.name ?? null,
    startDate: fromDbDate(r.startDate),
    endDate: d(r.endDate),
    status: r.status as ContractStatus,
    terminatedAt: d(r.terminatedAt),
    currency: r.currency,
    paymentCurrency: r.paymentCurrency,
    itemCount: r._count.items,
  };
}

export function parsePaymentTerms(v: Prisma.JsonValue): PaymentTerm[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    return { percent: Number(o.percent), rule: String(o.rule) as PaymentTermRule, n: Number(o.n), note: (o.note as string | null | undefined) ?? null };
  });
}

function toView(r: DetailRow, today: string): ContractView {
  return {
    ...toListItem(r),
    note: r.note,
    vatRate: r.vatRate.toString(),
    ratePolicy: r.ratePolicy as RatePolicy,
    fixedRate: dec(r.fixedRate),
    paymentTerms: parsePaymentTerms(r.paymentTerms),
    items: r.items.map((i) => toItemView(i, today)),
    amendments: r.amendments.map(
      (a): ContractAmendmentView => ({
        id: a.id,
        amendmentType: a.amendmentType as AmendmentType,
        effectiveDate: fromDbDate(a.effectiveDate),
        previousEndDate: d(a.previousEndDate),
        newEndDate: d(a.newEndDate),
        documentNo: a.documentNo,
        note: a.note,
        createdBy: a.createdBy,
        createdByName: a.createdByUser.fullName ?? a.createdByUser.email,
        createdAt: a.createdAt.toISOString(),
      }),
    ),
  };
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const normTerms = (t: { percent: number; rule: string; n: number; note?: string | null }[] | undefined): PaymentTerm[] | undefined =>
  t?.map((x) => ({ percent: x.percent, rule: x.rule as PaymentTermRule, n: x.n, note: x.note ?? null }));

/**
 * v0.2.3 Блок 6б (V2-01, G-1, G-3, G-5) — гэрээ, ажил, үнэ, нэмэлт өөрчлөлт. Кемп бүрт; эрх `camp.contract.manage`
 * (унших ч — арилжааны мэдээлэл). Төлөв: DRAFT (бүгд засагдана) → ACTIVE (хугацаа сунгалтаар, нөхцөл → TERMS түүх,
 * үнэ → PRICE_CHANGE түүх) → TERMINATED (зөвхөн унших). Үнийн тооцоо → `ContractPricingService`.
 */
@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
  ) {}

  // ── туслах ──
  private async guard(tx: Tx, tenantId: string, authId: string, campId: string): Promise<string> {
    const userId = await this.access.require(tx, tenantId, authId, campId, P.CONTRACT_MANAGE);
    await getCampOr404(tx, tenantId, campId);
    return userId;
  }

  private async load(tx: Tx, tenantId: string, campId: string, id: string): Promise<DetailRow> {
    const row = await tx.campContract.findFirst({ where: { id, tenantId, campId }, select: DETAIL_SELECT });
    if (!row) throw notFound('camp.err.contract.1');
    return row;
  }

  private async view(tx: Tx, tenantId: string, campId: string, id: string): Promise<ContractView> {
    return toView(await this.load(tx, tenantId, campId, id), todayUb());
  }

  private async assertOrg(tx: Tx, tenantId: string, id: string | null | undefined, field: string): Promise<void> {
    if (!id) return;
    const org = await tx.coreOrganization.findFirst({ where: { id, tenantId }, select: { isActive: true } });
    if (!org?.isActive) throw badRequest('camp.err.contract.4', { field });
  }

  private static statusError(status: string, action: string) {
    return conflict('camp.err.contract.2', { status, action });
  }

  /** Огноо, байгууллага, валют/ханш, төлбөрийн хуваарийн нийцэл (create + update-ийн эцсийн утгаар) */
  private async validate(
    tx: Tx,
    tenantId: string,
    v: {
      organizationId: string;
      customerOrganizationId: string | null;
      startDate: string;
      endDate: string | null;
      currency: string;
      paymentCurrency: string;
      ratePolicy: RatePolicy;
      fixedRate: string | null;
      paymentTerms: PaymentTerm[];
    },
    changed: { organizationId: boolean; customerOrganizationId: boolean },
  ): Promise<void> {
    if (v.endDate !== null && v.endDate < v.startDate) throw badRequest('camp.err.contract.3');
    if (v.customerOrganizationId && v.customerOrganizationId === v.organizationId) throw badRequest('camp.err.contract.5');
    const rateErr = ratePolicyError(v.currency, v.paymentCurrency, v.ratePolicy, v.fixedRate);
    if (rateErr === 'same_currency') throw badRequest('camp.err.contract.6');
    if (rateErr === 'policy_required') throw badRequest('camp.err.contract.7');
    if (rateErr) throw badRequest('camp.err.contract.8');
    const termsErr = paymentTermsError(v.paymentTerms);
    if (termsErr) throw badRequest('camp.err.contract.9', { reason: termsErr });
    if (changed.organizationId) await this.assertOrg(tx, tenantId, v.organizationId, 'organizationId');
    if (changed.customerOrganizationId) await this.assertOrg(tx, tenantId, v.customerOrganizationId, 'customerOrganizationId');
  }

  // ── гэрээ ──
  async list(tenantId: string, authId: string, campId: string, q: QueryContractsDto): Promise<ContractListItem[]> {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.guard(tx, tenantId, authId, campId);
        const on = q.activeOn ? toDbDate(q.activeOn) : null;
        const rows = await tx.campContract.findMany({
          where: {
            tenantId,
            campId,
            ...(q.status ? { status: q.status } : {}),
            ...(on
              ? {
                  status: q.status ?? { in: ['ACTIVE', 'TERMINATED'] },
                  startDate: { lte: on },
                  AND: [{ OR: [{ endDate: null }, { endDate: { gte: on } }] }, { OR: [{ terminatedAt: null }, { terminatedAt: { gte: on } }] }],
                }
              : {}),
          },
          select: LIST_SELECT,
          orderBy: [{ startDate: 'desc' }, { contractNo: 'asc' }],
        });
        return rows.map(toListItem);
      }),
    );
  }

  async get(tenantId: string, authId: string, campId: string, id: string): Promise<ContractView> {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.guard(tx, tenantId, authId, campId);
        return this.view(tx, tenantId, campId, id);
      }),
    );
  }

  async create(tenantId: string, authId: string, campId: string, dto: CreateContractDto): Promise<ContractView> {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.guard(tx, tenantId, authId, campId);
        const v = {
          organizationId: dto.organizationId,
          customerOrganizationId: dto.customerOrganizationId ?? null,
          startDate: dto.startDate,
          endDate: dto.endDate ?? null,
          currency: dto.currency,
          paymentCurrency: dto.paymentCurrency,
          ratePolicy: dto.ratePolicy,
          fixedRate: dto.fixedRate ?? null,
          paymentTerms: normTerms(dto.paymentTerms) ?? [],
        };
        await this.validate(tx, tenantId, v, { organizationId: true, customerOrganizationId: true });
        const row = await tx.campContract.create({
          data: {
            tenantId,
            campId,
            contractNo: dto.contractNo,
            title: dto.title,
            organizationId: v.organizationId,
            customerOrganizationId: v.customerOrganizationId,
            startDate: toDbDate(v.startDate),
            endDate: v.endDate ? toDbDate(v.endDate) : null,
            currency: v.currency,
            paymentCurrency: v.paymentCurrency,
            vatRate: dto.vatRate,
            ratePolicy: v.ratePolicy,
            fixedRate: v.fixedRate,
            paymentTerms: v.paymentTerms as unknown as Prisma.InputJsonValue,
            note: dto.note ?? null,
          },
          select: { id: true },
        });
        return this.view(tx, tenantId, campId, row.id);
      }),
    );
  }

  async update(tenantId: string, authId: string, campId: string, id: string, dto: UpdateContractDto): Promise<ContractView> {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const userId = await this.guard(tx, tenantId, authId, campId);
        const cur = await this.load(tx, tenantId, campId, id);
        if (cur.status === 'TERMINATED') throw ContractsService.statusError(cur.status, 'update');

        const curView = {
          contractNo: cur.contractNo,
          organizationId: cur.organizationId,
          customerOrganizationId: cur.customerOrganizationId,
          startDate: fromDbDate(cur.startDate),
          endDate: d(cur.endDate),
          currency: cur.currency,
          paymentCurrency: cur.paymentCurrency,
          vatRate: cur.vatRate.toString(),
          ratePolicy: cur.ratePolicy as RatePolicy,
          fixedRate: dec(cur.fixedRate),
          paymentTerms: parsePaymentTerms(cur.paymentTerms),
        };
        const incoming: Partial<typeof curView> = {
          ...(dto.contractNo !== undefined ? { contractNo: dto.contractNo } : {}),
          ...(dto.organizationId !== undefined ? { organizationId: dto.organizationId } : {}),
          ...(dto.customerOrganizationId !== undefined ? { customerOrganizationId: dto.customerOrganizationId } : {}),
          ...(dto.startDate !== undefined ? { startDate: dto.startDate } : {}),
          ...(dto.endDate !== undefined ? { endDate: dto.endDate } : {}),
          ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
          ...(dto.paymentCurrency !== undefined ? { paymentCurrency: dto.paymentCurrency } : {}),
          ...(dto.vatRate !== undefined ? { vatRate: dto.vatRate } : {}),
          ...(dto.ratePolicy !== undefined ? { ratePolicy: dto.ratePolicy } : {}),
          ...(dto.fixedRate !== undefined ? { fixedRate: dto.fixedRate } : {}),
          ...(dto.paymentTerms !== undefined ? { paymentTerms: normTerms(dto.paymentTerms) } : {}),
        };
        // Утга нь өөрчлөгдсөн талбарууд л (ижил утгыг дахин илгээх нь алдаа биш)
        const changed = (Object.keys(incoming) as (keyof typeof curView)[]).filter((k) => {
          const a = incoming[k];
          const b = curView[k];
          if (k === 'vatRate' || k === 'fixedRate') return !(a === null ? b === null : b !== null && new Prisma.Decimal(a as string).eq(b as string));
          return !sameJson(a, b);
        });

        if (cur.status === 'ACTIVE') {
          const locked = changed.filter((k) => (LOCKED_WHEN_ACTIVE as readonly string[]).includes(k));
          if (locked.length > 0) throw badRequest('camp.err.contract.10', { fields: locked.join(', ') });
        }
        const next = { ...curView, ...incoming } as typeof curView;
        await this.validate(tx, tenantId, next, {
          organizationId: changed.includes('organizationId'),
          customerOrganizationId: changed.includes('customerOrganizationId'),
        });

        const data: Prisma.CampContractUncheckedUpdateInput = {};
        if (changed.includes('contractNo')) data.contractNo = next.contractNo;
        if (changed.includes('organizationId')) data.organizationId = next.organizationId;
        if (changed.includes('customerOrganizationId')) data.customerOrganizationId = next.customerOrganizationId;
        if (changed.includes('startDate')) data.startDate = toDbDate(next.startDate);
        if (changed.includes('endDate')) data.endDate = next.endDate ? toDbDate(next.endDate) : null;
        if (changed.includes('currency')) data.currency = next.currency;
        if (changed.includes('paymentCurrency')) data.paymentCurrency = next.paymentCurrency;
        if (changed.includes('vatRate')) data.vatRate = next.vatRate;
        if (changed.includes('ratePolicy')) data.ratePolicy = next.ratePolicy;
        if (changed.includes('fixedRate')) data.fixedRate = next.fixedRate;
        if (changed.includes('paymentTerms')) data.paymentTerms = next.paymentTerms as unknown as Prisma.InputJsonValue;
        if (dto.title !== undefined) data.title = dto.title;
        if (dto.note !== undefined) data.note = dto.note;

        // DRAFT-д үнийн валют гэрээнийхтэй хамт солигдоно (үнэ = гэрээний валют)
        if (cur.status === 'DRAFT' && changed.includes('currency')) {
          await tx.campContractItemPrice.updateMany({ where: { tenantId, contractItem: { contractId: id } }, data: { currency: next.currency } });
        }
        if (Object.keys(data).length > 0) await tx.campContract.update({ where: { id }, data });

        const terms = changed.filter((k) => (TERMS_FIELDS as readonly string[]).includes(k));
        if (cur.status === 'ACTIVE' && terms.length > 0) {
          await tx.campContractAmendment.create({
            data: {
              tenantId,
              campId,
              contractId: id,
              amendmentType: 'TERMS',
              effectiveDate: toDbDate(todayUb()),
              documentNo: dto.documentNo ?? null,
              note: terms.join(', '),
              createdBy: userId,
            },
          });
        }
        return this.view(tx, tenantId, campId, id);
      }),
    );
  }

  async remove(tenantId: string, authId: string, campId: string, id: string): Promise<void> {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.guard(tx, tenantId, authId, campId);
        const cur = await tx.campContract.findFirst({ where: { id, tenantId, campId }, select: { status: true } });
        if (!cur) throw notFound('camp.err.contract.1');
        if (cur.status !== 'DRAFT') throw ContractsService.statusError(cur.status, 'delete');
        await tx.campContract.delete({ where: { id } });
      }),
    );
  }

  async activate(tenantId: string, authId: string, campId: string, id: string): Promise<ContractView> {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.guard(tx, tenantId, authId, campId);
        const cur = await this.load(tx, tenantId, campId, id);
        if (cur.status !== 'DRAFT') throw ContractsService.statusError(cur.status, 'activate');
        const start = fromDbDate(cur.startDate);
        const missing = cur.items.filter((i) => priceAt(i.prices.map(toPriceView), start) === null).map((i) => i.serviceType.code);
        if (cur.items.length === 0 || missing.length > 0) throw badRequest('camp.err.contract.18', { services: missing.join(', ') || '—' });
        await this.assertOrg(tx, tenantId, cur.organizationId, 'organizationId');
        await this.assertOrg(tx, tenantId, cur.customerOrganizationId, 'customerOrganizationId');
        await tx.campContract.update({ where: { id }, data: { status: 'ACTIVE' } });
        return this.view(tx, tenantId, campId, id);
      }),
    );
  }

  async terminate(tenantId: string, authId: string, campId: string, id: string, dto: TerminateContractDto): Promise<ContractView> {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const userId = await this.guard(tx, tenantId, authId, campId);
        const cur = await this.load(tx, tenantId, campId, id);
        if (cur.status !== 'ACTIVE') throw ContractsService.statusError(cur.status, 'terminate');
        const period = { startDate: fromDbDate(cur.startDate), endDate: d(cur.endDate), terminatedAt: null };
        if (!withinPeriod(period, dto.terminatedAt)) {
          throw badRequest('camp.err.contract.20', { start: period.startDate, end: period.endDate ?? '—' });
        }
        await tx.campContract.update({ where: { id }, data: { status: 'TERMINATED', terminatedAt: toDbDate(dto.terminatedAt) } });
        await tx.campContractAmendment.create({
          data: {
            tenantId,
            campId,
            contractId: id,
            amendmentType: 'TERMINATION',
            effectiveDate: toDbDate(dto.terminatedAt),
            previousEndDate: cur.endDate,
            newEndDate: toDbDate(dto.terminatedAt),
            documentNo: dto.documentNo ?? null,
            note: dto.note,
            createdBy: userId,
          },
        });
        return this.view(tx, tenantId, campId, id);
      }),
    );
  }

  // ── ажил ──
  private async resolveItemRefs(tx: Tx, tenantId: string, serviceTypeId: string, unitId: string | undefined) {
    const st = await tx.campServiceType.findFirst({ where: { id: serviceTypeId, tenantId }, select: { isActive: true, quantitySource: true, defaultUnitId: true } });
    if (!st?.isActive) throw badRequest('camp.err.contract.12', { field: 'serviceTypeId' });
    const uid = unitId ?? st.defaultUnitId;
    if (!uid) throw badRequest('camp.err.contract.12', { field: 'unitId' });
    const unit = await tx.coreUnit.findFirst({ where: { id: uid, tenantId }, select: { isActive: true } });
    if (!unit?.isActive) throw badRequest('camp.err.contract.12', { field: 'unitId' });
    return { quantitySource: st.quantitySource, unitId: uid };
  }

  private static assertRule(source: string, rule: QuantityRule | null, divisor: string | null, mealType: ContractMealType | null): void {
    const err = quantityRuleError(source, rule, divisor, mealType);
    if (err) throw badRequest('camp.err.contract.13', { reason: err });
  }

  private async assertNoDuplicateItem(tx: Tx, tenantId: string, contractId: string, serviceTypeId: string, mealType: ContractMealType | null, exceptId?: string) {
    const dup = await tx.campContractItem.findFirst({
      where: { tenantId, contractId, serviceTypeId, mealType, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
      select: { id: true },
    });
    if (dup) throw conflict('camp.err.contract.14');
  }

  private async loadItem(tx: Tx, tenantId: string, contractId: string, itemId: string): Promise<ItemRow> {
    const item = await tx.campContractItem.findFirst({ where: { id: itemId, tenantId, contractId }, select: ITEM_SELECT });
    if (!item) throw notFound('camp.err.contract.11');
    return item;
  }

  private async contractStatus(tx: Tx, tenantId: string, campId: string, id: string) {
    const c = await tx.campContract.findFirst({
      where: { id, tenantId, campId },
      select: { status: true, startDate: true, endDate: true, terminatedAt: true, currency: true },
    });
    if (!c) throw notFound('camp.err.contract.1');
    return c;
  }

  async addItem(tenantId: string, authId: string, campId: string, id: string, dto: CreateContractItemDto): Promise<ContractItemView> {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.guard(tx, tenantId, authId, campId);
        const c = await this.contractStatus(tx, tenantId, campId, id);
        if (c.status !== 'DRAFT') throw badRequest('camp.err.contract.24');
        const ref = await this.resolveItemRefs(tx, tenantId, dto.serviceTypeId, dto.unitId);
        const rule = dto.quantityRule ?? null;
        const divisor = dto.quantityDivisor ?? null;
        const mealType = dto.mealType ?? null;
        ContractsService.assertRule(ref.quantitySource, rule, divisor, mealType);
        await this.assertNoDuplicateItem(tx, tenantId, id, dto.serviceTypeId, mealType);
        const row = await tx.campContractItem.create({
          data: {
            tenantId,
            campId,
            contractId: id,
            serviceTypeId: dto.serviceTypeId,
            unitId: ref.unitId,
            quantityRule: rule,
            quantityDivisor: divisor,
            mealType,
            description: dto.description ?? null,
          },
          select: ITEM_SELECT,
        });
        return toItemView(row, todayUb());
      }),
    );
  }

  async updateItem(tenantId: string, authId: string, campId: string, id: string, itemId: string, dto: UpdateContractItemDto): Promise<ContractItemView> {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.guard(tx, tenantId, authId, campId);
        const c = await this.contractStatus(tx, tenantId, campId, id);
        if (c.status === 'TERMINATED') throw ContractsService.statusError(c.status, 'update');
        const item = await this.loadItem(tx, tenantId, id, itemId);
        const ruleChange = dto.unitId !== undefined || dto.quantityRule !== undefined || dto.quantityDivisor !== undefined || dto.mealType !== undefined;
        if (ruleChange && c.status !== 'DRAFT') throw badRequest('camp.err.contract.24');

        const data: Prisma.CampContractItemUncheckedUpdateInput = {};
        if (ruleChange) {
          const ref = await this.resolveItemRefs(tx, tenantId, item.serviceTypeId, dto.unitId ?? item.unitId);
          const rule = dto.quantityRule !== undefined ? dto.quantityRule : (item.quantityRule as QuantityRule | null);
          const divisor = dto.quantityDivisor !== undefined ? dto.quantityDivisor : dec(item.quantityDivisor);
          const mealType = dto.mealType !== undefined ? dto.mealType : (item.mealType as ContractMealType | null);
          ContractsService.assertRule(ref.quantitySource, rule, divisor, mealType);
          await this.assertNoDuplicateItem(tx, tenantId, id, item.serviceTypeId, mealType, itemId);
          Object.assign(data, { unitId: ref.unitId, quantityRule: rule, quantityDivisor: divisor, mealType });
        }
        if (dto.description !== undefined) data.description = dto.description;
        const row = Object.keys(data).length > 0 ? await tx.campContractItem.update({ where: { id: itemId }, data, select: ITEM_SELECT }) : item;
        return toItemView(row, todayUb());
      }),
    );
  }

  async removeItem(tenantId: string, authId: string, campId: string, id: string, itemId: string): Promise<void> {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.guard(tx, tenantId, authId, campId);
        const c = await this.contractStatus(tx, tenantId, campId, id);
        if (c.status !== 'DRAFT') throw badRequest('camp.err.contract.24');
        await this.loadItem(tx, tenantId, id, itemId);
        await tx.campContractItem.delete({ where: { id: itemId } });
      }),
    );
  }

  // ── үнэ ──
  async addPrice(tenantId: string, authId: string, campId: string, id: string, itemId: string, dto: AddContractPriceDto): Promise<ContractPriceView> {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const userId = await this.guard(tx, tenantId, authId, campId);
        const c = await this.contractStatus(tx, tenantId, campId, id);
        if (c.status === 'TERMINATED') throw ContractsService.statusError(c.status, 'add-price');
        await this.loadItem(tx, tenantId, id, itemId);
        const period = { startDate: fromDbDate(c.startDate), endDate: d(c.endDate), terminatedAt: d(c.terminatedAt) };
        if (!withinPeriod(period, dto.effectiveFrom)) {
          throw badRequest('camp.err.contract.15', { date: dto.effectiveFrom, start: period.startDate, end: effectiveEnd(period) ?? '—' });
        }
        const dup = await tx.campContractItemPrice.findFirst({
          where: { tenantId, contractItemId: itemId, effectiveFrom: toDbDate(dto.effectiveFrom) },
          select: { id: true },
        });
        if (dup) throw conflict('camp.err.contract.16', { date: dto.effectiveFrom });

        let amendmentId: string | null = null;
        if (c.status === 'ACTIVE') {
          const a = await tx.campContractAmendment.create({
            data: {
              tenantId,
              campId,
              contractId: id,
              amendmentType: 'PRICE_CHANGE',
              effectiveDate: toDbDate(dto.effectiveFrom),
              documentNo: dto.documentNo ?? null,
              note: dto.note ?? null,
              createdBy: userId,
            },
            select: { id: true },
          });
          amendmentId = a.id;
        }
        const row = await tx.campContractItemPrice.create({
          data: {
            tenantId,
            contractItemId: itemId,
            effectiveFrom: toDbDate(dto.effectiveFrom),
            unitPrice: dto.unitPrice,
            vatIncluded: dto.vatIncluded,
            currency: c.currency,
            note: dto.note ?? null,
            createdBy: userId,
            amendmentId,
          },
          select: PRICE_SELECT,
        });
        return toPriceView(row);
      }),
    );
  }

  async removePrice(tenantId: string, authId: string, campId: string, id: string, itemId: string, priceId: string): Promise<void> {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.guard(tx, tenantId, authId, campId);
        const c = await this.contractStatus(tx, tenantId, campId, id);
        await this.loadItem(tx, tenantId, id, itemId);
        const price = await tx.campContractItemPrice.findFirst({ where: { id: priceId, tenantId, contractItemId: itemId }, select: { effectiveFrom: true } });
        const deletable = price !== null && (c.status === 'DRAFT' || (c.status === 'ACTIVE' && fromDbDate(price.effectiveFrom) > todayUb()));
        if (!deletable) throw badRequest('camp.err.contract.17');
        await tx.campContractItemPrice.delete({ where: { id: priceId } });
      }),
    );
  }

  // ── нэмэлт өөрчлөлт (сунгалт G-5) ──
  async addAmendment(tenantId: string, authId: string, campId: string, id: string, dto: AddAmendmentDto): Promise<ContractAmendmentView> {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const userId = await this.guard(tx, tenantId, authId, campId);
        const c = await this.contractStatus(tx, tenantId, campId, id);
        if (c.status !== 'ACTIVE') throw ContractsService.statusError(c.status, 'amend');
        let previousEndDate: Date | null = null;
        let newEndDate: Date | null = null;
        if (dto.amendmentType === 'EXTENSION') {
          const current = d(c.endDate);
          if (!dto.newEndDate || current === null || dto.newEndDate <= current) {
            throw badRequest('camp.err.contract.19', { current: current ?? '—' });
          }
          previousEndDate = c.endDate;
          newEndDate = toDbDate(dto.newEndDate);
          await tx.campContract.update({ where: { id }, data: { endDate: newEndDate } });
        }
        const a = await tx.campContractAmendment.create({
          data: {
            tenantId,
            campId,
            contractId: id,
            amendmentType: dto.amendmentType,
            effectiveDate: toDbDate(dto.effectiveDate),
            previousEndDate,
            newEndDate,
            documentNo: dto.documentNo ?? null,
            note: dto.note ?? null,
            createdBy: userId,
          },
          select: { id: true },
        });
        const view = await this.view(tx, tenantId, campId, id);
        return view.amendments.find((x) => x.id === a.id)!;
      }),
    );
  }
}
