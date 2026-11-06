/**
 * Camp Module — эрхийн каталог (Шат 2.1). v0.2.3 (ADR-007): эх нь системийн түвшинд —
 * `modules/core/permissions/permission-registry.ts` (`core_permissions`). Энэ файл нь одоогийн импортын замыг
 * хадгалах re-export (Блок 3-т guard/декоратор шинэ модуль руу шилжинэ).
 */
import {
  PERMISSIONS,
  PERMISSION_AVAILABILITY,
  PERMISSION_CODES,
  isPermission,
  permissionAvailableIn,
  type Permission,
  type ReleaseScope,
} from '../../core/permissions/permission-registry';

export const CAMP_PERMISSIONS = PERMISSIONS;
export type CampPermission = Permission;
export const CAMP_PERMISSION_CODES: readonly CampPermission[] = PERMISSION_CODES;
export const isCampPermission = isPermission;
export type CampReleaseScope = ReleaseScope;
export const CAMP_PERMISSION_AVAILABILITY = PERMISSION_AVAILABILITY;
export const campPermissionAvailableIn = permissionAvailableIn;
