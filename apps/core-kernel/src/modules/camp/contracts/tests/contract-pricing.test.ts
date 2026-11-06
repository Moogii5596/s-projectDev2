import { describe, expect, it } from 'vitest';
import {
  billableOn,
  convertAmounts,
  effectiveEnd,
  invertRate,
  lineAmounts,
  mealQuantity,
  monthStart,
  paymentRate,
  paymentTermsError,
  priceAt,
  quantityRuleError,
  ratePolicyError,
  withinPeriod,
} from '../contract-pricing';

const P = (effectiveFrom: string, unitPrice: string) => ({ effectiveFrom, unitPrice, vatIncluded: true, currency: 'CNY' });

describe('contract-pricing — хугацаа', () => {
  it('effectiveEnd = min(endDate, terminatedAt)', () => {
    expect(effectiveEnd({ endDate: '2026-12-31', terminatedAt: null })).toBe('2026-12-31');
    expect(effectiveEnd({ endDate: '2026-12-31', terminatedAt: '2026-06-30' })).toBe('2026-06-30');
    expect(effectiveEnd({ endDate: null, terminatedAt: '2026-06-30' })).toBe('2026-06-30');
    expect(effectiveEnd({ endDate: null, terminatedAt: null })).toBeNull();
  });

  it('withinPeriod — эхлэл ба төгсгөл багтана, хугацаагүй', () => {
    const c = { startDate: '2026-01-01', endDate: '2026-12-31', terminatedAt: null };
    expect(withinPeriod(c, '2025-12-31')).toBe(false);
    expect(withinPeriod(c, '2026-01-01')).toBe(true);
    expect(withinPeriod(c, '2026-12-31')).toBe(true);
    expect(withinPeriod(c, '2027-01-01')).toBe(false);
    expect(withinPeriod({ ...c, endDate: null }, '2099-01-01')).toBe(true);
  });

  it('billableOn — DRAFT үгүй; TERMINATED цуцлах өдөр хүртэл', () => {
    const base = { startDate: '2026-01-01', endDate: '2026-12-31', terminatedAt: null };
    expect(billableOn({ ...base, status: 'DRAFT' }, '2026-03-01')).toBe(false);
    expect(billableOn({ ...base, status: 'ACTIVE' }, '2026-03-01')).toBe(true);
    const t = { ...base, status: 'TERMINATED' as const, terminatedAt: '2026-03-15' };
    expect(billableOn(t, '2026-03-15')).toBe(true);
    expect(billableOn(t, '2026-03-16')).toBe(false);
  });
});

describe('contract-pricing — үнэ', () => {
  const prices = [P('2026-07-01', '90'), P('2026-01-01', '85.5'), P('2026-04-01', '88')];

  it('priceAt — effectiveFrom ≤ D-ийн хамгийн сүүлийнх (эрэмбээс үл хамаарна)', () => {
    expect(priceAt(prices, '2025-12-31')).toBeNull();
    expect(priceAt(prices, '2026-01-01')?.unitPrice).toBe('85.5');
    expect(priceAt(prices, '2026-03-31')?.unitPrice).toBe('85.5');
    expect(priceAt(prices, '2026-04-01')?.unitPrice).toBe('88');
    expect(priceAt(prices, '2027-01-01')?.unitPrice).toBe('90');
  });

  it('НӨАТ багтсан — net + vat = gross', () => {
    const a = lineAmounts({ quantity: '100', unitPrice: '85.5', vatIncluded: true, vatRate: '10' });
    expect(a.gross.toFixed(2)).toBe('8550.00');
    expect(a.net.toFixed(2)).toBe('7772.73');
    expect(a.net.add(a.vat).eq(a.gross)).toBe(true);
  });

  it('НӨАТ ороогүй / 0%', () => {
    const a = lineAmounts({ quantity: '3', unitPrice: '1000', vatIncluded: false, vatRate: '10' });
    expect([a.net.toFixed(2), a.vat.toFixed(2), a.gross.toFixed(2)]).toEqual(['3000.00', '300.00', '3300.00']);
    const z = lineAmounts({ quantity: '3', unitPrice: '1000', vatIncluded: true, vatRate: '0' });
    expect(z.vat.toFixed(2)).toBe('0.00');
  });
});

