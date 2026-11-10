import { currentLang, i18nStorage, Lang } from './i18n-context';
import { MESSAGES, MessageCode } from './messages';
import termsMn from '@s-project/i18n/terms.mn.json';
import termsEn from '@s-project/i18n/terms.en.json';
import termsZh from '@s-project/i18n/terms.zh.json';

export type I18nParams = Record<string, string | number | boolean | null | undefined>;

const TERMS: Record<Lang, Record<string, string>> = { mn: termsMn, en: termsEn, zh: termsZh };

/** '{room} өрөө' + {room: '101'} → '101 өрөө'. Параметр алга бол `{room}` хэвээр (алдааг нуухгүй). */
export function formatMessage(template: string, params: I18nParams = {}, lang: Lang = currentLang()): string {
  const overrides = i18nStorage.getStore()?.overrides;
  const withTerms = template.replace(/\$t\((term\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+)\)/g, (match, key: string) =>
    overrides?.get(`${lang}:${key}`) ?? TERMS[lang][key] ?? match,
  );
  return withTerms.replace(/\{([a-zA-Z0-9_]+)\}/g, (m, k: string) => {
    const v = params[k];
    return v === undefined || v === null ? m : String(v);
  });
}

/** Текстэн дэх хувьсагчид (`{room}`) — орчуулгын засварт шалгана */
export function templateVars(template: string): string[] {
  return [...new Set([...template.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]))].sort();
}

const isMessageCode = (code: string): code is MessageCode => Object.prototype.hasOwnProperty.call(MESSAGES, code);

/** Анхдагч текст (кодонд): хэл → mn нөөц */
function defaultMessage(code: MessageCode, lang: Lang): string {
  const m = MESSAGES[code];
  return m[lang] || m.mn;
}

/**
 * Код → текст. Дараалал: байгууллагын засвар (тухайн хэл) → кодын анхдагч (тухайн хэл) → mn.
 * Үл мэдэгдэх код → код өөрөө (UI-д харагдаж, алдаа нуугдахгүй).
 */
export function t(code: string, params?: I18nParams, lang: Lang = currentLang()): string {
  const overrides = i18nStorage.getStore()?.overrides;
  const ov = overrides?.get(`${lang}:${code}`);
  if (ov !== undefined) return formatMessage(ov, params, lang);
  if (!isMessageCode(code)) return code;
  return formatMessage(defaultMessage(code, lang), params, lang);
}
