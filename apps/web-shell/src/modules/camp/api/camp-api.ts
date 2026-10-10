import apiClient from '../../../api/client'
import type {
  AdjustmentReason,
  Building,
  Camp,
  CampSettings,
  CampUser,
  Crew,
  Department,
  Direction,
  Employee,
  EmployeeStatus,
  ImportConfirmResult,
  ImportHeader,
  ImportPreview,
  MealLocation,
  MealType,
  Movement,
  MyPermissions,
  Organization,
  OrgServiceType,
  OrgType,
  Page,
  PermissionDef,
  Presence,
  Role,
  Room,
  RoomAllocation,
  RoomBoard,
  RoomStatus,
  ShiftAdjustment,
  ShiftCalendar,
  ShiftSegment,
  ShiftType,
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

  // ── Ажилтан ────────────────────────────────────────────────
  employees: (campId: string, q: EmployeeQuery) => get<Page<Employee>>(campUrl(campId, '/employees'), q),
  createEmployee: (campId: string, body: EmployeeInput) => post<Employee>(campUrl(campId, '/employees'), body),
  updateEmployee: (campId: string, id: string, body: Partial<EmployeeInput> & { status?: EmployeeStatus }) =>
    patch<Employee>(campUrl(campId, `/employees/${id}`), body),

  // ── Ирц ────────────────────────────────────────────────────
  /** Загвар xlsx (JWT-тэй тул blob-оор татна) */
  importTemplate: async (campId: string): Promise<Blob> =>
    (await apiClient.get<Blob>(campUrl(campId, '/movement-imports/template'), { responseType: 'blob' })).data,
  /**
   * multipart: Content-Type-ийг 'multipart/form-data' болгож өгнө — client-ийн анхдагч 'application/json' үлдвэл
   * axios FormData-г JSON болгон хувиргана. Browser boundary-г өөрөө нэмнэ.
   */
  uploadImport: async (campId: string, file: File): Promise<ImportPreview> => {
    const form = new FormData()
    form.append('file', file)
    return (await apiClient.post<ImportPreview>(campUrl(campId, '/movement-imports'), form, { headers: { 'Content-Type': 'multipart/form-data' } })).data
  },
  imports: (campId: string) => get<ImportHeader[]>(campUrl(campId, '/movement-imports')),
  confirmImport: (campId: string, id: string) => post<ImportConfirmResult>(campUrl(campId, `/movement-imports/${id}/confirm`)),
  cancelImport: (campId: string, id: string) => post<unknown>(campUrl(campId, `/movement-imports/${id}/cancel`)),
  movements: (campId: string, q: { from: string; to: string; employeeId?: string }) => get<Movement[]>(campUrl(campId, '/movements'), q),
  createMovement: (campId: string, body: { employeeId: string; date: string; direction: Direction; meals?: MealType[]; shift?: ShiftType }) =>
    post<unknown>(campUrl(campId, '/movements'), body),
  deleteMovement: (campId: string, id: string) => del<unknown>(campUrl(campId, `/movements/${id}`)),

  // ── Ээлж ───────────────────────────────────────────────────
  shiftCalendar: (campId: string, q: { from: string; to: string; departmentId?: string; crewId?: string }) =>
    get<ShiftCalendar>(campUrl(campId, '/shift-calendar'), q),
  shiftAdjustments: (campId: string, q: { from: string; to: string; employeeId?: string }) => get<ShiftAdjustment[]>(campUrl(campId, '/shift-adjustments'), q),
  createShiftAdjustments: (
    campId: string,
    body: { employeeIds: string[]; startDate: string; endDate: string; shift: ShiftType; reasonType: AdjustmentReason; reason?: string | null },
  ) => post<{ created: number }>(campUrl(campId, '/shift-adjustments'), body),
  deleteShiftAdjustment: (campId: string, id: string) => del<unknown>(campUrl(campId, `/shift-adjustments/${id}`)),

  // ── Өрөө ───────────────────────────────────────────────────
  roomBoard: (campId: string, date: string) => get<RoomBoard>(campUrl(campId, '/room-board'), { date }),
  roomAllocations: (campId: string, q: { date?: string; roomId?: string; employeeId?: string }) => get<RoomAllocation[]>(campUrl(campId, '/room-allocations'), q),
  allocateRoom: (campId: string, body: { employeeId: string; roomId: string; startDate: string; replaceCurrent?: boolean }) =>
    post<unknown>(campUrl(campId, '/room-allocations'), body),
  endAllocation: (campId: string, id: string, endDate: string) => post<unknown>(campUrl(campId, `/room-allocations/${id}/end`), { endDate }),

  // ── Хоол ───────────────────────────────────────────────────
  presence: (campId: string, date: string) => get<Presence>(campUrl(campId, '/presence'), { date }),
}

export interface EmployeeQuery {
  cursor?: string
  limit?: number
  q?: string
  departmentId?: string
  crewId?: string
  organizationId?: string
  status?: EmployeeStatus
}

export interface EmployeeInput {
  organizationId: string
  departmentId: string
  crewId?: string | null
  employeeCode: string
  fullName: string
  position?: string | null
  phone?: string | null
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
