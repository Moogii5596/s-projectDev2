/**
 * Camp Module — Permission каталог (Шат 2.1)
 *
 * DB-ийн `camp_permissions` хүснэгттэй (20261009001_camp_rbac.sql) ЯГ ИЖИЛ байх ёстой —
 * integration тест (`test/camp-master.integration.spec.ts`) хоёрыг тулгана.
 * Шинэ эрх нэмэх: (1) migration-д INSERT, (2) энд нэмэх, (3) анхдагч ролиудад хэрэгтэй бол seed функцэд.
 */
export const CAMP_PERMISSIONS = {
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
} as const;

export type CampPermission = (typeof CAMP_PERMISSIONS)[keyof typeof CAMP_PERMISSIONS];

export const CAMP_PERMISSION_CODES: readonly CampPermission[] = Object.values(CAMP_PERMISSIONS);

const CODE_SET: ReadonlySet<string> = new Set(CAMP_PERMISSION_CODES);

export function isCampPermission(code: string): code is CampPermission {
  return CODE_SET.has(code);
}

/**
 * Хувилбарын хүрээ (D8, 2026-10-09): гэрээ, бохир ус/хог, хоолны захиалга, зардлын тайлан (Шат 5–7) → V2.
 * V2 эрх DB/каталогоос УСТГАГДАХГҮЙ, эрх шалгалт өөрчлөгдөхгүй (оноосон эрх хэвээр) —
 * зөвхөн V1 UI (Шат 8) роль/эрхийн матрицад нуухад `GET /camp/permissions`-ийн `availableIn`-аар ашиглана.
 */
export type CampReleaseScope = 'v1' | 'v2';

const V2_CODES: ReadonlySet<CampPermission> = new Set<CampPermission>([
  CAMP_PERMISSIONS.CONTRACT_MANAGE,
  CAMP_PERMISSIONS.HAUL_CREATE,
  CAMP_PERMISSIONS.HAUL_APPROVE,
  CAMP_PERMISSIONS.MEAL_ORDER,
  CAMP_PERMISSIONS.MEAL_ACCEPT,
  CAMP_PERMISSIONS.REPORT_VIEW,
]);

export const CAMP_PERMISSION_AVAILABILITY: Readonly<Record<CampPermission, CampReleaseScope>> = Object.fromEntries(
  CAMP_PERMISSION_CODES.map((c) => [c, V2_CODES.has(c) ? 'v2' : 'v1']),
) as Record<CampPermission, CampReleaseScope>;

/** Каталогт байхгүй (DB-д шинээр нэмэгдсэн, код шинэчлэгдээгүй) код → 'v2' (UI-д нуугдана, аюулгүй тал) */
export function campPermissionAvailableIn(code: string): CampReleaseScope {
  return isCampPermission(code) ? CAMP_PERMISSION_AVAILABILITY[code] : 'v2';
}
