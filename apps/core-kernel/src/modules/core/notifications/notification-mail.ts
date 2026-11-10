import type { MailContent } from '../../../auth/auth-mail';
import { formatMessage, type I18nParams } from '../../../common/i18n/translate';
import { i18nStorage, type Lang } from '../../../common/i18n/i18n-context';
import { catalog } from '../../../common/i18n/catalog';

/**
 * Каталогийн (web + server) түлхүүр → текст: tenant override → хэлний анхдагч → mn → түлхүүр.
 * Мэдэгдлийн текст `web.*.json`-д (frontend ба имэйл нэг текст) — `t()` зөвхөн server кодыг мэддэг тул энд каталогоос.
 */
export function catalogText(key: string, params: I18nParams, lang: Lang): string {
  params = resolveKeyParams(params, lang);
  const ov = i18nStorage.getStore()?.overrides?.get(`${lang}:${key}`);
  const entry = catalog().get(key);
  const template = ov ?? (entry ? entry.defaults[lang] || entry.defaults.mn : key);
  return formatMessage(template, params, lang);
}

/**
 * `<name>Key` параметр = i18n түлхүүр → `<name>` болгон орчуулна (жнь entityKey: 'approval.entity.mr' → {entity}).
 * Frontend-ийн `notificationText()`-тэй ижил дүрэм.
 */
export function resolveKeyParams(params: I18nParams, lang: Lang): I18nParams {
  const out: I18nParams = { ...params };
  for (const [k, v] of Object.entries(params)) {
    if (k.length > 3 && k.endsWith('Key') && typeof v === 'string' && v) out[k.slice(0, -3)] = catalogText(v, {}, lang);
  }
  return out;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Мэдэгдлийн имэйл (NTF-01). Текст = i18n түлхүүр (tenant override — дуудагч `i18nStorage.run`-аар өгнө).
 * Хэрэглэгчийн утгыг (params) text/HTML хоёуланд escape хийнэ (HTML).
 */
export function renderNotificationMail(
  lang: Lang,
  n: { titleKey: string; bodyKey: string | null; params: I18nParams; url: string | null },
): MailContent {
  const safe: I18nParams = Object.fromEntries(Object.entries(n.params).map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 500) : v]));
  const subject = catalogText(n.titleKey, safe, lang).replace(/[\r\n]+/g, ' ').slice(0, 200);
  const body = n.bodyKey ? catalogText(n.bodyKey, safe, lang) : null;
  const button = catalogText('notify.mail.open', {}, lang);
  const footer = catalogText('notify.mail.footer', {}, lang);
  const text = [subject, '', ...(body ? [body, ''] : []), ...(n.url ? [n.url, ''] : []), footer].join('\n');
  const html = [
    `<p><strong>${esc(subject)}</strong></p>`,
    ...(body ? [`<p>${esc(body)}</p>`] : []),
    ...(n.url
      ? [`<p><a href="${esc(n.url)}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none">${esc(button)}</a></p>`]
      : []),
    `<p style="font-size:12px;color:#777">${esc(footer)}</p>`,
  ].join('\n');
  return { subject, text, html };
}
