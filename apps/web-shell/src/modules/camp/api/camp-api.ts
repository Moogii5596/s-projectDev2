import apiClient from '../../../api/client'
import type {
  Building,
  Camp,
  CampSettings,
  CampUser,
  Crew,
  Department,
  MealLocation,
  MyPermissions,
  Organization,
  OrgServiceType,
  OrgType,
  PermissionDef,
  Role,
  Room,
  RoomStatus,
  ShiftSegment,
  UserRole,
} from './types'

const V1 = '/api/v1/camp'
const campUrl = (campId: string, path = '') => `${V1}/camps/${campId}${path}`
const get = async <T>(url: string, params?: object): Promise<T> => (await apiClient.get<T>(url, { params })).data
const post = async <T>(url: string, body?: unknown): Promise<T> => (await apiClient.post<T>(url, body ?? {})).data
const patch = async <T>(url: string, body: unknown): Promise<T> => (await apiClient.patch<T>(url, body)).data
const put = async <T>(url: string, body: unknown): Promise<T> => (await apiClient.put<T>(url, body)).data
const del = async <T>(url: string): Promise<T> => (await apiClient.delete<T>(url)).data

// ── Эрх ──────────────────────────────────────────────────────
export const campApi = {
  myPermissions: (campId?: string) => get<MyPermissions>(`${V1}/me/permissions`, campId ? { campId } : undefined),
  permissions: () => get<PermissionDef[]>(`${V1}/permissions`),
  users: () => get<CampUser[]>(`${V1}/users`),
  roles: () => get<Role[]>(`${V1}/roles`),
  createRole: (body: { name: string; description?: string | null; permissionCodes?: string[] }) => post<Role>(`${V1}/roles`, body),
  updateRole: (id: string, body: { name?: string; description?: string | null }) => patch<Role>(`${V1}/roles/${id}`, body),
  deleteRole: (id: string) => del<unknown>(`${V1}/roles/${id}`),
  setRolePermissions: (id: string, permissionCodes: string[]) => put<Role>(`${V1}/roles/${id}/permissions`, { permissionCodes }),
  userRoles: (q: { userId?: string; roleId?: string; campId?: string } = {}) => get<UserRole[]>(`${V1}/user-roles`, q),
  assignUserRole: (body: { userId: string; roleId: string; campId: string | null }) => post<unknown>(`${V1}/user-roles`, body),
  removeUserRole: (id: string) => del<unknown>(`${V1}/user-roles/${id}`),

  // ── Кемп ───────────────────────────────────────────────────
  camps: (activeOnly = false) => get<Camp[]>(`${V1}/camps`, { activeOnly }),
  camp: (campId: string) => get<Camp>(campUrl(campId)),
  createCamp: (body: { code: string; name: string; location?: string | null }) => post<Camp>(`${V1}/camps`, body),
  updateCamp: (campId: string, body: { name?: string; location?: string | null; isActive?: boolean }) => patch<Camp>(campUrl(campId), body),

  // ── Байгууллага (tenant түвшин) ────────────────────────────
  organizations: (q: { activeOnly?: boolean; serviceType?: OrgServiceType } = {}) => get<Organization[]>(`${V1}/organizations`, q),
  createOrganization: (body: OrganizationInput) => post<Organization>(`${V1}/organizations`, body),
  updateOrganization: (id: string, body: Partial<OrganizationInput> & { isActive?: boolean }) => patch<Organization>(`${V1}/organizations/${id}`, body),

  // ── Тохиргоо ───────────────────────────────────────────────
  settings: (campId: string) => get<CampSettings>(campUrl(campId, '/settings')),
  saveSettings: (campId: string, body: SettingsInput) => put<CampSettings>(campUrl(campId, '/settings'), body),
  mealLocations: (campId: string) => get<MealLocation[]>(campUrl(campId, '/meal-locations')),
  createMealLocation: (campId: string, name: string) => post<MealLocation>(campUrl(campId, '/meal-locations'), { name }),
  updateMealLocation: (campId: string, id: string, body: { name?: string; isActive?: boolean }) =>
    patch<MealLocation>(campUrl(campId, `/meal-locations/${id}`), body),

  // ── Байр, өрөө ─────────────────────────────────────────────
  buildings: (campId: string) => get<Building[]>(campUrl(campId, '/buildings')),
  createBuilding: (campId: string, body: { code: string; name: string }) => post<Building>(campUrl(campId, '/buildings'), body),
  updateBuilding: (campId: string, id: string, body: { name?: string; isActive?: boolean }) => patch<Building>(campUrl(campId, `/buildings/${id}`), body),
  rooms: (campId: string, q: { buildingId?: string; status?: RoomStatus } = {}) => get<Room[]>(campUrl(campId, '/rooms'), q),
  createRoom: (campId: string, body: RoomInput & { buildingId: string }) => post<Room>(campUrl(campId, '/rooms'), body),
  updateRoom: (campId: string, id: string, body: Partial<RoomInput> & { status?: RoomStatus }) => patch<Room>(campUrl(campId, `/rooms/${id}`), body),

  // ── Хэлтэс, баг ────────────────────────────────────────────
  departments: (campId: string) => get<Department[]>(campUrl(campId, '/departments')),
  createDepartment: (campId: string, body: { code: string; name: string; mealLocationId: string; shiftPattern?: ShiftSegment[] }) =>
    post<Department>(campUrl(campId, '/departments'), body),
  updateDepartment: (campId: string, id: string, body: { name?: string; mealLocationId?: string; isActive?: boolean }) =>
    patch<Department>(campUrl(campId, `/departments/${id}`), body),
  setShiftPattern: (campId: string, id: string, segments: ShiftSegment[]) =>
    put<Department>(campUrl(campId, `/departments/${id}/shift-pattern`), { segments }),
  crews: (campId: string) => get<Crew[]>(campUrl(campId, '/crews')),
  createCrew: (campId: string, body: { code: string; name?: string | null; rosterAnchorDate: string }) => post<Crew>(campUrl(campId, '/crews'), body),
  updateCrew: (campId: string, id: string, body: { name?: string | null; rosterAnchorDate?: string; isActive?: boolean }) =>
    patch<Crew>(campUrl(campId, `/crews/${id}`), body),
}

export interface OrganizationInput {
  name: string
  regNumber?: string | null
  orgType: OrgType
  serviceTypes?: OrgServiceType[]
  contactName?: string | null
  phone?: string | null
  email?: string | null
}

export interface SettingsInput {
  vatRate: number
  changeoverWeekday: number
  rosterOnDays: number
  rosterOffDays: number
  mealOrderCutoffTime: string | null
  defaultMealLocationId: string | null
  cateringOrganizationId?: string | null
}

export interface RoomInput {
  roomNo: string
  floor?: number | null
  capacity: number
  note?: string | null
}
