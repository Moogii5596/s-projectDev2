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
