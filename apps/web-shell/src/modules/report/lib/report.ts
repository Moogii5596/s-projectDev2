/** Phase 6.0.4 — Тайлангийн харуулах туслахууд (цэвэр функц) */

/** Backend-ийн `MrStatus` бүх утга (schema.prisma) */
export const MR_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Ноорог',
  PENDING_APPROVAL: 'Батлуулж байна',
  PROVISIONALLY_APPROVED: 'Түр батлагдсан',
  APPROVED: 'Батлагдсан',
  REJECTED: 'Татгалзсан',
  CANCELLED: 'Цуцлагдсан',
}
const STATUS_ORDER = Object.keys(MR_STATUS_LABEL)

export const statusLabel = (status: string): string => MR_STATUS_LABEL[status] ?? status

/** Статусыг ажлын урсгалын дарааллаар (мэдэгдэхгүй статус төгсгөлд, нэрээр) */
export function sortStatuses<T>(byStatus: Record<string, T>): Array<[string, T]> {
  const rank = (s: string) => {
    const i = STATUS_ORDER.indexOf(s)
    return i === -1 ? STATUS_ORDER.length : i
  }
  return Object.entries(byStatus).sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
}

export type UtilTone = 'green' | 'yellow' | 'red'

/** Төсвийн ашиглалт (committed + spent) / total: ≥100% улаан, ≥80% шар */
export function utilizationTone(pct: number): UtilTone {
  if (pct >= 100) return 'red'
  if (pct >= 80) return 'yellow'
  return 'green'
}

/** Progress bar-ын өргөн 0–100 (хэтэрсэн ч 100) */
export const barWidth = (pct: number): number => (Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0)

/** `s-project-summary-2026-10-10.csv` (Улаанбаатарын огноо) */
export function csvFileName(now: Date = new Date()): string {
  const ub = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return `s-project-summary-${ub}.csv`
}
