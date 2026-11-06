import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  PERMISSION_ALIASES,
  PERMISSION_CODES,
  RETIRED_PERMISSIONS,
  isPermission,
  normalizePermissionCode,
  permissionAvailableIn,
  permissionModule,
  withLegacyAliases,
} from '../permission-registry';

describe('permission-registry (ADR-007)', () => {
  it('hr.* код 4, camp.roles.manage алга, модуль = кодын эхний хэсэг', () => {
    expect(PERMISSION_CODES.filter((c) => permissionModule(c) === 'hr')).toEqual([
      'hr.employee.manage', 'hr.employee.terminate', 'hr.attendance.import', 'hr.shift.adjust',
    ]);
    expect(isPermission('camp.roles.manage')).toBe(false);
    expect(RETIRED_PERMISSIONS).toEqual(['camp.roles.manage']);
  });

  it('alias: хуучин → шинэ, шинэ/үл мэдэгдэх код хэвээр; alias бүр каталогт байгаа код руу', () => {
    expect(normalizePermissionCode('camp.employee.manage')).toBe(PERMISSIONS.EMPLOYEE_MANAGE);
    expect(normalizePermissionCode('camp.movement.import')).toBe('hr.attendance.import');
    expect(normalizePermissionCode('hr.shift.adjust')).toBe('hr.shift.adjust');
    expect(normalizePermissionCode('camp.roles.manage')).toBe('camp.roles.manage');
    for (const [oldCode, newCode] of Object.entries(PERMISSION_ALIASES)) {
      expect(isPermission(oldCode)).toBe(false);
      expect(isPermission(newCode)).toBe(true);
    }
  });

  it('withLegacyAliases: шинэ кодын хажууд хуучин alias, давхардалгүй, эрэмбэтэй', () => {
    expect(withLegacyAliases(['hr.shift.adjust', 'camp.room.manage'])).toEqual(['camp.room.manage', 'camp.shift.adjust', 'hr.shift.adjust']);
    expect(withLegacyAliases([])).toEqual([]);
  });

  it('availableIn: V2 код нуугдана, үл мэдэгдэх → v2', () => {
    expect(permissionAvailableIn('hr.employee.manage')).toBe('v1');
    // v0.2.3 Блок 6а: хоолны захиалга гарсан → v1
    expect(permissionAvailableIn('camp.meal.order')).toBe('v1');
    expect(permissionAvailableIn('camp.meal.accept')).toBe('v1');
    expect(permissionAvailableIn('camp.contract.manage')).toBe('v2');
    expect(permissionAvailableIn('core.unknown.x')).toBe('v2');
  });
});
