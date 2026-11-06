import { Prisma } from '@prisma/client';
import { computeVat, round2, type VatAmounts } from '../costs/vat';
import type { ContractMealType, ContractStatus, PaymentTerm, QuantityRule, RatePolicy } from './contract.types';
import { PAYMENT_TERM_RULES } from './contract.types';

const Decimal = Prisma.Decimal;
type Dec = Prisma.Decimal;

/**
 * v0.2.3 Блок 6б — гэрээний үнийн ЦЭВЭР логик (DB-гүй, unit тест). G-1: бүх утга гэрээний өгөгдлөөс.
 * Огноо — 'YYYY-MM-DD' мөр (лексик харьцуулалт = хугацааны харьцуулалт).
 */

export interface PeriodInput {
  status: ContractStatus;
  startDate: string;
  endDate: string | null;
  terminatedAt: string | null;
}

/** Гэрээний хүчинтэй сүүлийн өдөр: min(endDate, terminatedAt); NULL = хугацаагүй */
export function effectiveEnd(c: Pick<PeriodInput, 'endDate' | 'terminatedAt'>): string | null {
  if (c.terminatedAt && (!c.endDate || c.terminatedAt < c.endDate)) return c.terminatedAt;
  return c.endDate;
}

/** Огноо гэрээний хугацаанд (статусаас үл хамаарах) */
export function withinPeriod(c: Pick<PeriodInput, 'startDate' | 'endDate' | 'terminatedAt'>, date: string): boolean {
  const end = effectiveEnd(c);
  return c.startDate <= date && (end === null || date <= end);
}

/** Тооцоонд орох эсэх: ACTIVE эсвэл TERMINATED (цуцлахаас өмнөх өдрүүд), хугацаандаа. DRAFT — үгүй */
export function billableOn(c: PeriodInput, date: string): boolean {
  return c.status !== 'DRAFT' && withinPeriod(c, date);
}

export interface PriceRow {
  effectiveFrom: string;
  unitPrice: Dec | string | number;
  vatIncluded: boolean;
  currency: string;
}

/** Тухайн өдрийн үнэ = effectiveFrom ≤ date-ийн хамгийн сүүлийнх; байхгүй бол null */
export function priceAt<T extends PriceRow>(prices: readonly T[], date: string): T | null {
  let best: T | null = null;
  for (const p of prices) {
    if (p.effectiveFrom <= date && (best === null || p.effectiveFrom > best.effectiveFrom)) best = p;
  }
  return best;
}

/** MONTHLY_MANUAL ханшийн огноо = тухайн сарын 1 */
export const monthStart = (date: string): string => `${date.slice(0, 7)}-01`;

export interface RateInput {
  policy: RatePolicy;
  fixedRate: Dec | string | number | null;
  /** MONTHLY_MANUAL — тухайн сарын ханш (байхгүй бол null) */
  monthlyRate: Dec | string | number | null;
}

/** 1 гэрээний валют = ? төлбөрийн валют. Ханш дутуу бол null (дуудагч алдаа өгнө) */
export function paymentRate(r: RateInput): Dec | null {
  if (r.policy === 'NONE') return new Decimal(1);
  const v = r.policy === 'FIXED' ? r.fixedRate : r.monthlyRate;
  if (v === null || v === undefined) return null;
  const d = new Decimal(v);
  return d.gt(0) ? d : null;
}

/** Урвуу хос (MNT→CNY байхад CNY→MNT хэрэгтэй) — 1 / rate, 6 оронтой */
export const invertRate = (rate: Dec | string | number): Dec => new Decimal(1).div(new Decimal(rate)).toDecimalPlaces(6, Decimal.ROUND_HALF_UP);

export type Amounts = VatAmounts;

/** Гэрээний валютаар (НӨАТ — costs/vat.ts-ийн ижил дүрэм) */
export function lineAmounts(input: { quantity: Dec | string | number; unitPrice: Dec | string | number; vatIncluded: boolean; vatRate: Dec | string | number }): Amounts {
  return computeVat(input);
}

/** Төлбөрийн валют руу: net, vat-ийг тус бүр 2 орон, gross = net + vat (DB CHECK-тэй ижил тэнцэл) */
export function convertAmounts(a: Amounts, rate: Dec): Amounts {
  const net = round2(a.net.mul(rate));
  const vat = round2(a.vat.mul(rate));
  return { net, vat, gross: net.add(vat) };
}

export type MealTotals = Partial<Record<ContractMealType, number>>;

/**
 * G-3 — хоолны захиалгаас нэхэмжлэх тоо:
 *   TOTAL_DIV_N → (бүх хоол) ÷ divisor (жнь 3 → хүн-өдөр), 4 орон
 *   MEAL_TYPE   → зөвхөн тухайн хоолны төрөл
 */
export function mealQuantity(rule: QuantityRule, divisor: Dec | string | number | null, mealType: ContractMealType | null, totals: MealTotals): Dec {
  if (rule === 'MEAL_TYPE') return new Decimal(mealType ? (totals[mealType] ?? 0) : 0);
  const all = Object.values(totals).reduce<number>((s, n) => s + (n ?? 0), 0);
  const d = new Decimal(divisor ?? 1);
  if (d.lte(0)) return new Decimal(0);
  return new Decimal(all).div(d).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

/** Төлбөрийн хуваарийн алдаа (null = зөв). Хоосон хуваарь зөвшөөрнө (гэрээнд заагаагүй) */
export function paymentTermsError(terms: readonly PaymentTerm[]): string | null {
  if (terms.length === 0) return null;
  if (terms.length > 12) return 'too_many';
  let sum = new Decimal(0);
  for (const t of terms) {
    if (!(PAYMENT_TERM_RULES as readonly string[]).includes(t.rule)) return 'rule';
    if (!Number.isInteger(t.n) || t.n < 0 || t.n > 3650) return 'n';
    if (!(t.percent > 0) || t.percent > 100) return 'percent';
    sum = sum.add(new Decimal(t.percent));
  }
  return sum.eq(100) ? null : 'sum';
}

/** Валют ба ханшийн бодлогын нийцэл: ижил валют ⇔ NONE; FIXED ⇔ fixedRate */
export function ratePolicyError(currency: string, paymentCurrency: string, policy: RatePolicy, fixedRate: Dec | string | number | null): string | null {
  if ((currency === paymentCurrency) !== (policy === 'NONE')) return currency === paymentCurrency ? 'same_currency' : 'policy_required';
  if (policy === 'FIXED' && (fixedRate === null || !new Decimal(fixedRate).gt(0))) return 'fixed_rate';
  if (policy !== 'FIXED' && fixedRate !== null) return 'fixed_rate_unused';
  return null;
}

/** Хоолны дүрмийн нийцэл (зөвхөн MEAL_ORDER эх сурвалжтай ажилд дүрэм заавал) */
export function quantityRuleError(
  quantitySource: string,
  rule: QuantityRule | null,
  divisor: Dec | string | number | null,
  mealType: ContractMealType | null,
): string | null {
  if (quantitySource !== 'MEAL_ORDER') return rule === null && divisor === null && mealType === null ? null : 'not_meal';
  if (rule === 'TOTAL_DIV_N') return divisor !== null && new Decimal(divisor).gt(0) && mealType === null ? null : 'divisor';
  if (rule === 'MEAL_TYPE') return mealType !== null && divisor === null ? null : 'meal_type';
  return 'rule_required';
}
