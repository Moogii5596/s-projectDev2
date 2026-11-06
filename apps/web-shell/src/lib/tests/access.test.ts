import { describe, expect, it } from 'vitest'
import {
  accessibleSites,
  canManageCampSystem,
  canSeeHrSection,
  canSeeModule,
  canSeeSettingsSection,
  firstVisiblePath,
  hasSiteAccess,
  visibleSettingsSections,
  type AccessSnapshot,
} from '../access'

const admin: AccessSnapshot = { isTenantAdmin: true, permissions: [], byCamp: {}, modules: ['camp', 'hr'] }
/** «Ажилтан» загвар: зөвхөн C1-д засварын хүсэлт */
const employee: AccessSnapshot = { isTenantAdmin: false, permissions: [], byCamp: { c1: ['camp.maintenance.create'] }, modules: ['camp'] }
/** HR: C2-т ажилтан бүртгэл */
const hrClerk: AccessSnapshot = { isTenantAdmin: false, permissions: [], byCamp: { c2: ['hr.employee.manage'] }, modules: ['hr'] }
/** Бүх кемпийн мастер өгөгдөл */
const master: AccessSnapshot = { isTenantAdmin: false, permissions: ['camp.master.manage'], byCamp: {}, modules: ['camp'] }
const nobody: AccessSnapshot = { isTenantAdmin: false, permissions: [], byCamp: {}, modules: [] }

describe('access (PIL-19, ADR-007 B3-3)', () => {
  it('canSeeModule: admin бүгд; модулийн эрхтэй л; ачаалагдаагүй → false; хуучин backend (modules алга) → нуухгүй', () => {
    expect(canSeeModule(admin, 'hr')).toBe(true)
    expect(canSeeModule(employee, 'hr')).toBe(false)
    expect(canSeeModule(employee, 'camp')).toBe(true)
    expect(canSeeModule(hrClerk, 'camp')).toBe(false)
    expect(canSeeModule(undefined, 'camp')).toBe(false)
    expect(canSeeModule({ isTenantAdmin: false, permissions: [], byCamp: {} }, 'hr')).toBe(true)
  })

  it('hasSiteAccess / accessibleSites = backend hasAccess (global эрх → бүх ажлын байр)', () => {
    expect(hasSiteAccess(employee, 'c1')).toBe(true)
    expect(hasSiteAccess(employee, 'c2')).toBe(false)
    expect(hasSiteAccess(master, 'c9')).toBe(true)
    expect(accessibleSites(hrClerk, [{ id: 'c1' }, { id: 'c2' }])).toEqual([{ id: 'c2' }])
    expect(accessibleSites(admin, [{ id: 'c1' }])).toEqual([{ id: 'c1' }])
  })

  it('HR хэсэг: «Хэрэглэгч» зөвхөн админ; бусад — ажлын байранд хандах эрх', () => {
    expect(canSeeHrSection(admin, 'c1', 'users')).toBe(true)
    expect(canSeeHrSection(hrClerk, 'c2', 'users')).toBe(false)
    expect(canSeeHrSection(hrClerk, 'c2', 'employees')).toBe(true)
    expect(canSeeHrSection(hrClerk, 'c1', 'employees')).toBe(false)
    expect(canSeeHrSection(hrClerk, 'c2', 'unknown')).toBe(false)
  })

  it('Системийн тохиргоо: админ 4 хэсэг; бүх кемпийн master.manage → зөвхөн байгууллага; бусад → юу ч үгүй', () => {
    expect(visibleSettingsSections(admin)).toEqual(['roles', 'user-roles', 'organizations', 'translations'])
    expect(visibleSettingsSections(master)).toEqual(['organizations'])
    expect(visibleSettingsSections(employee)).toEqual([])
    expect(canSeeSettingsSection(admin, 'nope')).toBe(false)
    expect(canManageCampSystem(master)).toBe(true)
    expect(canManageCampSystem(employee)).toBe(false)
  })

  it('firstVisiblePath: Кемп → Хүний нөөц → Тохиргоо → null', () => {
    const on = { camp: true, hr: true }
    expect(firstVisiblePath(employee, on)).toBe('/camp')
    expect(firstVisiblePath(hrClerk, on)).toBe('/hr')
    expect(firstVisiblePath({ ...master, modules: [] }, on)).toBe('/settings')
    expect(firstVisiblePath(nobody, on)).toBeNull()
    expect(firstVisiblePath(employee, { camp: false, hr: true })).toBeNull()
  })
})
