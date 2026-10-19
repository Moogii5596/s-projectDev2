import type { Lang } from '../i18n'
import { RELEASE_NOTES, type ReleaseNote } from './notes'

/**
 * v0.2.3 Блок F — «Шинэчлэлийн түүх»-ийн цэвэр функц (API / i18next импортгүй → vitest-д шууд).
 */

/** 'v0.2.2.1' → [0,2,2,1]; харьцуулалт урт ялгаатай бол 0-ээр нөхнө */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split('.').map(Number)
  const pb = b.replace(/^v/i, '').split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/** Суусан (огноотой) хувилбарууд — шинээс хуучин руу. Огноогүй (бэлтгэгдэж буй) хувилбарыг харуулахгүй. */
export function releasedNotes(notes: ReleaseNote[] = RELEASE_NOTES): ReleaseNote[] {
  return notes.filter((n) => n.date !== null).sort((x, y) => compareVersions(y.version, x.version))
}

/** Одоогийн (хамгийн сүүлд суусан) хувилбар */
export function latestVersion(notes: ReleaseNote[] = RELEASE_NOTES): string | null {
  return releasedNotes(notes)[0]?.version ?? null
}

/** Хэрэглэгч сүүлд үзсэнээс шинэ хувилбар байгаа эсэх («Шинэ» тэмдэг). Огт үзээгүй бол true. */
export function hasUnseen(lastSeen: string | null, notes: ReleaseNote[] = RELEASE_NOTES): boolean {
  const latest = latestVersion(notes)
  if (!latest) return false
  return !lastSeen || compareVersions(latest, lastSeen) > 0
}

/** Тэмдэглэлийн хэл: 中文 → zh, бусад (mn, en) → mn */
export const noteLang = (lang: Lang): 'mn' | 'zh' => (lang === 'zh' ? 'zh' : 'mn')

const SEEN_KEY = 's-project.whats-new.seen'

/** localStorage — нэг төхөөрөмжийн тохиромж (хувийн цонхонд алдаагүй) */
export function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY)
  } catch {
    return null
  }
}

export function writeSeen(version: string): void {
  try {
    localStorage.setItem(SEEN_KEY, version)
  } catch {
    /* хувийн цонх г.м. — дараа дахин «Шинэ» харагдана */
  }
}
