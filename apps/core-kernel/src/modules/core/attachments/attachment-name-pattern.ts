/**
 * v0.2.4 Блок 8 (FILE-01) — файлын нэрийн загвар: `{object}_{type}_{date}` гэх мэт.
 *   {object} — объектын код (заавал), {type} — баримтын төрлийн код, {date} — огноо (YYYYMMDD / YYYY-MM-DD / YYYY.MM.DD).
 * Токен бүр дээд тал нь нэг удаа; токенуудын хооронд хоосон биш тусгаарлагч заавал (эс бөгөөс нэр хоёрдмол утгатай).
 * Цэвэр функц — unit тестлэгдэнэ.
 */
export const NAME_PATTERN_TOKENS = ['object', 'type', 'date'] as const;
export type NamePatternToken = (typeof NAME_PATTERN_TOKENS)[number];

export const DEFAULT_NAME_PATTERN = '{object}_{type}_{date}';
const MAX_PATTERN_LENGTH = 100;
const SEPARATOR_RE = /^[ ._\-()[\]#№]+$/u;

export type NamePatternError = 'empty' | 'too_long' | 'unknown_token' | 'duplicate_token' | 'object_required' | 'separator_required' | 'invalid_separator';

export interface CompiledNamePattern {
  pattern: string;
  tokens: NamePatternToken[];
  regex: RegExp;
}

export interface ParsedFileName {
  object: string;
  type: string | null;
  /** YYYY-MM-DD */
  date: string | null;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const TOKEN_RE: Record<NamePatternToken, string> = {
  // Объектын код тусгаарлагч агуулж болно (жнь ZAS-CMP1-2026-0001) — бусад токен хатуу хэлбэртэй тул non-greedy хангалттай
  object: '(.+?)',
  type: '([A-Za-z0-9]{1,30})',
  date: '(\\d{4}[-.]?\\d{2}[-.]?\\d{2})',
};

export function compileNamePattern(raw: string): { ok: true; value: CompiledNamePattern } | { ok: false; error: NamePatternError } {
  const pattern = raw.trim();
  if (!pattern) return { ok: false, error: 'empty' };
  if (pattern.length > MAX_PATTERN_LENGTH) return { ok: false, error: 'too_long' };
  const parts = pattern.split(/(\{[^{}]*\})/).filter((p) => p !== '');
  const tokens: NamePatternToken[] = [];
  let re = '^';
  let prevWasToken = false;
  for (const part of parts) {
    const m = /^\{([^{}]*)\}$/.exec(part);
    if (m) {
      const name = m[1] as NamePatternToken;
      if (!NAME_PATTERN_TOKENS.includes(name)) return { ok: false, error: 'unknown_token' };
      if (tokens.includes(name)) return { ok: false, error: 'duplicate_token' };
      if (prevWasToken) return { ok: false, error: 'separator_required' };
      tokens.push(name);
      re += TOKEN_RE[name];
      prevWasToken = true;
    } else {
      if (part.includes('{') || part.includes('}') || !SEPARATOR_RE.test(part)) return { ok: false, error: 'invalid_separator' };
      re += escapeRe(part);
      prevWasToken = false;
    }
  }
  if (!tokens.includes('object')) return { ok: false, error: 'object_required' };
  return { ok: true, value: { pattern, tokens, regex: new RegExp(`${re}$`, 'iu') } };
}

function normalizeDate(raw: string): string | null {
  const digits = raw.replace(/[-.]/g, '');
  if (!/^\d{8}$/.test(digits)) return null;
  const y = Number(digits.slice(0, 4));
  const mo = Number(digits.slice(4, 6));
  const d = Number(digits.slice(6, 8));
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (y < 1900 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

/** Өргөтгөлгүй нэрийг загвартай тулгана. Таарахгүй / огноо буруу → null */
export function parseFileName(compiled: CompiledNamePattern, fileName: string): ParsedFileName | null {
  const base = fileName.replace(/\.[A-Za-z0-9]{1,8}$/, '').trim();
  const m = compiled.regex.exec(base);
  if (!m) return null;
  const out: ParsedFileName = { object: '', type: null, date: null };
  for (let i = 0; i < compiled.tokens.length; i++) {
    const value = (m[i + 1] ?? '').trim();
    const token = compiled.tokens[i]!;
    if (token === 'object') out.object = value.toUpperCase();
    else if (token === 'type') out.type = value.toUpperCase();
    else {
      const date = normalizeDate(value);
      if (!date) return null;
      out.date = date;
    }
  }
  return out.object ? out : null;
}
