/**
 * Phase 6.0.1 — Хэрэглэгчийн role (цэвэр функц; API/supabase импортгүй → vitest-д шууд ажиллана).
 * Prisma enum нэр (том үсгээр) — backend `UserRole`.
 */
export type UserRole = 'OWNER' | 'ADMIN' | 'APPROVER' | 'REQUESTER' | 'VIEWER'

/**
 * Inventory / Vendor бичих эрх — backend-ийн `WRITE_ROLES` (OWNER, ADMIN)-тэй ИЖИЛ.
 * UI зөвхөн товч нуух/харуулахад ашиглана; жинхэнэ хамгаалалт нь backend-ийн 403.
 */
export const WRITE_ROLES: readonly UserRole[] = ['OWNER', 'ADMIN']

export function canWrite(role: UserRole | null | undefined): boolean {
  return !!role && WRITE_ROLES.includes(role)
}
