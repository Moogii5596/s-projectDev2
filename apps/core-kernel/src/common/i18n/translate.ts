import { currentLang, i18nStorage, Lang } from './i18n-context';
import { MESSAGES, MessageCode } from './messages';

export type I18nParams = Record<string, string | number | boolean | null | undefined>;

/** '{room} өрөө' + {room: '101'} → '101 өрөө'. Параметр алга бол `{room}` хэвээр (алдааг нуухгүй). */
export function formatMessage(template: string, params: I18nParams = {}): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (m, k: string) => {
    const v = params[k];
    return v === undefined || v === null ? m : String(v);
  });
}

/** Текстэн дэх хувьсагчид (`{room}`) — орчуулгын засварт шалгана */
export function templateVars(template: string): string[] {
  return [...new Set([...template.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]))].sort();
}

export const isMessageCode = (code: string): code is MessageCode => Object.prototype.hasOwnProperty.call(MESSAGES, code);

/** Анхдагч текст (кодонд): хэл → mn нөөц */
export function defaultMessage(code: MessageCode, lang: Lang): string {
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
  if (ov !== undefined) return formatMessage(ov, params);
  if (!isMessageCode(code)) return code;
  return formatMessage(defaultMessage(code, lang), params);
}
