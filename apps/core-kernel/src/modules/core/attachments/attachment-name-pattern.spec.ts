import { describe, expect, it } from 'vitest';
import { compileNamePattern, DEFAULT_NAME_PATTERN, parseFileName } from './attachment-name-pattern';

const compile = (p: string) => {
  const r = compileNamePattern(p);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe('compileNamePattern', () => {
  it.each([
    ['', 'empty'],
    ['{type}_{date}', 'object_required'],
    ['{object}{type}', 'separator_required'],
    ['{object}_{object}', 'duplicate_token'],
    ['{object}_{name}', 'unknown_token'],
    ['{object}abc{type}', 'invalid_separator'],
    ['x'.repeat(101), 'too_long'],
  ])('%s → %s', (p, error) => {
    expect(compileNamePattern(p)).toEqual({ ok: false, error });
  });

  it('accepts default and custom separators', () => {
    expect(compileNamePattern(DEFAULT_NAME_PATTERN).ok).toBe(true);
    expect(compileNamePattern('{date} - {object} ({type})').ok).toBe(true);
  });
});

describe('parseFileName', () => {
  it('parses object codes that contain separators', () => {
    expect(parseFileName(compile(DEFAULT_NAME_PATTERN), 'ZAS-CMP1-2026-0001_photo_20261105.jpg')).toEqual({
      object: 'ZAS-CMP1-2026-0001',
      type: 'PHOTO',
      date: '2026-11-05',
    });
  });

  it('accepts dashed and dotted dates, case-insensitive', () => {
    const c = compile('{date}_{object}');
    expect(parseFileName(c, '2026-11-05_e001.PDF')).toEqual({ object: 'E001', type: null, date: '2026-11-05' });
    expect(parseFileName(c, '2026.11.05_E001.pdf')?.date).toBe('2026-11-05');
  });

  it('rejects impossible dates and non-matching names', () => {
    const c = compile(DEFAULT_NAME_PATTERN);
    expect(parseFileName(c, 'E001_ACT_20260230.pdf')).toBeNull();
    expect(parseFileName(c, 'random.pdf')).toBeNull();
    expect(parseFileName(c, '_ACT_20261105.pdf')).toBeNull();
  });

  it('object-only pattern takes the whole base name', () => {
    expect(parseFileName(compile('{object}'), 'ab 12.png')).toEqual({ object: 'AB 12', type: null, date: null });
  });
});
