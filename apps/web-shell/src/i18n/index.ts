import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import mn from '@s-project/i18n/web.mn.json'
import en from '@s-project/i18n/web.en.json'
import zh from '@s-project/i18n/web.zh.json'

/**
 * v0.2.0 §0.7 — Олон хэл: Монгол (анхдагч) · English · 中文.
 *   - Анхдагч орчуулга: packages/i18n/web.{mn,en,zh}.json (хавтгай түлхүүр).
 *   - Байгууллагын засвар: GET /api/v1/i18n/web/:lang (≤60с) → `applyOverrides`.
 *   - Хувьсагч `{name}` (backend-тэй ижил хэлбэр, орчуулгын Excel-д нэг дүрэм).
 *   - Хэрэглэгчийн сонголт: профайл (core_users.locale) → энэ төхөөрөмж (localStorage) → МОНГОЛ.
 *     Браузерын хэлийг АШИГЛАХГҮЙ: пилотын ихэнх утас англи хэлтэй тул шинэчлэлтийн дараа UI гэнэт англи болохгүй
 *     (2026-10-11 шийдвэр; хятад ажилтан нэг удаа 中文 сонгоход профайлд хадгалагдана).
 */
export const LANGS = ['mn', 'en', 'zh'] as const
export type Lang = (typeof LANGS)[number]
export const LANG_LABELS: Record<Lang, string> = { mn: 'МН', en: 'EN', zh: '中文' }
/** Intl-ийн locale (огноо, тоо) */
export const INTL_LOCALE: Record<Lang, string> = { mn: 'mn-MN', en: 'en-GB', zh: 'zh-CN' }

const DEFAULTS: Record<Lang, Record<string, string>> = { mn, en, zh }
const STORAGE_KEY = 's-project.lang'

export const isLang = (v: unknown): v is Lang => typeof v === 'string' && (LANGS as readonly string[]).includes(v)

function storedLang(): Lang | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return isLang(v) ? v : null
  } catch {
    return null
  }
}

export function initialLang(): Lang {
  return storedLang() ?? 'mn'
}

void i18n.use(initReactI18next).init({
  resources: Object.fromEntries(LANGS.map((l) => [l, { translation: { ...DEFAULTS[l] } }])),
  lng: initialLang(),
  fallbackLng: 'mn',
  keySeparator: false,
  nsSeparator: false,
  returnNull: false,
  interpolation: { escapeValue: false, prefix: '{', suffix: '}' },
  react: { useSuspense: false },
})

export const currentLang = (): Lang => (isLang(i18n.language) ? i18n.language : 'mn')

export function setLanguage(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    /* хувийн цонх г.м. — санахгүй ч ажиллана */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lang
  void i18n.changeLanguage(lang)
}

/** Байгууллагын засварыг анхдагч дээр давхарлана (өмнөх засварыг цэвэрлэж — буцаасан түлхүүр анхдагч болно) */
export function applyOverrides(lang: Lang, messages: Record<string, string>): void {
  i18n.addResourceBundle(lang, 'translation', { ...DEFAULTS[lang], ...messages }, false, true)
  if (lang === currentLang()) void i18n.changeLanguage(lang) // дахин render
}

export default i18n
