import apiClient from '../../../api/client'
import type { MealOrderLineView, MealOrderListItem, MealOrderView } from './meal-order-types'
import type {
  Asset,
  AssetCategory,
  AssetCondition,
  AssetMovement,
  Building,
  Camp,
  CampSettings,
  CampUser,
  CampTemplateScope,
  CreateEmployeeUserResult,
  InviteChannel,
  InviteOptions,
  InviteResult,
  PositionTemplates,
  UserPermissions,
  MealLocation,
  MealType,
  MaintenanceAction,
  MaintenanceDetail,
  MaintenanceMutationResult,
  MaintenancePart,
  MaintenancePriority,
  MaintenanceRequest,
  MaintenanceStatus,
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
  ShiftSegment,
  UserRole,
  BulkRoomsInput,
  CatalogItem,
  CatalogKind,
  PositionSetting,
  Stay,
  StayShiftGroup,
} from './types'

const V1 = '/api/v1/camp'
/** v0.2.3 Блок 3 (ADR-007 B3-1): роль, эрх — системийн түвшин (хуучин `/camp/...` v0.2.4-т устгана) */
const RBAC = '/api/v1/core/rbac'
/** v0.2.2 H2: tenant-түвшний HR/Core нөөц шинэ замаар (ADR-006 §5.1); байрны төрөл Кемпэд */
const CORE_ORGS = '/api/v1/core/organizations'
const CATALOG_BASE: Record<CatalogKind, string> = { positions: '/api/v1/hr/positions', 'building-types': `${V1}/building-types` }
const campUrl = (campId: string, path = '') => `${V1}/camps/${campId}${path}`
const get = async <T>(url: string, params?: object): Promise<T> => (await apiClient.get<T>(url, { params })).data
const post = async <T>(url: string, body?: unknown): Promise<T> => (await apiClient.post<T>(url, body ?? {})).data
const patch = async <T>(url: string, body: unknown): Promise<T> => (await apiClient.patch<T>(url, body)).data
const put = async <T>(url: string, body: unknown): Promise<T> => (await apiClient.put<T>(url, body)).data
const del = async <T>(url: string): Promise<T> => (await apiClient.delete<T>(url)).data

