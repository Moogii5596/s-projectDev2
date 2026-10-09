import { Prisma } from '@prisma/client';

const Decimal = Prisma.Decimal;
type Dec = Prisma.Decimal;
type Num = Dec | string | number;

/** 2 оронтой, ROUND_HALF_UP (мөнгөн дүн) */
export const round2 = (d: Dec): Dec => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export interface VatAmounts {
  net: Dec;
  vat: Dec;
  gross: Dec;
}

/**
 * НӨАТ тооцоолол (Шат 4.2 — Шат 5-6 дахин ашиглана). Бүх дүн 2 оронтой, net + vat = gross ҮРГЭЛЖ (DB CHECK).
 *   vatIncluded = true  → gross = тоо × үнэ;  net = gross ÷ (1 + r/100);  vat = gross − net
 *   vatIncluded = false → net = тоо × үнэ;    vat = net × r/100;           gross = net + vat
 */
export function computeVat(input: { quantity: Num; unitPrice: Num; vatIncluded: boolean; vatRate: Num }): VatAmounts {
  const qty = new Decimal(input.quantity);
  const price = new Decimal(input.unitPrice);
  const rate = new Decimal(input.vatRate);
  if (qty.isNegative() || price.isNegative() || rate.isNegative() || rate.greaterThanOrEqualTo(100)) {
    throw new RangeError('computeVat: тоо, үнэ ≥ 0, 0 ≤ НӨАТ < 100');
  }
  const amount = round2(qty.mul(price));
  if (input.vatIncluded) {
    const net = round2(amount.div(rate.div(100).add(1)));
    return { net, vat: amount.sub(net), gross: amount };
  }
  const vat = round2(amount.mul(rate).div(100));
  return { net: amount, vat, gross: amount.add(vat) };
}

/** Олон мөрийн нийлбэр (мөр бүрийг тоймлосны дараа нэмнэ — тайлантай таарна) */
export function sumVat(rows: VatAmounts[]): VatAmounts {
  return rows.reduce((acc, r) => ({ net: acc.net.add(r.net), vat: acc.vat.add(r.vat), gross: acc.gross.add(r.gross) }), {
    net: new Decimal(0),
    vat: new Decimal(0),
    gross: new Decimal(0),
  });
}

export const vatView = (v: VatAmounts) => ({ net: v.net.toFixed(2), vat: v.vat.toFixed(2), gross: v.gross.toFixed(2) });
