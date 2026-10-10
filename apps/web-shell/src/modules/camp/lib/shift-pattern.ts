import type { ShiftSegment, ShiftType } from '../api/types'

/** Өдөр бүрийн ээлж (index 0 = 1-р өдөр); null = тохируулаагүй */
export type DayShifts = (ShiftType | null)[]

/** Мөрүүдийг өдрийн массив болгоно. Муж гадуурхыг үл тооно; давхцвал сүүлийнх нь дийлнэ */
export function segmentsToDays(segments: ShiftSegment[], onDays: number): DayShifts {
  const days: DayShifts = Array.from({ length: onDays }, () => null)
  for (const s of segments) {
    for (let d = Math.max(1, s.dayFrom); d <= Math.min(onDays, s.dayTo); d++) days[d - 1] = s.shift
  }
  return days
}

/** Өдрийн массивыг нэгтгэсэн мөрүүд болгоно (тохируулаагүй өдөр мөрөнд орохгүй) */
export function daysToSegments(days: DayShifts): ShiftSegment[] {
  const out: ShiftSegment[] = []
  days.forEach((shift, i) => {
    if (shift === null) return
    const day = i + 1
    const last = out[out.length - 1]
    if (last && last.shift === shift && last.dayTo === day - 1) last.dayTo = day
    else out.push({ dayFrom: day, dayTo: day, shift })
  })
  return out
}

/** Тохируулаагүй өдрүүд (1-ээс эхэлсэн дугаар) */
export function missingDays(days: DayShifts): number[] {
  return days.flatMap((s, i) => (s === null ? [i + 1] : []))
}

/** [1,2,3,5] → '1–3, 5' (backend-ийн мессежтэй ижил хэлбэр) */
export function formatRanges(nums: number[]): string {
  const sorted = [...nums].sort((a, b) => a - b)
  const out: string[] = []
  let i = 0
  while (i < sorted.length) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++
    out.push(i === j ? `${sorted[i]}` : `${sorted[i]}–${sorted[j]}`)
    i = j + 1
  }
  return out.join(', ')
}

/**
 * Хадгалах боломжтой эсэх: бүх өдөр тохируулсан эсвэл бүгд хоосон (загваргүй).
 * Backend `normalizeShiftPattern`-тэй ижил дүрэм — хэрэглэгчид шууд харуулна.
 */
export function patternProblem(days: DayShifts): string | null {
  const missing = missingDays(days)
  if (missing.length === 0 || missing.length === days.length) return null
  return `Дутуу өдөр: ${formatRanges(missing)} (1–${days.length} бүрэн бүрхэх ёстой, эсвэл бүгдийг хоосон үлдээнэ)`
}