// ── Эрх ──────────────────────────────────────────────────────
export const campApi = {
  myPermissions: (campId?: string) => get<MyPermissions>(`${RBAC}/me/permissions`, campId ? { campId } : undefined),
  permissions: () => get<PermissionDef[]>(`${RBAC}/permissions`),
  users: () => get<CampUser[]>(`${RBAC}/users`),
  roles: () => get<Role[]>(`${RBAC}/roles`),
  createRole: (body: { name: string; description?: string | null; permissionCodes?: string[] }) => post<Role>(`${RBAC}/roles`, body),
  updateRole: (id: string, body: { name?: string; description?: string | null }) => patch<Role>(`${RBAC}/roles/${id}`, body),
  deleteRole: (id: string) => del<unknown>(`${RBAC}/roles/${id}`),
  setRolePermissions: (id: string, permissionCodes: string[]) => put<Role>(`${RBAC}/roles/${id}/permissions`, { permissionCodes }),
  /** v0.2.2 — загвар өөрчилсний дараа хэрэглэгчдэд хэрэгжүүлэх (автоматаар биш) */
  roleApplyPreview: (id: string) => get<RoleApplyPreview>(`${RBAC}/roles/${id}/apply-preview`),
  applyRole: (id: string) => post<{ roleId: string; affectedUsers: number; added: number; removed: number }>(`${RBAC}/roles/${id}/apply`, {}),
  /** v0.2.2 Блок 4 (B4-Q2): идэвхгүй болгох / сэргээх */
  setUserActive: (userId: string, isActive: boolean) => patch<{ id: string; isActive: boolean }>(`${RBAC}/users/${userId}`, { isActive }),
  /** Блок 3: ажилтны картаас нэвтрэх эрх (email: undefined = картынх, null = имэйлгүй) */
  createEmployeeUser: (campId: string, employeeId: string, email?: string | null) =>
    post<CreateEmployeeUserResult>(campUrl(campId, `/employees/${employeeId}/create-user`), email === undefined ? {} : { email }),
  inviteUser: (userId: string, channel: InviteChannel) => post<InviteResult>(`${RBAC}/users/${userId}/invites`, { channel }),
  inviteOptions: () => get<InviteOptions>(`${RBAC}/invites/options`),
  userPermissions: (userId: string) => get<UserPermissions>(`${RBAC}/users/${userId}/permissions`),
  grantDirect: (userId: string, body: { permissionCode: string; campId: string | null }) => post<unknown>(`${RBAC}/users/${userId}/permissions`, body),
  revokeDirect: (id: string) => del<unknown>(`${RBAC}/user-permissions/${id}`),
  positionTemplates: (positionId: string) => get<PositionTemplates>(`${RBAC}/positions/${positionId}/role-templates`),
  setPositionTemplates: (positionId: string, templates: { roleId: string; scope: CampTemplateScope }[]) =>
    put<PositionTemplates>(`${RBAC}/positions/${positionId}/role-templates`, { templates }),
  applyPositionTemplates: (positionId: string) => post<{ positionId: string; users: number }>(`${RBAC}/positions/${positionId}/role-templates/apply`, {}),
  userRoles: (q: { userId?: string; roleId?: string; campId?: string } = {}) => get<UserRole[]>(`${RBAC}/user-roles`, q),
  assignUserRole: (body: { userId: string; roleId: string; campId: string | null }) => post<unknown>(`${RBAC}/user-roles`, body),
  removeUserRole: (id: string) => del<unknown>(`${RBAC}/user-roles/${id}`),

  // ── Кемп ───────────────────────────────────────────────────
  camps: (activeOnly = false) => get<Camp[]>(`${V1}/camps`, { activeOnly }),
  camp: (campId: string) => get<Camp>(campUrl(campId)),
  createCamp: (body: { code: string; name: string; location?: string | null }) => post<Camp>(`${V1}/camps`, body),
  updateCamp: (campId: string, body: { name?: string; location?: string | null; isActive?: boolean }) => patch<Camp>(campUrl(campId), body),

  // ── Байгууллага (tenant түвшин, Core) ────────────────────────────
  organizations: (q: { activeOnly?: boolean; serviceType?: OrgServiceType } = {}) => get<Organization[]>(CORE_ORGS, q),
  createOrganization: (body: OrganizationInput) => post<Organization>(CORE_ORGS, body),
  updateOrganization: (id: string, body: Partial<OrganizationInput> & { isActive?: boolean }) => patch<Organization>(`${CORE_ORGS}/${id}`, body),

  // ── v0.2.1: байгууллагын каталог (албан тушаал, байрны төрөл) ──
  catalog: (kind: CatalogKind, activeOnly = false) => get<CatalogItem[]>(CATALOG_BASE[kind], { activeOnly }),
  createCatalogItem: (kind: CatalogKind, name: string) => post<CatalogItem>(CATALOG_BASE[kind], { name }),
  updateCatalogItem: (kind: CatalogKind, id: string, body: { name?: string; isActive?: boolean }) => patch<CatalogItem>(`${CATALOG_BASE[kind]}/${id}`, body),
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

  // ── Хоолны захиалга (v0.2.3 Блок 6а, V2-03) ─────────────────
  mealOrders: (campId: string, q: { from: string; to: string }) => get<MealOrderListItem[]>(campUrl(campId, '/meal-orders'), q),
  mealOrder: (campId: string, date: string) => get<MealOrderView>(campUrl(campId, `/meal-orders/${date}`)),
  saveMealOrder: (campId: string, date: string, body: { note?: string | null; lines: MealOrderLineView[] }) =>
    put<MealOrderView>(campUrl(campId, `/meal-orders/${date}`), body),
  deleteMealOrder: (campId: string, date: string) => del<void>(campUrl(campId, `/meal-orders/${date}`)),
  addMealExtra: (campId: string, date: string, body: { mealType: MealType; mealLocationId: string; guestCount: number; note: string }) =>
    post<MealOrderView>(campUrl(campId, `/meal-orders/${date}/extras`), body),
  removeMealExtra: (campId: string, date: string, extraId: string) => del<MealOrderView>(campUrl(campId, `/meal-orders/${date}/extras/${extraId}`)),
  /** submit | accept | reject{reason} | request-change{reason,lines} | withdraw-change | approve-change | reject-change{reason} */
  mealOrderAction: (campId: string, date: string, action: MealOrderApiAction, body?: unknown) =>
    post<MealOrderView>(campUrl(campId, `/meal-orders/${date}/${action}`), body),
  mealTemplate: (campId: string) => get<{ lines: MealOrderLineView[] }>(campUrl(campId, '/meal-order-template')),
  saveMealTemplate: (campId: string, lines: MealOrderLineView[]) => put<{ lines: MealOrderLineView[] }>(campUrl(campId, '/meal-order-template'), { lines }),
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

  /** v0.2.1 (C-14): D өдөр кемпэд байгаа хүмүүс, тооцоолсон ээлжтэй */
  stays: (campId: string, date: string, shift?: StayShiftGroup) => get<Stay[]>(campUrl(campId, '/stays'), { date, ...(shift ? { shift } : {}) }),

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

export interface OrganizationInput {
  name: string
  regNumber?: string | null
  orgType: OrgType
  serviceTypes?: OrgServiceType[]
  contactName?: string | null
  phone?: string | null
  email?: string | null
}

export type MealOrderApiAction =
  | 'submit'
  | 'accept'
  | 'reject'
  | 'request-change'
  | 'withdraw-change'
  | 'approve-change'
  | 'reject-change'

export interface SettingsInput {
  vatRate: number
  changeoverWeekday: number
  rosterOnDays: number
  rosterOffDays: number
  mealOrderCutoffTime: string | null
  defaultMealLocationId: string | null
  cateringOrganizationId?: string | null
  /** v0.2.3 R7 — өгөөгүй бол өөрчлөхгүй */
  autoCodePrefix?: string
  /** v0.2.3 Блок 6а — өгөөгүй бол өөрчлөхгүй */
  mealOrderLeadDays?: number
  mealOrderAfterCutoff?: 'BLOCK' | 'APPROVAL' | 'FREE'
  mealOrderRequiresAccept?: boolean
  mealOrderEditAfterAccept?: 'FORBID' | 'ALLOW' | 'TWO_SIDED'
  mealOrderDefaultFill?: 'EMPTY' | 'COPY_PREV' | 'TEMPLATE'
  mealOrderAllowSelfAccept?: boolean
}

export interface RoomInput {
  roomNo: string
  floor?: number | null
  capacity: number
  note?: string | null
}
