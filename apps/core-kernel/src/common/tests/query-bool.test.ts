import { describe, it, expect } from 'vitest';
import { queryBool } from '../utils/query-bool';

/** [VALID-001] enableImplicitConversion нь 'false'-ийг @Transform-оос өмнө true болгодог → анхны утгаас уншина */
describe('queryBool', () => {
  it("implicit conversion-д 'false' → value=true ирсэн ч анхны 'false'-аас false", () => {
    expect(queryBool({ obj: { activeOnly: 'false' }, key: 'activeOnly', value: true })).toBe(false);
    expect(queryBool({ obj: { activeOnly: 'true' }, key: 'activeOnly', value: true })).toBe(true);
  });
  it('boolean JSON утга, бусад утга өөрчлөгдөхгүй (@IsBoolean 400 өгнө)', () => {
    expect(queryBool({ obj: { a: false }, key: 'a', value: false })).toBe(false);
    expect(queryBool({ obj: { a: true }, key: 'a', value: true })).toBe(true);
    expect(queryBool({ obj: { a: 'yes' }, key: 'a', value: true })).toBe('yes');
  });
});
