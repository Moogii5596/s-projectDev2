/**
 * v0.2.2 Блок 3 (D-04) — урилга / нууц үг сэргээх имэйлийн загвар, 3 хэл. Цэвэр функц.
 * Хэрэглэгчийн өгөгдлийг HTML-д escape хийнэ.
 */
export type MailLang = 'mn' | 'en' | 'zh';
export interface MailContent { subject: string; text: string; html: string }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const mailLang = (l: string | null | undefined): MailLang => (l === 'en' || l === 'zh' ? l : 'mn');

const T = {
  invite: {
    mn: { subject: 'S Project — нэвтрэх эрх', hello: 'Сайн байна уу {name},', body: 'Танд S Project системд нэвтрэх эрх үүслээ. Доорх холбоосоор орж нууц үгээ үүсгэнэ үү (холбоос {hours} цаг хүчинтэй, нэг удаа):', login: 'Таны нэвтрэх нэр: {login}', button: 'Нууц үг үүсгэх', ignore: 'Хэрэв та энэ эрхийг хүлээгээгүй бол энэ захидлыг үл тоомсорлоно уу.' },
    en: { subject: 'S Project — your access', hello: 'Hello {name},', body: 'An S Project account has been created for you. Open the link below to set your password (valid for {hours} hours, single use):', login: 'Your login: {login}', button: 'Set password', ignore: 'If you were not expecting this, please ignore this email.' },
    zh: { subject: 'S Project — 登录权限', hello: '{name}，您好：', body: '已为您开通 S Project 系统账号。请通过以下链接设置密码（{hours} 小时内有效，仅可使用一次）：', login: '您的登录名：{login}', button: '设置密码', ignore: '如果这不是您申请的，请忽略此邮件。' },
  },
  reset: {
    mn: { subject: 'S Project — нууц үг сэргээх', hello: 'Сайн байна уу {name},', body: 'Нууц үг сэргээх хүсэлт ирлээ. Доорх холбоосоор шинэ нууц үг үүсгэнэ үү ({minutes} минут хүчинтэй, нэг удаа):', login: 'Таны нэвтрэх нэр: {login}', button: 'Шинэ нууц үг', ignore: 'Хэрэв та хүсээгүй бол энэ захидлыг үл тоомсорлоно уу — нууц үг өөрчлөгдөхгүй.' },
    en: { subject: 'S Project — reset your password', hello: 'Hello {name},', body: 'We received a password reset request. Open the link below to choose a new password (valid for {minutes} minutes, single use):', login: 'Your login: {login}', button: 'New password', ignore: 'If you did not request this, ignore this email — your password will not change.' },
    zh: { subject: 'S Project — 重置密码', hello: '{name}，您好：', body: '我们收到了重置密码的请求。请通过以下链接设置新密码（{minutes} 分钟内有效，仅可使用一次）：', login: '您的登录名：{login}', button: '设置新密码', ignore: '如果不是您本人操作，请忽略此邮件——您的密码不会改变。' },
  },
} as const;

const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? '');

export function renderAuthMail(kind: 'invite' | 'reset', lang: MailLang, p: { name: string; url: string; login: string | null; hours?: number; minutes?: number }): MailContent {
  const t = T[kind][lang];
  const v = { name: p.name, hours: String(p.hours ?? 72), minutes: String(p.minutes ?? 60), login: p.login ?? '' };
  const lines = [fill(t.hello, v), '', fill(t.body, v), p.url, ...(p.login ? ['', fill(t.login, v)] : []), '', t.ignore];
  const ve = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, esc(x)]));
  const html = [
    `<p>${fill(esc(t.hello), ve)}</p>`,
    `<p>${fill(esc(t.body), ve)}</p>`,
    `<p><a href="${esc(p.url)}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none">${esc(t.button)}</a></p>`,
    `<p style="font-size:12px;color:#555;word-break:break-all">${esc(p.url)}</p>`,
    ...(p.login ? [`<p>${fill(esc(t.login), ve)}</p>`] : []),
    `<p style="font-size:12px;color:#777">${esc(t.ignore)}</p>`,
  ].join('\n');
  return { subject: t.subject, text: lines.join('\n'), html };
}
