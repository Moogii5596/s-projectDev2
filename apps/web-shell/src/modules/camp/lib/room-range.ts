/** FB-07 — олон өрөөний дугаар (backend master/room-range.ts-тэй ИЖИЛ дүрэм) */
export const BULK_ROOMS_MAX = 500

export interface RoomRange {
  from: number
  to: number
  prefix?: string
  padTo?: number
}

/** {from: 1, to: 3, prefix: '7-', padTo: 2} → ['7-01', '7-02', '7-03'] */
export function roomNumbers(r: RoomRange): string[] {
  const out: string[] = []
  for (let n = r.from; n <= r.to; n++) out.push(`${r.prefix ?? ''}${String(n).padStart(r.padTo ?? 0, '0')}`)
  return out
}

/** Урьдчилсан харагдац: шинэ / алгасах / хязгаар */
export function planRooms(r: RoomRange, existing: Iterable<string>) {
  if (!Number.isInteger(r.from) || !Number.isInteger(r.to) || r.to < r.from) return { ok: false as const, reason: 'range' as const }
  const n = r.to - r.from + 1
  if (n > BULK_ROOMS_MAX) return { ok: false as const, reason: 'too_many' as const, n }
  const have = new Set(existing)
  const all = roomNumbers(r)
  return { ok: true as const, all, create: all.filter((x) => !have.has(x)), skip: all.filter((x) => have.has(x)) }
}
