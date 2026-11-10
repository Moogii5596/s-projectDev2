/**
 * v0.2.2 Блок 5 — ажлаас гаргах / дахин ажилд авах цонхны дүрэм (цэвэр функц, unit тест). Backend дахин шалгана.
 */
import type { EmployeeProfile, TerminationReason } from '../api/camp-bridge'

export const TERMINATION_REASONS: readonly TerminationReason[] = ['RESIGNED', 'DISMISSED', 'CONTRACT_END', 'OTHER']

export interface TerminationForm {
  date: string
  reason: TerminationReason | ''
  note: string
}

/** Алдааны орчуулгын түлхүүр эсвэл null — огноо (өнөөдрөөс хойш биш, B5-Q3), шалтгаан, OTHER-д тайлбар (B5-Q4) */
export function terminationFormError(f: TerminationForm, today: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) return 'hr.term.err.date'
  if (f.date > today) return 'hr.term.err.future'
  if (!f.reason) return 'hr.term.err.reason'
  if (f.reason === 'OTHER' && !f.note.trim()) return 'hr.term.err.note'
  return null
}

/** Профайлын товч: ажлаас гаргах (гараагүй), дахин ажилд авах (гарсан, өмнө нь дахин аваагүй) — хоёулаа `can.terminate` */
export function lifecycleActions(p: Pick<EmployeeProfile, 'status' | 'rehiredAs' | 'can'>): { terminate: boolean; rehire: boolean } {
  return {
    terminate: p.can.terminate && p.status !== 'TERMINATED',
    rehire: p.can.terminate && p.status === 'TERMINATED' && !p.rehiredAs,
  }
}

/** Ажлаас гаргахад юу болохыг урьдчилан харуулах мөрүүд (орчуулгын түлхүүр + параметр) */
export function terminationEffects(p: Pick<EmployeeProfile, 'attendance' | 'rooms' | 'user'>, date: string): { key: string; params?: Record<string, string> }[] {
  const out: { key: string; params?: Record<string, string> }[] = []
  if (p.attendance.inCampSince) out.push({ key: 'hr.term.effect.departure', params: { date } })
  const openRoom = p.rooms.find((r) => r.endDate === null || r.endDate >= date)
  if (openRoom) out.push({ key: 'hr.term.effect.room', params: { room: `${openRoom.buildingName} · ${openRoom.roomNo}` } })
  if (p.user?.isActive) out.push({ key: 'hr.term.effect.user' })
  out.push({ key: 'hr.term.effect.record' })
  return out
}
