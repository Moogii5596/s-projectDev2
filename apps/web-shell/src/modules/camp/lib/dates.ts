/** Огноо = 'YYYY-MM-DD' (цагийн бүсгүй, UTC-ээр тооцно — backend `camp-date.ts`-тэй ижил) */
const DAY_MS = 86_400_000

export const isoToMs = (iso: string): number => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))
export const msToIso = (ms: number): string => new Date(ms).toISOString().slice(0, 10)
export const addDays = (iso: string, n: number): string => msToIso(isoToMs(iso) + n * DAY_MS)
/** 0 = Ням … 6 = Бямба */
export const isoWeekday = (iso: string): number => new Date(isoToMs(iso)).getUTCDay()
/** Монголын (Asia/Ulaanbaatar) өнөөдөр */
export const todayUb = (now = new Date()): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ulaanbaatar' }).format(now)
