/**
 * v0.2.2 Блок 3 (D-04) — урилга / нууц үг сэргээх имэйлийн загвар, 3 хэл.
 * Байгууллагын орчуулгын засвар хүсэлтийн i18n context-оос уншигдана.
 */
import { t } from '../common/i18n/translate';

export type MailLang = 'mn' | 'en' | 'zh';
export interface MailContent { subject: string; text: string; html: string }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const mailLang = (l: string | null | undefined): MailLang => (l === 'en' || l === 'zh' ? l : 'mn');

export function renderAuthMail(kind: 'invite' | 'reset', lang: MailLang, p: { name: string; url: string; login: string | null; hours?: number; minutes?: number }): MailContent {
  const namespace = `auth.mail.${kind}`;
  const params = { name: p.name, hours: p.hours ?? 72, minutes: p.minutes ?? 60, login: p.login ?? '' };
  const subject = t(`${namespace}.subject`, {}, lang);
  const hello = t(`${namespace}.hello`, params, lang);
  const body = t(`${namespace}.body`, params, lang);
  const login = p.login ? t(`${namespace}.login`, params, lang) : null;
  const button = t(`${namespace}.button`, {}, lang);
  const ignore = t(`${namespace}.ignore`, {}, lang);
  const lines = [hello, '', body, p.url, ...(login ? ['', login] : []), '', ignore];
  const html = [
    `<p>${esc(hello)}</p>`,
    `<p>${esc(body)}</p>`,
    `<p><a href="${esc(p.url)}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none">${esc(button)}</a></p>`,
    `<p style="font-size:12px;color:#555;word-break:break-all">${esc(p.url)}</p>`,
    ...(login ? [`<p>${esc(login)}</p>`] : []),
    `<p style="font-size:12px;color:#777">${esc(ignore)}</p>`,
  ].join('\n');
  return { subject, text: lines.join('\n'), html };
}
