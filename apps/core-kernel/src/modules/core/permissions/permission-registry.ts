/**
 * Эрхийн каталог — системийн түвшин (ADR-007, v0.2.3 Блок 2).
 *
 * DB-ийн `core_permissions` / `core_permission_aliases` (20261106005_core_rbac_adr007.sql)-тэй ЯГ ИЖИЛ байх ёстой —
 * integration тест (`test/camp-master.integration.spec.ts`) тулгана.
 * Код: `<модуль>.<объект>.<үйлдэл>` — `hr.*`, `camp.*`, (нөөц) `core.*` (B2-4: core.users/roles код үүсгэхгүй, SEC-009).
 * Шинэ эрх: (1) migration-д `INSERT INTO core_permissions`, (2) энд нэмэх, (3) хэрэгтэй бол `core_seed_default_roles` → `pnpm docs:gen`.
 */
export const PERMISSIONS = {
  SETTINGS_MANAGE: 'camp.settings.manage',
  MASTER_MANAGE: 'camp.master.manage',
  CONTRACT_MANAGE: 'camp.contract.manage',
  EMPLOYEE_MANAGE: 'hr.employee.manage',
  /** v0.2.2 Блок 5 (B5-Q2): ажлаас гаргах, дахин ажилд авах */
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
  /** v0.2.3 Блок 5 (FEED-01): бусдын пост/сэтгэгдэл устгах, report шийдвэрлэх. OWNER/ADMIN — автоматаар */
  FEED_MODERATE: 'feed.content.moderate',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_CODES: readonly Permission[] = Object.values(PERMISSIONS);

const CODE_SET: ReadonlySet<string> = new Set(PERMISSION_CODES);

export function isPermission(code: string): code is Permission {
  return CODE_SET.has(code);
}

/** Кодын модуль (`core_permissions.module`) */
export const permissionModule = (code: string): string => code.split('.')[0] ?? '';

/**
 * ADR-007 B2-6 — хуучин код → шинэ код. **Нэг хувилбар (v0.2.3)**, v0.2.4-т устгана.
 * DB-ийн `core_permission_aliases`-тэй ижил (integration тест тулгана).
 */
export const PERMISSION_ALIASES: Readonly<Record<string, Permission>> = {
  'camp.employee.manage': PERMISSIONS.EMPLOYEE_MANAGE,
  'camp.employee.terminate': PERMISSIONS.EMPLOYEE_TERMINATE,
  'camp.movement.import': PERMISSIONS.MOVEMENT_IMPORT,
  'camp.shift.adjust': PERMISSIONS.SHIFT_ADJUST,
};

/** Q-R3 — устгасан код (юу ч зөвшөөрдөггүй байсан, SEC-009). Оролтод ирвэл алдаа */
export const RETIRED_PERMISSIONS: readonly string[] = ['camp.roles.manage'];

/** API оролт: хуучин кодыг шинэ рүү (alias), бусдыг хэвээр (шалгалтыг дуудагч хийнэ) */
export function normalizePermissionCode(code: string): string {
  return PERMISSION_ALIASES[code] ?? code;
}

const REVERSE_ALIASES: ReadonlyMap<string, string[]> = Object.entries(PERMISSION_ALIASES).reduce((m, [oldCode, newCode]) => {
  m.set(newCode, [...(m.get(newCode) ?? []), oldCode]);
  return m;
}, new Map<string, string[]>());

/**
 * API гаралт (`me/permissions`): шинэ кодын хажууд хуучин alias кодыг нэмнэ — Блок 3-аас өмнөх frontend
 * хуучин кодоор шалгадаг (B2-6). Давхардалгүй, эрэмбэтэй.
 */
export function withLegacyAliases(codes: readonly string[]): string[] {
  const out = new Set(codes);
  for (const c of codes) for (const old of REVERSE_ALIASES.get(c) ?? []) out.add(old);
  return [...out].sort();
}

/**
 * Хувилбарын хүрээ: бохир ус/хог, зардлын тайлан → V2; гэрээ, хоолны захиалга v0.2.3-д хэрэгжсэн.
 * V2 эрх DB/каталогоос УСТГАГДАХГҮЙ, эрх шалгалт өөрчлөгдөхгүй — зөвхөн UI-д нуухад (`core_permissions.available_in`).
 */
export type ReleaseScope = 'v1' | 'v2';

const V2_CODES: ReadonlySet<Permission> = new Set<Permission>([
  PERMISSIONS.HAUL_CREATE,
  PERMISSIONS.HAUL_APPROVE,
  PERMISSIONS.REPORT_VIEW,
]);

export const PERMISSION_AVAILABILITY: Readonly<Record<Permission, ReleaseScope>> = Object.fromEntries(
  PERMISSION_CODES.map((c) => [c, V2_CODES.has(c) ? 'v2' : 'v1']),
) as Record<Permission, ReleaseScope>;

/** Каталогт байхгүй (DB-д шинээр нэмэгдсэн, код шинэчлэгдээгүй) код → 'v2' (UI-д нуугдана, аюулгүй тал) */
export function permissionAvailableIn(code: string): ReleaseScope {
  return isPermission(code) ? PERMISSION_AVAILABILITY[code] : 'v2';
}

/** Анхдагч системийн ролийн код (`core_roles.system_code`, TEXT — B2-5) */
export const SYSTEM_ROLE_CODES = ['CAMP_ADMIN', 'CAMP_MANAGER', 'CATERING_ADMIN', 'EMPLOYEE'] as const;
export type SystemRoleCode = (typeof SYSTEM_ROLE_CODES)[number];
