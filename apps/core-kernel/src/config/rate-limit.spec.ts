import { describe, it, expect } from 'vitest';
import { parseRateLimitConfig, RATE_LIMIT_DEFAULTS } from './rate-limit';

// Phase 3.1 (шийдвэр B): RATE_LIMIT_SHORT/MEDIUM/LONG
describe('parseRateLimitConfig()', () => {
  it('тохируулаагүй → B default 100 / 500 / 2000', () => {
    expect(parseRateLimitConfig({})).toEqual([
      { name: 'short', ttlMs: 1_000, limit: 100 },
      { name: 'medium', ttlMs: 10_000, limit: 500 },
      { name: 'long', ttlMs: 60_000, limit: 2000 },
    ]);
    expect(RATE_LIMIT_DEFAULTS).toEqual({ short: 100, medium: 500, long: 2000 });
  });

  it('env утга → тухайн цонхны limit', () => {
    const w = parseRateLimitConfig({ RATE_LIMIT_SHORT: '1000000', RATE_LIMIT_MEDIUM: ' 7 ', RATE_LIMIT_LONG: '' });
    expect(w.map((x) => x.limit)).toEqual([1000000, 7, 2000]);
  });

  it.each(['0', '-1', 'abc', '1.5', '10req', '99999999999999999999'])('буруу утга "%s" → алдаа', (v) => {
    expect(() => parseRateLimitConfig({ RATE_LIMIT_SHORT: v })).toThrow(/RATE_LIMIT_SHORT/);
  });

  it('алдааны мессеж аль key буруу байгааг заана', () => {
    expect(() => parseRateLimitConfig({ RATE_LIMIT_LONG: 'x' })).toThrow(/RATE_LIMIT_LONG/);
  });
});
