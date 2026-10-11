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
  /** v0.2.1 (C-12): байрны төрөл (байгууллагын каталог) */
  typeId?: string | null
  type?: { name: string } | null
  /** FB-07 (v0.2.0): нийт өрөө, идэвхтэй өрөө, идэвхтэй өрөөний нийт багтаамж */
  _count?: { rooms: number }
  activeRooms?: number
  capacity?: number
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
  /** v0.2.1 (Д-4): хэлтэст хоолны байршил байхгүй — ажилтан / албан тушаал дээр */
  isActive: boolean
  createdAt: string
  updatedAt: string
  shiftPatterns: ShiftSegment[]
  /** FB-03 (v0.2.0) */
  _count?: { employees: number }
  activeEmployees?: number
  positions?: number
}

export interface Crew {
  id: string
  code: string
  name: string | null
  rosterAnchorDate: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  /** Backend list: бүртгэлтэй ажилтны тоо */
  employeeCount?: number
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
  /** v0.2.2: загвар өөрчлөгдөөд хэрэгжүүлээгүй олголттой хэрэглэгчийн тоо */
  pendingUsers?: number
  createdAt: string
  updatedAt: string
}

/** v0.2.2 — загвар хэрэгжүүлэхийн урьдчилсан харагдац */
export interface RoleApplyPreview {
  roleId: string
  roleName: string
  affectedUsers: number
  items: { userRoleId: string; userId: string; campId: string | null; add: string[]; remove: string[]; user: { id: string; email: string; fullName: string | null } | null }[]
}

export interface UserRole {
  id: string
  createdAt: string
  user: CampUser
  role: { id: string; name: string; isSystem: boolean }
  camp: { id: string; code: string; name: string } | null
}

// ── Шат 8 багц 2: ажилтан, ирц, ээлж, өрөө, хоол ─────────────
export type EmployeeStatus = 'ACTIVE' | 'INACTIVE'
export type MealType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'NIGHT'
export type Direction = 'ARRIVAL' | 'DEPARTURE'
export type MovementKind = 'ROSTER' | 'OFF_ROSTER'
export type ImportStatus = 'PREVIEW' | 'CONFIRMED' | 'CANCELLED'
export type AdjustmentReason = 'EARLY_ARRIVAL' | 'SHIFT_CHANGE' | 'OTHER'
export type ShiftSource = 'ADJUSTMENT' | 'PATTERN' | 'UNIFORM_PATTERN' | 'UNKNOWN'
export type DayPresence = 'ARRIVAL' | 'DEPARTURE' | 'FULL_DAY'

export interface Employee {
  id: string
  employeeCode: string
  fullName: string
  position: string | null
  phone: string | null
  /** v0.2.0 — ADR-003-ын бэлтгэл */
  email?: string | null
  status: EmployeeStatus
  organizationId: string
  departmentId: string
  crewId: string | null
  createdAt: string
  updatedAt: string
  organization: { name: string }
  department: { code: string; name: string }
  crew: { code: string } | null
  /** v0.2.1 (Q1, Д-2): каталогийн албан тушаал; ажилтны өөрийн утга (null = албан тушаалаас / анхдагч) */
  positionId?: string | null
  mealLocationId?: string | null
  mealsIncluded?: boolean | null
  positionRef?: { name: string } | null
  /** Эцсийн (эффектив) утга ба эх сурвалж */
  effective?: EmployeeEffective
}

export type ValueSource = 'EMPLOYEE' | 'POSITION' | 'DEFAULT'
export interface EmployeeEffective {
  mealLocationId: string | null
  mealLocationName: string | null
  mealLocationSource: ValueSource
  mealsIncluded: boolean
  mealsIncludedSource: ValueSource
}

/** v0.2.1 — байгууллагын каталог (албан тушаал, байрны төрөл) */
export interface CatalogItem {
  id: string
  name: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  /** албан тушаал: идэвхтэй ажилтны тоо (бүх кемп) */
  activeEmployees?: number
  /** байрны төрөл: байрны тоо */
  buildings?: number
}
export type CatalogKind = 'positions' | 'building-types'

/** v0.2.1 — кемп × албан тушаалын анхдагч */
export interface PositionSetting {
  positionId: string
  name: string
  isActive: boolean
  activeEmployees: number
  mealLocationId: string | null
  mealLocationName: string | null
  mealsIncluded: boolean | null
  shiftPattern: ShiftSegment[]
}

