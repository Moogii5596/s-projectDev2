/**
 * Backend-ийн `PERMISSIONS` (apps/core-kernel/src/modules/core/permissions/permission-registry.ts)-тэй ижил.
 * v0.2.3 Блок 3 (ADR-007): HR-ийн эрх `hr.*` (хуучин `camp.employee.*` г.м. — backend alias v0.2.4 хүртэл).
 */
export const P = {
  SETTINGS_MANAGE: 'camp.settings.manage',
  MASTER_MANAGE: 'camp.master.manage',
  CONTRACT_MANAGE: 'camp.contract.manage',
  EMPLOYEE_MANAGE: 'hr.employee.manage',
  /** v0.2.2 Блок 5 — ажлаас гаргах, дахин ажилд авах (Кемп админ) */
  EMPLOYEE_TERMINATE: 'hr.employee.terminate',
  MOVEMENT_IMPORT: 'hr.attendance.import',
  SHIFT_ADJUST: 'hr.shift.adjust',
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

/**
 * v0.2.3 Блок 3 (V2-05, B3-4): роль/эрхийн матрицад БҮХ эрх харагдана. Модуль нь хараахан хэрэгжээгүй эрхэд «удахгүй» шошго.
 * Хоолны захиалга (6а), гэрээ (6б) v0.2.3-т орно → шошгогүй.
 */
export const COMING_SOON_PERMISSIONS: readonly string[] = ['camp.haul.create', 'camp.haul.approve', 'camp.report.view']

export const isComingSoon = (code: string): boolean => COMING_SOON_PERMISSIONS.includes(code)

/** Матрицад харуулах эрх (V2-05: бүгд); дараалал хэвээр */
export function visiblePermissions<T extends { code?: string; availableIn: string }>(list: T[]): T[] {
  return [...list]
}

/** SEC-009: хэрэглэгч, роль удирдах (урилга, идэвхгүй болгох, эрх олгох, «Хэн үзсэн») — системийн админ эсэх */
export function isSystemAdmin(perms: { isTenantAdmin?: boolean } | null | undefined): boolean {
  return perms?.isTenantAdmin === true
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

/** Аль нэг кемпэд (эсвэл бүх кемпэд) эрхтэй эсэх — tenant түвшний лавлах (хөрөнгийн ангилал). Backend `requireInAnyCamp`-тэй ижил */
export function canInAnyCamp(perm: { isTenantAdmin: boolean; permissions: string[]; byCamp: Record<string, string[]> } | undefined, code: CampPermission): boolean {
  if (!perm) return false
  if (perm.isTenantAdmin || perm.permissions.includes(code)) return true
  return Object.values(perm.byCamp).some((list) => list.includes(code))
}

/**
 * v0.2.2 H2 (H-Q3) — эрхийн харагдах нэр i18n-ээр **кодоор** (`perm.<code>`, mn/en/zh); DB-ийн `camp_permissions.name` хөндөгдөхгүй.
 * Орчуулга алга (шинэ эрх DB-д нэмэгдээд json шинэчлэгдээгүй) → DB-ийн нэр.
 */
export const permissionLabelKey = (code: string): string => `perm.${code}`

export function permissionLabel(p: { code: string; name: string }, exists: (key: string) => boolean, translate: (key: string) => string): string {
  const key = permissionLabelKey(p.code)
  return exists(key) ? translate(key) : p.name
}
