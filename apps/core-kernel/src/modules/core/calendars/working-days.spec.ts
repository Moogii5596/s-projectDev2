import { describe, expect, it } from 'vitest';
import { workingDaysBetween } from './working-days';

describe('workingDaysBetween', () => {
  it('counts weekdays in the half-open date interval and excludes exact and annual holidays', () => {
    expect(workingDaysBetween('2026-11-02', '2026-11-09', new Set(['2026-11-03', '--11-05']))).toBe(3);
  });

  it('counts no days for an empty interval and rejects invalid/reversed dates', () => {
    expect(workingDaysBetween('2026-11-02', '2026-11-02')).toBe(0);
    expect(() => workingDaysBetween('2026-02-30', '2026-03-01')).toThrow(RangeError);
    expect(() => workingDaysBetween('2026-11-09', '2026-11-02')).toThrow(RangeError);
  });
});
