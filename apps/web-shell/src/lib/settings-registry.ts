import type { AccessSnapshot } from './access'
import { MODULE_SETTINGS_SECTIONS } from './modules'

export const SETTINGS_SECTIONS = MODULE_SETTINGS_SECTIONS
export type SettingsPermission = (typeof SETTINGS_SECTIONS)[number]['permission']
export type SettingsModule = (typeof SETTINGS_SECTIONS)[number]['module']

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]['key']

function hasPermissionAnywhere(access: AccessSnapshot, permission: string): boolean {
  return access.permissions.includes(permission) || Object.values(access.byCamp).some((codes) => codes.includes(permission))
}

export function canSeeSettingsSection(access: AccessSnapshot | undefined, section: string): boolean {
  const item = SETTINGS_SECTIONS.find((entry) => entry.key === section)
  if (!access || !item) return false
  if (item.module !== 'core' && access.modules && !access.modules.includes(item.module)) return false
  if (access.isTenantAdmin) return true
  if (item.permission === 'tenant-admin') return false
  return hasPermissionAnywhere(access, item.permission)
}

export function visibleSettingsSections(access: AccessSnapshot | undefined): SettingsSection[] {
  return SETTINGS_SECTIONS.filter((item) => canSeeSettingsSection(access, item.key)).map((item) => item.key)
}
