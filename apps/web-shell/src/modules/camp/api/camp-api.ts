import apiClient from '../../../api/client'
import type {
  AdjustmentReason,
  Asset,
  AssetCategory,
  AssetCondition,
  AssetMovement,
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
  MaintenanceAction,
  MaintenanceDetail,
  MaintenanceMutationResult,
  MaintenancePart,
  MaintenancePriority,
  MaintenanceRequest,
  MaintenanceStatus,
  MealType,
  Movement,
  PartSource,
  MyPermissions,
  Organization,
  OrgServiceType,
  OrgType,
  Page,
  PermissionDef,
  Presence,
  Role,
  RoleApplyPreview,
  Room,
  RoomAllocation,
  RoomBoard,
  RoomStatus,
  ShiftAdjustment,
  ShiftCalendar,
  ShiftSegment,
  ShiftType,
  UserRole,
  BulkRoomsInput,
  DataImportPreview,
  DataImportResult,
  DataImportType,
  ExportType,
  CatalogItem,
  CatalogKind,
  PositionSetting,
  Stay,
  StayShiftGroup,
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
  /** v0.2.2 — загвар өөрчилсний дараа хэрэглэгчдэд хэрэгжүүлэх (автоматаар биш) */
  roleApplyPreview: (id: string) => get<RoleApplyPreview>(`${V1}/roles/${id}/apply-preview`),
  applyRole: (id: string) => post<{ roleId: string; affectedUsers: number; added: number; removed: number }>(`${V1}/roles/${id}/apply`, {}),
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

  // ── v0.2.1: байгууллагын каталог (албан тушаал, байрны төрөл) ──
  catalog: (kind: CatalogKind, activeOnly = false) => get<CatalogItem[]>(`${V1}/${kind}`, { activeOnly }),
  createCatalogItem: (kind: CatalogKind, name: string) => post<CatalogItem>(`${V1}/${kind}`, { name }),
  updateCatalogItem: (kind: CatalogKind, id: string, body: { name?: string; isActive?: boolean }) => patch<CatalogItem>(`${V1}/${kind}/${id}`, body),
  positionSettings: (campId: string) => get<PositionSetting[]>(campUrl(campId, '/position-settings')),
  savePositionSetting: (
    campId: string,
    positionId: string,
    body: { mealLocationId?: string | null; mealsIncluded?: boolean | null; shiftPattern?: ShiftSegment[] },
  ) => put<unknown>(campUrl(campId, `/position-settings/${positionId}`), body),

  // ── Тохиргоо ───────────────────────────────────────────────
  settings: (campId: string) => get<CampSettings>(campUrl(campId, '/settings')),
  saveSettings: (campId: string, body: SettingsInput) => put<CampSettings>(campUrl(campId, '/settings'), body),
  mealLocations: (campId: string) => get<MealLocation[]>(campUrl(campId, '/meal-locations')),
  createMealLocation: (campId: string, name: string) => post<MealLocation>(campUrl(campId, '/meal-locations'), { name }),
  updateMealLocation: (campId: string, id: string, body: { name?: string; isActive?: boolean }) =>
    patch<MealLocation>(campUrl(campId, `/meal-locations/${id}`), body),

  // ── Байр, өрөө ─────────────────────────────────────────────
  buildings: (campId: string) => get<Building[]>(campUrl(campId, '/buildings')),
  createBuilding: (campId: string, body: { code: string; name: string; typeId?: string | null; rooms?: BulkRoomsInput }) =>
    post<Building & { roomsCreated?: number; roomsSkipped?: string[] }>(campUrl(campId, '/buildings'), body),
  /** FB-07 (v0.2.0) */
  bulkRooms: (campId: string, buildingId: string, body: BulkRoomsInput) =>
    post<{ created: number; skipped: string[] }>(campUrl(campId, `/buildings/${buildingId}/rooms/bulk`), body),
  updateBuilding: (campId: string, id: string, body: { name?: string; isActive?: boolean; typeId?: string | null }) => patch<Building>(campUrl(campId, `/buildings/${id}`), body),
  rooms: (campId: string, q: { buildingId?: string; status?: RoomStatus } = {}) => get<Room[]>(campUrl(campId, '/rooms'), q),
  createRoom: (campId: string, body: RoomInput & { buildingId: string }) => post<Room>(campUrl(campId, '/rooms'), body),
  updateRoom: (campId: string, id: string, body: Partial<RoomInput> & { status?: RoomStatus }) => patch<Room>(campUrl(campId, `/rooms/${id}`), body),

  // ── Хэлтэс, баг ────────────────────────────────────────────
  departments: (campId: string) => get<Department[]>(campUrl(campId, '/departments')),
  createDepartment: (campId: string, body: { code: string; name: string; shiftPattern?: ShiftSegment[] }) =>
    post<Department>(campUrl(campId, '/departments'), body),
  updateDepartment: (campId: string, id: string, body: { name?: string; isActive?: boolean }) =>
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
  /** v0.2.1 (Д-2): олон ажилтанд нэг дор (≤ 500) — null = цэвэрлэх (албан тушаалаас / анхдагч) */
  bulkEmployees: (campId: string, body: { ids: string[]; mealsIncluded?: boolean | null; mealLocationId?: string | null; positionId?: string | null }) =>
    post<{ updated: number }>(campUrl(campId, '/employees/bulk'), body),

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
  movements: (campId: string, q: MovementQuery) => get<Movement[]>(campUrl(campId, '/movements'), q),
  /** v0.2.1 (C-14): D өдөр кемпэд байгаа хүмүүс, тооцоолсон ээлжтэй */
  stays: (campId: string, date: string, shift?: StayShiftGroup) => get<Stay[]>(campUrl(campId, '/stays'), { date, ...(shift ? { shift } : {}) }),
  /** FB-14 (v0.2.0): олон ажилтны ирц → импортын урсгал (PREVIEW) */
  manualMovements: (campId: string, body: { date: string; direction: Direction; meals?: MealType[] | null; shift?: ShiftType; employeeIds: string[] }) =>
    post<ImportPreview>(campUrl(campId, '/movement-imports/manual'), body),
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

  // ── Хөрөнгө ────────────────────────────────────────────────
  assetCategories: (activeOnly = false) => get<AssetCategory[]>(`${V1}/asset-categories`, { activeOnly }),
  createAssetCategory: (name: string) => post<AssetCategory>(`${V1}/asset-categories`, { name }),
  updateAssetCategory: (id: string, body: { name?: string; isActive?: boolean }) => patch<AssetCategory>(`${V1}/asset-categories/${id}`, body),
  assets: (campId: string, q: AssetQuery) => get<Page<Asset>>(campUrl(campId, '/assets'), q),
  asset: (campId: string, id: string) => get<Asset>(campUrl(campId, `/assets/${id}`)),
  createAsset: (campId: string, body: AssetInput & { roomId?: string | null; buildingId?: string | null }) => post<Asset>(campUrl(campId, '/assets'), body),
  updateAsset: (campId: string, id: string, body: Partial<AssetInput>) => patch<Asset>(campUrl(campId, `/assets/${id}`), body),
  moveAsset: (campId: string, id: string, body: { toRoomId: string | null; toBuildingId?: string | null; reason?: string | null }) => post<Asset>(campUrl(campId, `/assets/${id}/move`), body),
  writeOffAsset: (campId: string, id: string, reason: string) => post<Asset>(campUrl(campId, `/assets/${id}/write-off`), { reason }),
  assetMovements: (campId: string, id: string) => get<AssetMovement[]>(campUrl(campId, `/assets/${id}/movements`)),

  // ── v0.2.0 §0.5: мастер өгөгдлийн импорт/экспорт ─────────
  dataTemplate: async (campId: string, type: DataImportType): Promise<Blob> =>
    (await apiClient.get<Blob>(campUrl(campId, `/data-imports/${type}/template`), { responseType: 'blob' })).data,
  dataUploadXlsx: async (campId: string, type: DataImportType, file: File): Promise<DataImportPreview> => {
    const form = new FormData()
    form.append('file', file)
    return (await apiClient.post<DataImportPreview>(campUrl(campId, `/data-imports/${type}`), form, { headers: { 'Content-Type': 'multipart/form-data' } })).data
  },
  dataUploadRows: (campId: string, type: DataImportType, rows: Record<string, unknown>[]) => post<DataImportPreview>(campUrl(campId, `/data-imports/${type}`), { rows }),
  dataConfirm: (campId: string, type: DataImportType, id: string, skipErrors: boolean) =>
    post<DataImportResult>(campUrl(campId, `/data-imports/${type}/${id}/confirm`), { skipErrors }),
  dataCancel: (campId: string, type: DataImportType, id: string) => post<unknown>(campUrl(campId, `/data-imports/${type}/${id}/cancel`)),
  exportFile: async (campId: string, type: ExportType): Promise<{ blob: Blob; fileName: string }> => {
    const res = await apiClient.get<Blob>(campUrl(campId, `/export/${type}`), { responseType: 'blob' })
    const cd = String(res.headers['content-disposition'] ?? '')
    const m = /filename="([^"]+)"/.exec(cd)
    return { blob: res.data, fileName: m?.[1] ?? `${type}.xlsx` }
  },

  // ── Засвар ─────────────────────────────────────────────────
  maintenanceList: (campId: string, q: MaintenanceQuery) => get<Page<MaintenanceRequest>>(campUrl(campId, '/maintenance'), q),
  maintenance: (campId: string, id: string) => get<MaintenanceDetail>(campUrl(campId, `/maintenance/${id}`)),
  createMaintenance: (
    campId: string,
    body: { roomId?: string; assetId?: string; title: string; description?: string | null; priority?: MaintenancePriority; blocksRoom?: boolean },
  ) => post<MaintenanceMutationResult>(campUrl(campId, '/maintenance'), body),
  updateMaintenance: (campId: string, id: string, body: { title?: string; description?: string | null; priority?: MaintenancePriority }) =>
    patch<MaintenanceDetail>(campUrl(campId, `/maintenance/${id}`), body),
  /** start | complete | reopen | close | cancel (cancel → reason заавал) */
  transitionMaintenance: (campId: string, id: string, action: MaintenanceAction, reason?: string) =>
    post<MaintenanceMutationResult>(campUrl(campId, `/maintenance/${id}/${action}`), action === 'cancel' ? { reason } : {}),
  addPart: (campId: string, id: string, body: PartInput) => post<MaintenancePart>(campUrl(campId, `/maintenance/${id}/parts`), body),
  updatePart: (campId: string, id: string, partId: string, body: Partial<PartInput>) => patch<MaintenancePart>(campUrl(campId, `/maintenance/${id}/parts/${partId}`), body),
  removePart: (campId: string, id: string, partId: string) => del<unknown>(campUrl(campId, `/maintenance/${id}/parts/${partId}`)),
}

