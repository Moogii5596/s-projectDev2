import webMn from '@s-project/i18n/web.mn.json';
import webEn from '@s-project/i18n/web.en.json';
import webZh from '@s-project/i18n/web.zh.json';
import termsMn from '@s-project/i18n/terms.mn.json';
import termsEn from '@s-project/i18n/terms.en.json';
import termsZh from '@s-project/i18n/terms.zh.json';
import { Lang, LANGS } from './i18n-context';
import { MESSAGES } from './messages';
import { templateVars } from './translate';

/**
 * Бүх орчуулгын түлхүүр: frontend (packages/i18n) + backend (messages.ts).
 * Байгууллагын засвар (i18n_overrides) зөвхөн эдгээр түлхүүрт; хувьсагч нь анхдагч mn-тэй яг ижил байна.
 */
type CatalogSection = 'web' | 'server' | 'term';
export interface CatalogEntry {
  key: string;
  section: CatalogSection;
  defaults: Record<Lang, string>;
  vars: string[];
}

const WEB: Record<Lang, Record<string, string>> = { mn: webMn, en: webEn, zh: webZh };
const TERMS: Record<Lang, Record<string, string>> = { mn: termsMn, en: termsEn, zh: termsZh };

function resolveDefaultTerms(template: string, lang: Lang): string {
  return template.replace(/\$t\((term\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+)\)/g, (match, key: string) => TERMS[lang][key] ?? match);
}

function build(): Map<string, CatalogEntry> {
  const map = new Map<string, CatalogEntry>();
  const termKeys = Object.keys(TERMS.mn).sort();
  for (const lang of LANGS) {
    const keys = Object.keys(TERMS[lang]).sort();
    if (keys.join(',') !== termKeys.join(',')) throw new Error(`i18n: term түлхүүрийн хэл хоорондын зөрүү (${lang})`);
    for (const key of keys) {
      if (!TERMS[lang][key].trim()) throw new Error(`i18n: term текст хоосон (${lang}:${key})`);
    }
  }
  const validateTermReferences = (text: string, key: string, lang: Lang) => {
    for (const [, termKey] of text.matchAll(/\$t\((term\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+)\)/g)) {
      if (!(termKey in TERMS[lang])) throw new Error(`i18n: term холбоос олдсонгүй (${lang}:${key} → ${termKey})`);
    }
  };
  for (const key of Object.keys(WEB.mn).sort()) {
    for (const lang of LANGS) validateTermReferences(WEB[lang][key] ?? '', key, lang);
    const defaults = Object.fromEntries(LANGS.map((l) => [l, resolveDefaultTerms(WEB[l][key] ?? '', l)])) as Record<Lang, string>;
    map.set(key, { key, section: 'web', defaults, vars: templateVars(defaults.mn) });
  }
  for (const [key, m] of Object.entries(MESSAGES).sort(([a], [b]) => a.localeCompare(b))) {
    if (map.has(key)) throw new Error(`i18n: түлхүүр давхардсан (web ба server): ${key}`);
    for (const lang of LANGS) validateTermReferences(m[lang], key, lang);
    const defaults = Object.fromEntries(LANGS.map((lang) => [lang, resolveDefaultTerms(m[lang], lang)])) as Record<Lang, string>;
    map.set(key, { key, section: 'server', defaults, vars: templateVars(defaults.mn) });
  }
  for (const key of termKeys) {
    if (map.has(key)) throw new Error(`i18n: term түлхүүр давхардсан: ${key}`);
    const defaults = Object.fromEntries(LANGS.map((l) => [l, TERMS[l][key] ?? ''])) as Record<Lang, string>;
    map.set(key, { key, section: 'term', defaults, vars: [] });
  }
  return map;
}

let cached: Map<string, CatalogEntry> | null = null;
export function catalog(): Map<string, CatalogEntry> {
  return (cached ??= build());
}

/** Frontend-ийн хэлний анхдагч (тест/шалгалтад) */
const webDefaults = WEB;
