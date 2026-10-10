/** Backend-ийн `CAMP_PERMISSIONS` (apps/core-kernel/src/modules/camp/common/camp-permissions.ts)-тэй ижил */
export const P = {
  SETTINGS_MANAGE: 'camp.settings.manage',
  ROLES_MANAGE: 'camp.roles.manage',
  MASTER_MANAGE: 'camp.master.manage',
  CONTRACT_MANAGE: 'camp.contract.manage',
  EMPLOYEE_MANAGE: 'camp.employee.manage',
  MOVEMENT_IMPORT: 'camp.movement.import',
  SHIFT_ADJUST: 'camp.shift.adjust',
  ROOM_MANAGE: 'camp.room.manage',
  ASSET_MANAGE: 'camp.asset.manage',
  MAINTENANCE_CREATE: 'camp.maintenance.create',
  MAINTENANCE_PARTS: 'camp.maintenance.parts',
  MAINTENANCE_CLOSE: 'camp.maintenance.close',
  HAUL_CREATE: 'camp.haul.create',
  HAUL_APPROVE: 'camp.haul.approve',
  MEAL_ORDER: 'camp.meal.order',
  MEAL_ACCEPT: 'camp.meal.accept',
  REPORT_VIEW: 'camp.report.view',
} as const

export type CampPermission = (typeof P)[keyof typeof P]

/** Эрхийн шалгагч: tenant admin бүх эрхтэй (backend-тэй ижил дүрэм). Backend дахин шалгана — энэ нь зөвхөн UI нуух */
export function makeCan(perm: { isTenantAdmin: boolean; permissions: string[] } | undefined) {
  return (...codes: CampPermission[]): boolean => {
    if (!perm) return false
    if (perm.isTenantAdmin) return true
    return codes.some((c) => perm.permissions.includes(c))
  }
}

/** V1 UI-д харуулах эрхүүд (D8: availableIn = 'v2' нуугдана) */
export function visiblePermissions<T extends { availableIn: string }>(list: T[]): T[] {
  return list.filter((p) => p.availableIn === 'v1')
}

/**
 * Роль хадгалах эрхийн жагсаалт: UI-д харагдаж буй (V1) эрхүүдээс сонгосныг авч,
 * нуугдсан (V2) эрхүүдийг роль аль хэдийн эзэмшиж байвал ХЭВЭЭР үлдээнэ (D8 — оноосон эрх хасагдахгүй).
 */
export function mergeRolePermissions(current: string[], visibleCodes: string[], selectedVisible: string[]): string[] {
  const visible = new Set(visibleCodes)
  const hiddenKept = current.filter((c) => !visible.has(c))
  const chosen = selectedVisible.filter((c) => visible.has(c))
  return [...new Set([...hiddenKept, ...chosen])].sort()
}
