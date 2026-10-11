/**
 * v0.2.2 Блок 2 (ADR-003 §2.2, D-13) — нэвтрэх нэрийн цэвэр функцүүд (DB/API импортгүй).
 */

export type LoginIdentifier =
  | { kind: 'email'; value: string }
  | { kind: 'phone'; value: string }
  | { kind: 'username'; value: string };

/** Монгол утас: зай, зураас, цэг, хаалт хасаж; +976 / 976 / 00976 угтвартай 11 оронтойг 8 болгоно. Бусад → null */
export function normalizeMnPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!/^[+0-9\s().-]+$/.test(s)) return null;
  let d = s.replace(/[^0-9]/g, '');
  const plus = s.startsWith('+');
  if (d.startsWith('00976') && d.length === 13) d = d.slice(5);
  else if (d.startsWith('976') && d.length === 11) d = d.slice(3);
  else if (plus) return null; // +86… г.м. гадаад дугаар
  return /^[0-9]{8}$/.test(d) ? d : null;
}

/** Утсыг лог/мэдэгдэлд бүтнээр бичихгүй: 99112233 → 99****33 */
export function maskPhone(phone: string): string {
  return phone.length < 4 ? '****' : `${phone.slice(0, 2)}${'*'.repeat(phone.length - 4)}${phone.slice(-2)}`;
}

export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,63}$/;

/**
 * Нэвтрэх талбарын утгыг таних. `@` → имэйл; Монгол утас болж чадвал → утас; бусад → username (жижиг үсэг).
 * Тоон username (ажилтны код "10234567") утастай андуурагдаж болно → дуудагч утсаар олдохгүй бол username-аар дахин хайна.
 */
export function parseLoginIdentifier(raw: string): LoginIdentifier | null {
  const s = (raw ?? '').trim();
  if (s.length === 0 || s.length > 254) return null;
  if (s.includes('@')) return { kind: 'email', value: s.toLowerCase() };
  const phone = normalizeMnPhone(s);
  if (phone) return { kind: 'phone', value: phone };
  const u = s.toLowerCase();
  return USERNAME_RE.test(u) ? { kind: 'username', value: u } : null;
}

/**
 * Ажилтны кодоос username (D-13, Q-A): жижиг үсэг, латин/цифр/._- л үлдэнэ (кирилл, зай хасагдана).
 * Хоосон эсвэл 2 тэмдэгтээс богино бол `u` + fallback. `taken` дотор байвал -2, -3 …
 */
export function usernameFromCode(code: string, taken: ReadonlySet<string>, fallback: string): string {
  let base = (code ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^[._-]+/, '')
    .slice(0, 60);
  if (base.length < 2) base = `u${fallback.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12)}`;
  if (!USERNAME_RE.test(base)) base = `u${base}`.slice(0, 60);
  if (!taken.has(base)) return base;
  for (let i = 2; i < 10_000; i++) {
    const c = `${base}-${i}`;
    if (!taken.has(c)) return c;
  }
  throw new Error('username: давтагдашгүй нэр олдсонгүй');
}
