/**
 * Camp API төрлүүд — backend-ийн хариуны хэлбэр (apps/core-kernel/src/modules/camp/*).
 * Огноо 'YYYY-MM-DD', мөнгө/НӨАТ string ('10.00'), timestamp ISO string.
 */
export type ReleaseScope = 'v1' | 'v2'
export type OrgType = 'MAIN' | 'SUBCONTRACTOR' | 'CONTRACTOR'
export type OrgServiceType = 'CATERING' | 'WASTE_TRANSPORT' | 'SEWAGE_TRANSPORT' | 'WASTE_DISPOSAL' | 'SEWAGE_DISPOSAL' | 'OTHER'
export type RoomStatus = 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE'
export type ShiftType = 'DAY' | 'NIGHT'

export interface Camp {
  id: string
  code: string
  name: string
  location: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface Organization {
  id: string
  name: string
  regNumber: string | null
  orgType: OrgType
  serviceTypes: OrgServiceType[]
  contactName: string | null
  phone: string | null
  email: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CampSettings {
  campId: string
  configured: boolean
  vatRate: string
  changeoverWeekday: number
  rosterOnDays: number
  rosterOffDays: number
  mealOrderCutoffTime: string | null
  defaultMealLocationId: string | null
  cateringOrganizationId: string | null
  updatedAt: string | null
}

export interface MealLocation {
  id: string
  name: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface Building {
  id: string
  code: string
  name: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface Room {
  id: string
  buildingId: string
  roomNo: string
  floor: number | null
  capacity: number
  status: RoomStatus
  note: string | null
  createdAt: string
  updatedAt: string
  building: { code: string; name: string }
}

export interface ShiftSegment {
  dayFrom: number
  dayTo: number
  shift: ShiftType
}

export interface Department {
  id: string
  code: string
  name: string
  mealLocationId: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  mealLocation: { name: string }
  shiftPatterns: ShiftSegment[]
}

export interface Crew {
  id: string
  code: string
  name: string | null
  rosterAnchorDate: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface PermissionDef {
  code: string
  name: string
  sortOrder: number
  availableIn: ReleaseScope
}

export interface MyPermissions {
  userId: string
  isTenantAdmin: boolean
  campId: string | null
  permissions: string[]
  byCamp: Record<string, string[]>
}

export interface CampUser {
  id: string
  email: string
  fullName: string | null
  isActive: boolean
}

export interface Role {
  id: string
  name: string
  description: string | null
  isSystem: boolean
  systemCode: string | null
  permissionCodes: string[]
  userCount: number
  createdAt: string
  updatedAt: string
}

export interface UserRole {
  id: string
  createdAt: string
  user: CampUser
  role: { id: string; name: string; isSystem: boolean }
  camp: { id: string; code: string; name: string } | null
}
