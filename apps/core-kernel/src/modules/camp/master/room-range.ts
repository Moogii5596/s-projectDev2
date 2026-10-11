/** FB-07 — олон өрөөний дугаар (frontend-ийн урьдчилсан харагдацтай ижил дүрэм: web-shell lib/room-range.ts) */
export const BULK_ROOMS_MAX = 500;

export interface RoomRange {
  from: number;
  to: number;
  prefix?: string;
  padTo?: number;
}

/** {from: 1, to: 3, prefix: '7-', padTo: 2} → ['7-01', '7-02', '7-03'] */
export function roomNumbers(r: RoomRange): string[] {
  const out: string[] = [];
  for (let n = r.from; n <= r.to; n++) out.push(`${r.prefix ?? ''}${String(n).padStart(r.padTo ?? 0, '0')}`);
  return out;
}
