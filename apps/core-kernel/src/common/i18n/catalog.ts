import webMn from '@s-project/i18n/web.mn.json';
import webEn from '@s-project/i18n/web.en.json';
import webZh from '@s-project/i18n/web.zh.json';
import { Lang, LANGS } from './i18n-context';
import { MESSAGES } from './messages';
import { templateVars } from './translate';

/**
 * Бүх орчуулгын түлхүүр: frontend (packages/i18n) + backend (messages.ts).
 * Байгууллагын засвар (i18n_overrides) зөвхөн эдгээр түлхүүрт; хувьсагч нь анхдагч mn-тэй яг ижил байна.
 */
export type CatalogSection = 'web' | 'server';
export interface CatalogEntry {
  key: string;
  section: CatalogSection;
  defaults: Record<Lang, string>;
  vars: string[];
}

const WEB: Record<Lang, Record<string, string>> = { mn: webMn, en: webEn, zh: webZh };

function build(): Map<string, CatalogEntry> {
  const map = new Map<string, CatalogEntry>();
  for (const key of Object.keys(WEB.mn).sort()) {
    const defaults = Object.fromEntries(LANGS.map((l) => [l, WEB[l][key] ?? ''])) as Record<Lang, string>;
    map.set(key, { key, section: 'web', defaults, vars: templateVars(defaults.mn) });
  }
  for (const [key, m] of Object.entries(MESSAGES).sort(([a], [b]) => a.localeCompare(b))) {
    if (map.has(key)) throw new Error(`i18n: түлхүүр давхардсан (web ба server): ${key}`);
    map.set(key, { key, section: 'server', defaults: { mn: m.mn, en: m.en, zh: m.zh }, vars: templateVars(m.mn) });
  }
  return map;
}

let cached: Map<string, CatalogEntry> | null = null;
export function catalog(): Map<string, CatalogEntry> {
  return (cached ??= build());
}

/** Frontend-ийн хэлний анхдагч (тест/шалгалтад) */
export const webDefaults = WEB;
