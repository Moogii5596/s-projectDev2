import type {
  AdjustmentReason,
  Direction,
  EmployeeStatus,
  ImportStatus,
  MealType,
  MovementKind,
  OrgServiceType,
  OrgType,
  RoomStatus,
  ShiftType,
} from '../api/types'

export const WEEKDAYS = ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба'] as const

export const ORG_TYPE_LABEL: Record<OrgType, string> = {
  MAIN: 'Үндсэн (уурхай)',
  SUBCONTRACTOR: 'Туслан гүйцэтгэгч',
  CONTRACTOR: 'Гэрээт байгууллага',
}

export const ORG_SERVICE_LABEL: Record<OrgServiceType, string> = {
  CATERING: 'Катеринг',
  WASTE_TRANSPORT: 'Хог тээвэрлэгч',
  SEWAGE_TRANSPORT: 'Бохир ус тээвэрлэгч',
  WASTE_DISPOSAL: 'Хог хүлээн авах цэг',
  SEWAGE_DISPOSAL: 'Бохир ус хүлээн авах цэг',
  OTHER: 'Бусад',
}

export const ROOM_STATUS_LABEL: Record<RoomStatus, string> = {
  ACTIVE: 'Идэвхтэй',
  MAINTENANCE: 'Засварт',
  INACTIVE: 'Идэвхгүй',
}

export const SHIFT_LABEL: Record<ShiftType, string> = { DAY: 'Өдөр', NIGHT: 'Шөнө' }

export const SYSTEM_ROLE_LABEL: Record<string, string> = {
  CAMP_ADMIN: 'Системийн роль · Кемп админ',
  CAMP_MANAGER: 'Системийн роль · Кемп менежер',
  CATERING_ADMIN: 'Системийн роль · Катеринг админ',
}

export const MEAL_LABEL: Record<MealType, string> = { BREAKFAST: 'Өглөө', LUNCH: 'Өдөр', DINNER: 'Орой', NIGHT: 'Шөнө' }
export const MEAL_ORDER: MealType[] = ['BREAKFAST', 'LUNCH', 'DINNER', 'NIGHT']
export const DIRECTION_LABEL: Record<Direction, string> = { ARRIVAL: 'Ирэх', DEPARTURE: 'Явах' }
export const KIND_LABEL: Record<MovementKind, string> = { ROSTER: 'Ростер', OFF_ROSTER: 'Ээлжийн бус' }
export const IMPORT_STATUS_LABEL: Record<ImportStatus, string> = { PREVIEW: 'Урьдчилсан', CONFIRMED: 'Баталгаажсан', CANCELLED: 'Цуцалсан' }
export const REASON_LABEL: Record<AdjustmentReason, string> = { EARLY_ARRIVAL: 'Эрт ирсэн', SHIFT_CHANGE: 'Ээлж солигдсон', OTHER: 'Бусад' }
export const EMPLOYEE_STATUS_LABEL: Record<EmployeeStatus, string> = { ACTIVE: 'Идэвхтэй', INACTIVE: 'Идэвхгүй' }
/** Хоолны задаргааны бүлэг (backend PresenceBreakdown.group) */
export const PRESENCE_GROUP_LABEL: Record<string, string> = { DAY: 'Өдрийн ээлж', NIGHT: 'Шөнийн ээлж', UNKNOWN: 'Ээлж тодорхойгүй', MOVEMENT: 'Ирэх/явах өдөр' }