describe('contract-pricing — ханш', () => {
  it('paymentRate — NONE=1, FIXED, MONTHLY_MANUAL, дутуу → null', () => {
    expect(paymentRate({ policy: 'NONE', fixedRate: null, monthlyRate: null })?.toString()).toBe('1');
    expect(paymentRate({ policy: 'FIXED', fixedRate: '480.5', monthlyRate: null })?.toString()).toBe('480.5');
    expect(paymentRate({ policy: 'MONTHLY_MANUAL', fixedRate: null, monthlyRate: '475.25' })?.toString()).toBe('475.25');
    expect(paymentRate({ policy: 'MONTHLY_MANUAL', fixedRate: null, monthlyRate: null })).toBeNull();
    expect(paymentRate({ policy: 'FIXED', fixedRate: '0', monthlyRate: null })).toBeNull();
  });

  it('convertAmounts — тус бүр 2 орон, gross = net + vat', () => {
    const a = lineAmounts({ quantity: '1', unitPrice: '85.5', vatIncluded: true, vatRate: '10' });
    const m = convertAmounts(a, paymentRate({ policy: 'FIXED', fixedRate: '480.37', monthlyRate: null })!);
    expect(m.net.add(m.vat).eq(m.gross)).toBe(true);
    expect(m.gross.toFixed(2)).toBe('41071.63'); // 37339.16 + 3732.47 (net, vat тус бүр тоймлосон)
  });

  it('invertRate, monthStart', () => {
    expect(invertRate('0.002').toString()).toBe('500');
    expect(monthStart('2026-11-07')).toBe('2026-11-01');
  });

  it('ratePolicyError — валют ба бодлогын нийцэл', () => {
    expect(ratePolicyError('MNT', 'MNT', 'NONE', null)).toBeNull();
    expect(ratePolicyError('MNT', 'MNT', 'FIXED', '1')).toBe('same_currency');
    expect(ratePolicyError('CNY', 'MNT', 'NONE', null)).toBe('policy_required');
    expect(ratePolicyError('CNY', 'MNT', 'FIXED', null)).toBe('fixed_rate');
    expect(ratePolicyError('CNY', 'MNT', 'MONTHLY_MANUAL', '480')).toBe('fixed_rate_unused');
    expect(ratePolicyError('CNY', 'MNT', 'MONTHLY_MANUAL', null)).toBeNull();
  });
});

describe('contract-pricing — хоолны тоо (G-3)', () => {
  const totals = { BREAKFAST: 100, LUNCH: 110, DINNER: 90 };

  it('TOTAL_DIV_N — нийт ÷ N (хүн-өдөр)', () => {
    expect(mealQuantity('TOTAL_DIV_N', '3', null, totals).toString()).toBe('100');
    expect(mealQuantity('TOTAL_DIV_N', '3', null, { LUNCH: 10 }).toFixed(4)).toBe('3.3333');
  });

  it('MEAL_TYPE — зөвхөн нэг төрөл', () => {
    expect(mealQuantity('MEAL_TYPE', null, 'LUNCH', totals).toString()).toBe('110');
    expect(mealQuantity('MEAL_TYPE', null, 'NIGHT', totals).toString()).toBe('0');
  });

  it('quantityRuleError', () => {
    expect(quantityRuleError('MEAL_ORDER', 'TOTAL_DIV_N', '3', null)).toBeNull();
    expect(quantityRuleError('MEAL_ORDER', 'TOTAL_DIV_N', null, null)).toBe('divisor');
    expect(quantityRuleError('MEAL_ORDER', 'MEAL_TYPE', null, 'LUNCH')).toBeNull();
    expect(quantityRuleError('MEAL_ORDER', 'MEAL_TYPE', '3', 'LUNCH')).toBe('meal_type');
    expect(quantityRuleError('MEAL_ORDER', null, null, null)).toBe('rule_required');
    expect(quantityRuleError('HAUL', null, null, null)).toBeNull();
    expect(quantityRuleError('MANUAL', 'TOTAL_DIV_N', '3', null)).toBe('not_meal');
  });
});

describe('contract-pricing — төлбөрийн хуваарь', () => {
  it('95% + 5% барьцаа = зөв; хоосон = зөв', () => {
    expect(
      paymentTermsError([
        { percent: 95, rule: 'AFTER_INVOICE_WORKDAYS', n: 10, note: null },
        { percent: 5, rule: 'AFTER_MONTHS', n: 3, note: 'барьцаа' },
      ]),
    ).toBeNull();
    expect(paymentTermsError([])).toBeNull();
  });

  it('нийлбэр ≠ 100, буруу дүрэм / n / хувь', () => {
    expect(paymentTermsError([{ percent: 90, rule: 'AFTER_INVOICE_DAYS', n: 10, note: null }])).toBe('sum');
    expect(paymentTermsError([{ percent: 100, rule: 'X' as never, n: 1, note: null }])).toBe('rule');
    expect(paymentTermsError([{ percent: 100, rule: 'AFTER_MONTHS', n: 1.5, note: null }])).toBe('n');
    expect(paymentTermsError([{ percent: 0, rule: 'AFTER_MONTHS', n: 1, note: null }, { percent: 100, rule: 'AFTER_MONTHS', n: 1, note: null }])).toBe('percent');
    expect(paymentTermsError([{ percent: 33.3, rule: 'AFTER_MONTHS', n: 1, note: null }, { percent: 33.3, rule: 'AFTER_MONTHS', n: 2, note: null }, { percent: 33.4, rule: 'AFTER_MONTHS', n: 3, note: null }])).toBeNull();
  });
});
