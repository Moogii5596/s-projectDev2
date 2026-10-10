import type { OrgServiceType, OrgType, RoomStatus, ShiftType } from '../api/types'

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