/** v0.2.1 (C-14) — D өдрийн ирцийн жагсаалт */
export type StayShiftGroup = 'DAY' | 'NIGHT' | 'UNKNOWN' | 'MOVEMENT'
export interface Stay {
  id: string
  startDate: string
  endDate: string | null
  dayType: 'ARRIVAL' | 'DEPARTURE' | 'FULL_DAY'
  shiftGroup: StayShiftGroup
  positionName: string | null
  mealsIncluded: boolean
  employee: { id: string; employeeCode: string; fullName: string; department: { code: string; name: string }; crew: { code: string } | null }
}

export interface Page<T> {
  data: T[]
  nextCursor: string | null
  hasMore: boolean
}

export interface ImportRow {
  row: number
  employeeCode: string
  employeeId: string | null
  date: string | null
  direction: Direction | null
  kind: MovementKind | null
  meals: MealType[] | null
  shift: ShiftType | null
  errors: string[]
}

export interface ImportHeader {
  id: string
  fileName: string
  status: ImportStatus
  totalRows: number
  okRows: number
  errorRows: number
  createdAt: string
  confirmedAt?: string | null
}

export interface ImportPreview {
  import: ImportHeader
  rows: ImportRow[]
  summary: { arrivals: number; departures: number; offRoster: number; shiftAdjustments: number; errorRows: number }
}

export interface ImportConfirmResult {
  status: 'CONFIRMED'
  movements: number
  newStays: number
  closedStays: number
  adjustments: number
}

/** CONFIRM 409 үед: { message, errors: [{ row, employeeCode, messages }] } */
export interface ImportRowError {
  row: number
  employeeCode: string
  messages: string[]
}

export interface Movement {
  id: string
  movementDate: string
  direction: Direction
  kind: MovementKind
  meals: MealType[]
  importId: string | null
  createdAt: string
  employee: { id: string; employeeCode: string; fullName: string; position?: string | null; department: { code: string }; crew: { code: string } | null }
}

export interface ShiftAdjustment {
  id: string
  startDate: string
  endDate: string
  shift: ShiftType
  reasonType: AdjustmentReason
  reason: string | null
  createdAt: string
  employee: { id: string; employeeCode: string; fullName: string }
  createdByUser: { email: string; fullName: string | null }
}

export interface CalendarCell {
  date: string
  shift: ShiftType | null
  source: ShiftSource
  dayNo: number | null
  presence: DayPresence | null
}

export interface ShiftCalendar {
  from: string
  to: string
  days: string[]
  employees: { id: string; employeeCode: string; fullName: string; departmentCode: string; crewCode: string | null; cells: CalendarCell[] }[]
}

export interface RoomAllocation {
  id: string
  startDate: string
  endDate: string | null
  room: { id: string; roomNo: string; building: { code: string } }
  employee: { id: string; employeeCode: string; fullName: string; crew: { code: string } | null }
}

export interface BoardOccupant {
  id: string
  employeeCode: string
  fullName: string
  crewCode: string | null
  presentTonight: boolean
  /** FB-12 (v0.2.0) */
  status?: EmployeeStatus
}

export interface BoardRoom {
  id: string
  roomNo: string
  floor: number | null
  capacity: number
  roomStatus: RoomStatus
  building: { code: string; name: string }
  allocatedCount: number
  presentCount: number
  occupancy: 'VACANT' | 'PARTIAL' | 'FULL'
  overCapacity: boolean
  /** FB-12 (v0.2.0): идэвхгүй ажилтан хуваарилагдсан хэвээр */
  inactiveOccupants?: number
  occupants: BoardOccupant[]
  /** v0.2.1 (C-12): өрөөний хөрөнгө (актлагдаагүй), нээлттэй засвар */
  assets?: { id: string; inventoryNo: string; name: string; condition: AssetCondition }[]
  openMaintenance?: { id: string; requestNo: string; title: string; priority: MaintenancePriority; status: MaintenanceStatus; blocksRoom: boolean }[]
}

export interface RoomBoard {
  date: string
  rooms: BoardRoom[]
  totals: { rooms: number; capacity: number; present: number; vacant: number; full: number }
  unassigned: { id: string; employeeCode: string; fullName: string; departmentCode: string; crewCode: string | null }[]
}

export interface Presence {
  date: string
  presentCount: number
  /** v0.2.1 (C-04): кемпэд байгаа ч хоол авдаггүй (presentCount-д орсон) */
  noMealCount?: number
  byPosition?: { positionName: string | null; mealType: MealType; mealLocationId: string | null; count: number }[]
  lines: { mealType: MealType; mealLocationId: string | null; mealLocationName: string | null; count: number }[]
  breakdown: { departmentCode: string; group: string; mealType: MealType; mealLocationId: string | null; count: number }[]
  personDays: string
  warnings: {
    unknownShift: { employeeId: string; employeeCode: string; fullName: string; departmentCode: string }[]
    noDefaultMealLocation: boolean
  }
}

