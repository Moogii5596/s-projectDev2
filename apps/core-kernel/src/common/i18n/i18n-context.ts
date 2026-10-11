import { AsyncLocalStorage } from 'async_hooks';

/**
 * v0.2.0 §0.7 — Олон хэл: Монгол (анхдагч) · English · 中文 (简体)
 * Хүсэлтийн хэл = `Accept-Language` (frontend хэрэглэгчийн сонголтыг автоматаар илгээнэ).
 * I18nInterceptor хүсэлт бүрийг `i18nStorage.run({ lang, overrides })`-оор ороож, сервисүүд `t()`-г синхрон дуудна.
 */
export const LANGS = ['mn', 'en', 'zh'] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = 'mn';

export interface I18nContext {
  lang: Lang;
  /** Байгууллагын орчуулгын засвар: `${lang}:${key}` → текст (i18n_overrides) */
  overrides?: ReadonlyMap<string, string>;
}

export const i18nStorage = new AsyncLocalStorage<I18nContext>();

export const isLang = (v: unknown): v is Lang => typeof v === 'string' && (LANGS as readonly string[]).includes(v);

/** 'zh-CN,zh;q=0.9,en;q=0.8' → 'zh'. Дэмжихгүй/хоосон → mn. q-ийн дарааллаар. */
export function parseAcceptLanguage(header: string | string[] | undefined): Lang {
  const raw = Array.isArray(header) ? header.join(',') : header ?? '';
  const items = raw
    .split(',')
    .map((part, i) => {
      const [tag, ...ps] = part.trim().split(';');
      const q = ps.map((p) => p.trim()).find((p) => p.startsWith('q='));
      return { base: tag.trim().toLowerCase().split('-')[0], q: q ? Number(q.slice(2)) || 0 : 1, i };
    })
    .filter((x) => x.base)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  return items.map((x) => x.base).find(isLang) ?? DEFAULT_LANG;
}

export const currentLang = (): Lang => i18nStorage.getStore()?.lang ?? DEFAULT_LANG;
