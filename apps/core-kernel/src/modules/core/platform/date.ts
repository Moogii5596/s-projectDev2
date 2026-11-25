/** Огноо = 'YYYY-MM-DD' string (UTC, цагийн бүсгүй). Кемпийн бүх тооцоо өдрийн нарийвчлалтай. */
const DAY_MS = 86_400_000;

const isoToMs = (iso: string): number => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const msToIso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
export const addDays = (iso: string, n: number): string => msToIso(isoToMs(iso) + n * DAY_MS);
/** b − a (өдрөөр) */
export const diffDays = (a: string, b: string): number => Math.round((isoToMs(b) - isoToMs(a)) / DAY_MS);
/** 0 = Ням … 6 = Бямба (PostgreSQL EXTRACT(DOW)-тэй ижил) */
export const weekday = (iso: string): number => new Date(isoToMs(iso)).getUTCDay();
export const isRealIsoDate = (iso: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(iso) && msToIso(isoToMs(iso)) === iso;
/** [from, to] бүх өдөр */
export const eachDay = (from: string, to: string): string[] => {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
};
/** Монголын (Asia/Ulaanbaatar) өнөөдөр */
export const todayUb = (now = new Date()): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ulaanbaatar' }).format(now);
/** Хаалттай муж [start, end|∞] нь d-г агуулах эсэх */
export const coversDay = (start: string, end: string | null, d: string): boolean => start <= d && (end === null || end >= d);
