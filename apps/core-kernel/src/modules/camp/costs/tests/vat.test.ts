import { describe, it, expect } from 'vitest';
import { computeVat, sumVat, vatView } from '../vat';

describe('VatCalculator (Шат 4.2)', () => {
  const v = (quantity: number | string, unitPrice: number | string, vatIncluded: boolean, vatRate: number | string = 10) => vatView(computeVat({ quantity, unitPrice, vatIncluded, vatRate }));

  it.each([
    // [тоо, үнэ, НӨАТ-тай, хувь] → [net, vat, gross]
    [2, 55000, true, 10, '100000.00', '10000.00', '110000.00'],
    [2, 50000, false, 10, '100000.00', '10000.00', '110000.00'],
    [1, 100, true, 10, '90.91', '9.09', '100.00'],          // 100 / 1.1 = 90.909… → 90.91
    [3, 33.33, false, 10, '99.99', '10.00', '109.99'],       // 9.999 → 10.00
    [1.5, 1000.005, false, 10, '1500.01', '150.00', '1650.01'], // 1500.0075 → 1500.01 (ROUND_HALF_UP)
    [100.3333, 30000, false, 10, '3009999.00', '300999.90', '3310998.90'], // хүн-өдөр
    [1, 0, true, 10, '0.00', '0.00', '0.00'],
    [7, 12345.67, true, 0, '86419.69', '0.00', '86419.69'],  // НӨАТ 0%
    [1, 1, true, 12.5, '0.89', '0.11', '1.00'],
  ])('%s × %s (НӨАТ-тай=%s, %s%%) → %s + %s = %s', (q, p, inc, r, net, vat, gross) => {
    expect(v(q, p, inc, r)).toEqual({ net, vat, gross });
  });

  it('net + vat = gross үргэлж (санамсаргүй 2000 тохиолдол)', () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2000; i++) {
      const r = computeVat({ quantity: (rnd() * 100).toFixed(3), unitPrice: (rnd() * 1e6).toFixed(2), vatIncluded: rnd() > 0.5, vatRate: (rnd() * 30).toFixed(2) });
      expect(r.net.add(r.vat).equals(r.gross)).toBe(true);
      expect(r.vat.isNegative()).toBe(false);
    }
  });

  it('сөрөг / хувь ≥ 100 → RangeError; sumVat нь тоймлосон мөрүүдийн нийлбэр', () => {
    expect(() => computeVat({ quantity: -1, unitPrice: 1, vatIncluded: true, vatRate: 10 })).toThrow(RangeError);
    expect(() => computeVat({ quantity: 1, unitPrice: 1, vatIncluded: true, vatRate: 100 })).toThrow(RangeError);
    const s = sumVat([computeVat({ quantity: 1, unitPrice: 100, vatIncluded: true, vatRate: 10 }), computeVat({ quantity: 1, unitPrice: 100, vatIncluded: true, vatRate: 10 })]);
    expect(vatView(s)).toEqual({ net: '181.82', vat: '18.18', gross: '200.00' });
  });
});
