/**
 * v0.2.3 Блок D (S2) — нэмэлт утас: маягтын нэг талбарт таслал / мөр шилжилтээр олон дугаар.
 * Backend `employee-names.ts` (splitPhones / PHONE_RE)-тэй ижил дүрэм.
 */
const PHONE_RE = /^(\+\d{8,15}|\d{8})$/
const compact = (s: string) => s.replace(/[\s\-()]/g, '')

export function splitPhones(text: string): string[] {
  return text
    .split(/[,;/\n\r]+|\s{2,}|\s(?=\+?\d{8})/)
    .map(compact)
    .filter(Boolean)
}

/** Буруу дугааруудыг буцаана (хоосон = бүгд зөв) */
export const invalidPhones = (list: string[]) => list.filter((p) => !PHONE_RE.test(p))

export const joinPhones = (list: readonly string[] | undefined | null) => (list ?? []).join(', ')
