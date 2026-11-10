import { visibleSettingsSections } from './settings-registry'
export { canSeeSettingsSection, visibleSettingsSections } from './settings-registry'
export type { SettingsSection } from './settings-registry'

/**
 * v0.2.3 Блок 3 (PIL-19, ADR-007 B3-3) — цэс, хэсгийг нуух дүрмийн ГАНЦ эх сурвалж.
 * Backend-ийн шалгалтыг дагана (зөрвөл хэрэглэгч «эрх алга» харна эсвэл эрхтэй хэсгээ харахгүй):
 *   - уншихад: `requireAccess(campId)` = тухайн ажлын байранд (эсвэл бүх ажлын байранд) ямар нэг эрх, эсвэл OWNER / ADMIN
 *   - хэрэглэгч, роль, эрх, орчуулга: `requireTenantAdmin` = OWNER / ADMIN (SEC-009)
 *   - байгууллага (Системийн тохиргоо): засах = бүх ажлын байрны `camp.master.manage` (уншихыг цэсэнд харуулахгүй — зөвхөн удирдагчид)
 *   - модулийн дээд цэс (Хүний нөөц / Кемп): тухайн модулийн эрх аль нэг ажлын байранд (`me/permissions.modules`) эсвэл админ.
 * Цэвэр функц (API импортгүй, FE-005); backend үйлдэл бүрийг дахин шалгана.
 */
export interface AccessSnapshot {
  isTenantAdmin: boolean
  /** бүх ажлын байранд хүчинтэй эрх (campId-гүй `me/permissions`) */
  permissions: string[]
  byCamp: Record<string, string[]>
  /** эрхтэй модулиуд (`hr`, `camp`) — backend v0.2.3+ */
  modules?: string[]
}

export type AppModuleKey = 'hr' | 'camp'

const MASTER_MANAGE = 'camp.master.manage'

/** Дээд цэсний модуль харагдах эсэх */
export function canSeeModule(a: AccessSnapshot | undefined, mod: AppModuleKey): boolean {
  if (!a) return false
  if (a.isTenantAdmin) return true
  // v0.2.3-аас өмнөх backend (`modules` алга) → нуухгүй (backend шалгана)
  if (!a.modules) return true
  return a.modules.includes(mod)
}

/** Нүүр зам: эхний харагдах модуль (Кемп → Хүний нөөц → Системийн тохиргоо); юу ч алга бол null */
export function firstVisiblePath(a: AccessSnapshot | undefined, enabled: { camp: boolean; hr: boolean }): string | null {
  if (enabled.camp && canSeeModule(a, 'camp')) return '/camp'
  if (enabled.hr && canSeeModule(a, 'hr')) return '/hr'
  if (visibleSettingsSections(a).length > 0) return '/settings'
  return null
}

/** Ажлын байранд (campId) уншиж хандах эрхтэй эсэх — backend `CampAccessService.hasAccess` */
export function hasSiteAccess(a: AccessSnapshot | undefined, campId: string): boolean {
  if (!a) return false
  if (a.isTenantAdmin || a.permissions.length > 0) return true
  return (a.byCamp[campId]?.length ?? 0) > 0
}

/** Хандах эрхтэй ажлын байрууд (сонгогчид) */
export function accessibleSites<T extends { id: string }>(a: AccessSnapshot | undefined, sites: readonly T[]): T[] {
  return sites.filter((s) => hasSiteAccess(a, s.id))
}

type Rule = 'access' | 'admin'

/** «Хүний нөөц»-ийн хэсэг → дүрэм (`hr-sections.ts`-ийн HR_SECTIONS) */
const HR_SECTION_RULE: Readonly<Record<string, Rule>> = {
  employees: 'access',
  users: 'admin',
  departments: 'access',
  crews: 'access',
  shifts: 'access',
  attendance: 'access',
  import: 'access',
  positions: 'access',
}

export function canSeeHrSection(a: AccessSnapshot | undefined, campId: string, section: string): boolean {
  const rule = HR_SECTION_RULE[section]
  if (!a || !rule) return false
  return rule === 'admin' ? a.isTenantAdmin : hasSiteAccess(a, campId)
}

/** «Кемпийн тохиргоо» (`/camp/system`) — кемп, байрны төрөл, хөрөнгийн ангилал: удирдах = админ эсвэл бүх кемпийн master.manage */
export function canManageCampSystem(a: AccessSnapshot | undefined): boolean {
  return !!a && (a.isTenantAdmin || a.permissions.includes(MASTER_MANAGE))
}