export interface AssetQuery {
  cursor?: string
  limit?: number
  /** өрөөний UUID эсвэл 'warehouse' */
  roomId?: string
  /** v0.2.1: байрны бүх хөрөнгө (байранд + өрөөнүүдэд) */
  buildingId?: string
  categoryId?: string
  condition?: AssetCondition
  q?: string
}

export interface AssetInput {
  categoryId: string
  inventoryNo: string
  name: string
  serialNo?: string | null
  condition?: AssetCondition
  acquiredDate?: string | null
  acquiredCost?: number | null
  note?: string | null
}

export interface MaintenanceQuery {
  cursor?: string
  limit?: number
  status?: MaintenanceStatus
  priority?: MaintenancePriority
  roomId?: string
  assetId?: string
  q?: string
}

export interface PartInput {
  partName: string
  quantity: number
  unit?: string
  unitPrice?: number | null
  vatIncluded?: boolean
  source: PartSource
}

export interface EmployeeQuery {
  cursor?: string
  limit?: number
  q?: string
  departmentId?: string
  crewId?: string
  organizationId?: string
  status?: EmployeeStatus
  /** v0.2.1: UUID эсвэл 'none' */
  positionId?: string
  mealsIncluded?: boolean
}

export interface MovementQuery {
  from: string
  to: string
  employeeId?: string
  /** FB-14 */
  departmentId?: string
  crewId?: string
  position?: string
  q?: string
}

export interface EmployeeInput {
  organizationId: string
  departmentId: string
  crewId?: string | null
  employeeCode: string
  fullName: string
  position?: string | null
  /** v0.2.1 */
  positionId?: string | null
  mealLocationId?: string | null
  mealsIncluded?: boolean | null
  phone?: string | null
  email?: string | null
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