// ── Шат 8 багц 3: хөрөнгө, засвар ───────────────────────────
export type AssetCondition = 'GOOD' | 'DAMAGED' | 'WRITTEN_OFF'
export type MaintenanceStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CLOSED' | 'CANCELLED'
export type MaintenancePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
export type PartSource = 'MINE_SUPPLIED' | 'CATERING_PURCHASED'
export type MaintenanceAction = 'start' | 'complete' | 'reopen' | 'close' | 'cancel'

export interface AssetCategory {
  id: string
  name: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface Asset {
  id: string
  campId: string
  categoryId: string
  inventoryNo: string
  name: string
  serialNo: string | null
  roomId: string | null
  /** v0.2.1 (C-12): өрөөгүй, байранд */
  buildingId?: string | null
  condition: AssetCondition
  /** 'YYYY-MM-DD' */
  acquiredDate: string | null
  /** '1500000.50' */
  acquiredCost: string | null
  note: string | null
  createdAt: string
  updatedAt: string
  category: { name: string }
  room: { roomNo: string; building: { code: string } } | null
  building?: { code: string; name: string } | null
  /** зөвхөн дэлгэрэнгүйд */
  openMaintenance?: number
}

export interface AssetMovement {
  id: string
  fromRoomId: string | null
  toRoomId: string | null
  movedAt: string
  reason: string | null
  fromRoom: { roomNo: string; building?: { code: string } } | null
  toRoom: { roomNo: string; building?: { code: string } } | null
  /** v0.2.1 */
  fromBuilding?: { code: string } | null
  toBuilding?: { code: string } | null
  movedByUser: { fullName: string | null; email: string }
}

export interface MaintenancePart {
  id: string
  partName: string
  /** '2' / '1.5' */
  quantity: string
  unit: string
  /** '11000.00' | null */
  unitPrice: string | null
  vatIncluded: boolean
  source: PartSource
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface VatAmounts {
  net: string
  vat: string
  gross: string
}

export interface MaintenanceRequest {
  id: string
  campId: string
  requestNo: string
  roomId: string | null
  assetId: string | null
  title: string
  description: string | null
  priority: MaintenancePriority
  status: MaintenanceStatus
  statusLabel: string
  blocksRoom: boolean
  reportedBy: string
  startedAt: string | null
  completedAt: string | null
  closedBy: string | null
  closedAt: string | null
  cancelReason: string | null
  createdAt: string
  updatedAt: string
  room: { roomNo: string; status: RoomStatus; building: { code: string } } | null
  asset: { inventoryNo: string; name: string } | null
  reportedByUser: { fullName: string | null; email: string } | null
}

export interface MaintenanceDetail extends MaintenanceRequest {
  parts: MaintenancePart[]
  cost: { vatRate: string; lines: ({ partId: string } & VatAmounts)[]; total: VatAmounts }
}

/** Үүсгэх / төлөв шилжүүлэх хариу */
export interface MaintenanceMutationResult extends MaintenanceDetail {
  warnings?: string[]
  roomReleased?: boolean
  costEntries?: number
}

// ── v0.2.0 §0.5 — Мастер өгөгдлийн импорт/экспорт ─────────────
export type DataImportType = 'employees' | 'departments'
export type ExportType = DataImportType | 'rooms'
export type DataRowOp = 'create' | 'update' | 'unchanged' | 'error'
export interface DataRowError {
  column?: string
  columnLabel: string | null
  code: string
  message: string
}
export interface DataImportRow {
  row: number
  op: DataRowOp
  opLabel: string
  values: Record<string, string | number | boolean | null>
  changes: Record<string, { from: unknown; to: unknown }>
  errors: DataRowError[]
}
export interface DataImportHeader {
  id: string
  type: 'EMPLOYEES' | 'DEPARTMENTS'
  source: 'XLSX' | 'GRID'
  fileName: string | null
  status: ImportStatus
  totalRows: number
  createRows: number
  updateRows: number
  unchangedRows: number
  errorRows: number
  createdAt: string
  confirmedAt: string | null
}
export interface DataImportPreview {
  import: DataImportHeader
  rows: DataImportRow[]
}
export interface DataImportResult {
  status: 'CONFIRMED'
  created: number
  updated: number
  skipped: number
  unchanged: number
}
/** FB-07 */
export interface BulkRoomsInput {
  from: number
  to: number
  prefix?: string
  padTo?: number
  floor?: number | null
  capacity: number
  skipExisting?: boolean
}
