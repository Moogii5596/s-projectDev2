import { describe, expect, it } from 'vitest';
import { i18nStorage, parseAcceptLanguage } from '../i18n-context';
import { MESSAGES } from '../messages';
import { formatMessage, t, templateVars } from '../translate';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AppError, badRequest, conflict, forbidden, notFound } from '../app-error';

describe('parseAcceptLanguage', () => {
  it.each([
    ['zh-CN,zh;q=0.9,en;q=0.8', 'zh'],
    ['en-US', 'en'],
    ['fr,en;q=0.5', 'en'],
    ['de', 'mn'],
    [undefined, 'mn'],
    ['mn;q=0.2,en;q=0.9', 'en'],
  ])('%s → %s', (h, lang) => expect(parseAcceptLanguage(h)).toBe(lang));
});

describe('каталог', () => {
  it('код бүр 3 хэлтэй, хоосон биш, хувьсагч 3 хэлэнд ижил', () => {
    for (const [code, m] of Object.entries(MESSAGES)) {
      for (const l of ['mn', 'en', 'zh'] as const) expect(m[l].trim(), `${code}.${l}`).not.toBe('');
      expect(templateVars(m.en), `${code} en`).toEqual(templateVars(m.mn));
      expect(templateVars(m.zh), `${code} zh`).toEqual(templateVars(m.mn));
    }
  });
});

describe('t / formatMessage / AppError', () => {
  it('хэл, параметр, байгууллагын засвар, үл мэдэгдэх код', () => {
    expect(formatMessage('{a}-{b}', { a: 1 })).toBe('1-{b}');
    expect(t('import.too_many_rows', { max: 5 }, 'en')).toBe('Too many rows (> 5)');
    expect(t('no.such.key')).toBe('no.such.key');
    i18nStorage.run({ lang: 'zh', overrides: new Map([['zh:import.empty', '空的！']]) }, () => {
      expect(t('import.empty')).toBe('空的！');
      expect(t('import.empty', {}, 'en')).toBe('There are no data rows');
      const e = new AppError(409, 'import.has_errors', { n: 2 }, { rows: [] });
      expect(e.getStatus()).toBe(409);
      expect(e.getResponse()).toEqual({ statusCode: 409, code: 'import.has_errors', params: { n: 2 }, message: '2 行有错误 — 请修正后重新导入', rows: [] });
    });
  });
});

describe('AppError helper-ууд (v0.2.0 — Кемпийн алдаа кодтой)', () => {
  it('Nest-ийн дэд класс буцаана (instanceof хэвээр) + code/params/message хүсэлтийн хэлээр', () => {
    const e = badRequest('camp.err.employees.7', { code: 'E1', fullName: 'Бат' });
    expect(e).toBeInstanceOf(BadRequestException);
    expect(e.getResponse()).toMatchObject({ statusCode: 400, code: 'camp.err.employees.7', error: 'Bad Request' });
    expect(e.message).toBe('Ажилтны код "E1" (Бат) аль хэдийн бүртгэгдсэн');
    expect(conflict('camp.err.attendance.8', { n: 3 }, { errors: ['x'] })).toBeInstanceOf(ConflictException);
    expect(conflict('camp.err.attendance.8', { n: 3 }, { errors: ['x'] }).getResponse()).toMatchObject({ errors: ['x'] });
    expect(notFound('camp.err.lookup.1')).toBeInstanceOf(NotFoundException);
    expect(forbidden('camp.err.access.4').getStatus()).toBe(403);
    i18nStorage.run({ lang: 'en', overrides: new Map() }, () => {
      expect(notFound('camp.err.lookup.1').message).toBe('Camp not found');
      expect(t('camp.row.employee_not_found', { code: 'E9' })).toBe('Employee not found: E9');
      expect(t('enum.weekday.3')).toBe('Wednesday');
    });
  });

  it('кемпийн кодонд ашигласан camp.* / enum.* түлхүүр бүр каталогт байна', () => {
    const root = join(__dirname, '../../../modules/camp');
    const files = (readdirSync(root, { recursive: true }) as string[]).filter((f) => f.endsWith('.ts') && !f.includes('tests'));
    const used = new Set<string>();
    for (const f of files) {
      for (const m of readFileSync(join(root, f), 'utf8').matchAll(/['`]((?:camp\.(?:err|row|warn)|enum\.(?:weekday|maintenance_status))\.[\w.]+?)['`$]/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(100);
    const missing = [...used].filter((k) => !(k in MESSAGES) && !k.endsWith('.'));
    expect(missing).toEqual([]);
  });
});
