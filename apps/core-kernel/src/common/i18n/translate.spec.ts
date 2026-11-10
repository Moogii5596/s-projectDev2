import { describe, expect, it } from 'vitest';
import { i18nStorage } from './i18n-context';
import { formatMessage } from './translate';
import termsMn from '@s-project/i18n/terms.mn.json';
import termsEn from '@s-project/i18n/terms.en.json';
import termsZh from '@s-project/i18n/terms.zh.json';

describe('backend term interpolation', () => {
  const terms = { mn: termsMn, en: termsEn, zh: termsZh };

  it('resolves default terms and tenant term overrides alongside variables', () => {
    expect(formatMessage('Welcome to $t(term.camp.gen), {name}', { name: 'Naraa' }, 'mn')).toBe('Welcome to Кемпийн, Naraa');

    const result = i18nStorage.run(
      { lang: 'en', overrides: new Map([['en:term.camp.gen', 'Worksite']]) },
      () => formatMessage('Welcome to $t(term.camp.gen), {name}', { name: 'Naraa' }, 'en'),
    );
    expect(result).toBe('Welcome to Worksite, Naraa');
  });

  it('resolves every glossary form in all locales and gives tenant overrides precedence', () => {
    for (const lang of ['mn', 'en', 'zh'] as const) {
      for (const [key, value] of Object.entries(terms[lang])) {
        const override = `custom:${key}`;
        expect(formatMessage(`$t(${key})`, {}, lang), `${lang}:${key}`).toBe(value);
        const rendered = i18nStorage.run(
          { lang, overrides: new Map([[`${lang}:${key}`, override]]) },
          () => formatMessage(`$t(${key})`, {}, lang),
        );
        expect(rendered, `${lang}:${key} override`).toBe(override);
      }
    }
  });
});
