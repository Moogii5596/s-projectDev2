import i18n from '../i18n'

type AdjustmentReason = 'EARLY_ARRIVAL' | 'SHIFT_CHANGE' | 'OTHER'
type AssetCondition = 'GOOD' | 'DAMAGED' | 'WRITTEN_OFF'
type CatalogNameI18n = Partial<Record<'mn' | 'en' | 'zh', string>>
type MaintenancePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
type MaintenanceStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CLOSED' | 'CANCELLED'
type PartSource = 'MINE_SUPPLIED' | 'CATERING_PURCHASED'
type Direction = 'ARRIVAL' | 'DEPARTURE'
type EmployeeStatus = 'ACTIVE' | 'INACTIVE' | 'TERMINATED'
type ImportStatus = 'PREVIEW' | 'CONFIRMED' | 'CANCELLED'
type MealType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'NIGHT'
type MovementKind = 'ROSTER' | 'OFF_ROSTER'
type OrgServiceType = string
type OrgType = 'MAIN' | 'SUBCONTRACTOR' | 'CONTRACTOR'
type RoomStatus = 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE'
type ShiftType = 'DAY' | 'NIGHT'
type StayShiftGroup = 'DAY' | 'NIGHT' | 'UNKNOWN' | 'MOVEMENT'
type TerminationReason = 'RESIGNED' | 'DISMISSED' | 'CONTRACT_END' | 'OTHER'

export function localizedCatalogName(
  entry: { name: string; nameI18n?: CatalogNameI18n | null },
  language: string,
): string {
  const locale = language.toLowerCase().startsWith('zh') ? 'zh' : language.toLowerCase().startsWith('en') ? 'en' : 'mn'
  return entry.nameI18n?.[locale]?.trim() || entry.name
}

/**
 * Enum шошго — v0.2.0 §0.7: орчуулгын түлхүүр `camp.enum.<бүлэг>.<утга>`.
 * Getter-тэй объект: уншихад одоогийн хэлээр (компонент `useTranslation()`-оор дахин render хийгдэнэ).
 */
function labels<K extends string>(group: string, keys: readonly K[]): Record<K, string> {
  const obj = {} as Record<K, string>
  for (const k of keys) Object.defineProperty(obj, k, { enumerable: true, get: () => i18n.t(`camp.enum.${group}.${k}`) })
  return obj
}

/** 0 = Ням … 6 = Бямба */
export const weekdayName = (n: number): string => i18n.t(`camp.weekday.${((n % 7) + 7) % 7}`)
/** Хүснэгтийн толгойд (Да, Мя / Mo, Tu / 一, 二) */
export const weekdayShort = (n: number): string => i18n.t(`camp.weekday_short.${((n % 7) + 7) % 7}`)
export const weekdayNames = (): string[] => [0, 1, 2, 3, 4, 5, 6].map(weekdayName)

export const ORG_TYPE_LABEL = labels<OrgType>('org_type', ['MAIN', 'SUBCONTRACTOR', 'CONTRACTOR'])
export const ORG_SERVICE_LABEL = labels<OrgServiceType>('org_service', ['CATERING', 'WASTE_TRANSPORT', 'SEWAGE_TRANSPORT', 'WASTE_DISPOSAL', 'SEWAGE_DISPOSAL', 'OTHER'])
export const ROOM_STATUS_LABEL = labels<RoomStatus>('room_status', ['ACTIVE', 'MAINTENANCE', 'INACTIVE'])
export const SHIFT_LABEL = labels<ShiftType>('shift', ['DAY', 'NIGHT'])
/** v0.2.1 (C-14): D өдрийн тооцоолсон ээлж */
export const STAY_GROUPS: StayShiftGroup[] = ['DAY', 'NIGHT', 'UNKNOWN', 'MOVEMENT']
export const STAY_GROUP_LABEL = labels<StayShiftGroup>('stay_group', STAY_GROUPS)
export const SYSTEM_ROLE_LABEL = labels<string>('system_role', ['CAMP_ADMIN', 'CAMP_MANAGER', 'CATERING_ADMIN', 'EMPLOYEE'])
export const MEAL_LABEL = labels<MealType>('meal', ['BREAKFAST', 'LUNCH', 'DINNER', 'NIGHT'])
export const MEAL_ORDER: MealType[] = ['BREAKFAST', 'LUNCH', 'DINNER', 'NIGHT']
export const DIRECTION_LABEL = labels<Direction>('direction', ['ARRIVAL', 'DEPARTURE'])
export const KIND_LABEL = labels<MovementKind>('movement_kind', ['ROSTER', 'OFF_ROSTER'])
export const IMPORT_STATUS_LABEL = labels<ImportStatus>('import_status', ['PREVIEW', 'CONFIRMED', 'CANCELLED'])
export const REASON_LABEL = labels<AdjustmentReason>('adjust_reason', ['EARLY_ARRIVAL', 'SHIFT_CHANGE', 'OTHER'])
export const EMPLOYEE_STATUS_LABEL = labels<EmployeeStatus>('employee_status', ['ACTIVE', 'INACTIVE', 'TERMINATED'])
/** v0.2.2 Блок 5 */
export const TERMINATION_REASON_LABEL = labels<TerminationReason>('termination_reason', ['RESIGNED', 'DISMISSED', 'CONTRACT_END', 'OTHER'])
/** Хоолны задаргааны бүлэг (backend PresenceBreakdown.group) */
export const PRESENCE_GROUP_LABEL = labels<string>('presence_group', ['DAY', 'NIGHT', 'UNKNOWN', 'MOVEMENT'])
export const CONDITION_LABEL = labels<AssetCondition>('asset_condition', ['GOOD', 'DAMAGED', 'WRITTEN_OFF'])
export const MAINT_STATUS_LABEL = labels<MaintenanceStatus>('maint_status', ['OPEN', 'IN_PROGRESS', 'DONE', 'CLOSED', 'CANCELLED'])
export const PRIORITY_LABEL = labels<MaintenancePriority>('priority', ['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
export const PART_SOURCE_LABEL = labels<PartSource>('part_source', ['MINE_SUPPLIED', 'CATERING_PURCHASED'])
