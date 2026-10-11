import i18n from '../../../i18n'
import type { AssetMovement } from '../api/types'

/** v0.2.1 (C-12) — хөрөнгийн байршлын нэр, сонголтын кодчлол (цэвэр функц, unit тест) */
/** Байршил: өрөө (B1-101) · байр (v0.2.1, C-12: "B1 (байранд)") · агуулах */
export const roomLabel = (a: { room: { roomNo: string; building: { code: string } } | null; building?: { code: string } | null }) =>
  a.room ? `${a.room.building.code}-${a.room.roomNo}` : a.building ? i18n.t('camp.asset.in_building', { code: a.building.code }) : i18n.t('camp.asset.warehouse')
const moveSide = (room: { roomNo: string; building?: { code: string } } | null, building: { code: string } | null | undefined) =>
  room ? (room.building ? `${room.building.code}-${room.roomNo}` : room.roomNo) : building ? i18n.t('camp.asset.in_building', { code: building.code }) : i18n.t('camp.asset.warehouse')
export const movementFrom = (h: AssetMovement) => moveSide(h.fromRoom, h.fromBuilding)
export const movementTo = (h: AssetMovement) => moveSide(h.toRoom, h.toBuilding)

/** Байршлын сонголтын утга: '' = агуулах, 'r:<id>' = өрөө, 'b:<id>' = байр (өрөөгүй) */
export function decodeLocation(v: string): { roomId: string | null; buildingId: string | null } {
  if (v.startsWith('r:')) return { roomId: v.slice(2), buildingId: null }
  if (v.startsWith('b:')) return { roomId: null, buildingId: v.slice(2) }
  return { roomId: null, buildingId: null }
}

