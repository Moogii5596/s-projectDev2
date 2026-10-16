import apiClient from '../../../api/client'
import type {
  AdjustmentReason,
  Crew,
  DataImportHeader,
  DataImportPreview,
  DataImportResult,
  DataImportType,
  Department,
  Direction,
  Employee,
  EmployeeStatus,
  ExportType,
  ImportConfirmResult,
  ImportHeader,
  ImportPreview,
  MealType,
  Movement,
  Page,
  ShiftAdjustment,
  ShiftCalendar,
  ShiftSegment,
  ShiftType,
} from '../../camp/api/types'

/**
 * v0.2.2 H2 — HR модулийн API client ([[ADR-006_HR_Core_Module]] §5.1).
 * Кемп-түвшний HR нөөц: `/api/v1/hr/sites/:campId/...` (`campId` = «үндсэн ажлын байр», H-Q1).
 * Tenant-түвшин: албан тушаал `/api/v1/hr/positions` (`campApi.catalog('positions')`), байгууллага `/api/v1/core/organizations` (`campApi`).
 * DTO type-ууд backend-тэй ТАМ АДИЛ (RULE-20) — `camp/api/types.ts`-д хэвээр (v0.3-т салгана).
 */
export const HR_V1 = '/api/v1/hr'
export const siteUrl = (campId: string, path = '') => `${HR_V1}/sites/${campId}${path}`
const get = async <T>(url: string, params?: object): Promise<T> => (await apiClient.get<T>(url, { params })).data
const post = async <T>(url: string, body?: unknown): Promise<T> => (await apiClient.post<T>(url, body ?? {})).data
const patch = async <T>(url: string, body: unknown): Promise<T> => (await apiClient.patch<T>(url, body)).data
const put = async <T>(url: string, body: unknown): Promise<T> => (await apiClient.put<T>(url, body)).data
const del = async <T>(url: string): Promise<T> => (await apiClient.delete<T>(url)).data

export const hrApi = {
  // ── Хэлтэс, баг ────────────────────────────────────────────
  departments: (campId: string) => get<Department[]>(siteUrl(campId, '/departments')),
  createDepartment: (campId: string, body: { code: string; name: string; shiftPattern?: ShiftSegment[] }) =>
    post<Department>(siteUrl(campId, '/departments'), body),
  updateDepartment: (campId: string, id: string, body: { name?: string; isActive?: boolean }) =>
    patch<Department>(siteUrl(campId, `/departments/${id}`), body),
  setShiftPattern: (campId: string, id: string, segments: ShiftSegment[]) =>
    put<Department>(siteUrl(campId, `/departments/${id}/shift-pattern`), { segments }),
  crews: (campId: string) => get<Crew[]>(siteUrl(campId, '/crews')),
  createCrew: (campId: string, body: { code: string; name?: string | null; rosterAnchorDate: string }) => post<Crew>(siteUrl(campId, '/crews'), body),
  updateCrew: (campId: string, id: string, body: { name?: string | null; rosterAnchorDate?: string; isActive?: boolean }) =>
    patch<Crew>(siteUrl(campId, `/crews/${id}`), body),

  // ── Ажилтан ────────────────────────────────────────────────
  employees: (campId: string, q: EmployeeQuery) => get<Page<Employee>>(siteUrl(campId, '/employees'), q),
  createEmployee: (campId: string, body: EmployeeInput) => post<Employee>(siteUrl(campId, '/employees'), body),
  updateEmployee: (campId: string, id: string, body: Partial<EmployeeInput> & { status?: EmployeeStatus }) =>
    patch<Employee>(siteUrl(campId, `/employees/${id}`), body),
  /** v0.2.1 (Д-2): олон ажилтанд нэг дор (≤ 500) — null = цэвэрлэх (албан тушаалаас / анхдагч) */
  bulkEmployees: (campId: string, body: { ids: string[]; mealsIncluded?: boolean | null; mealLocationId?: string | null; positionId?: string | null }) =>
    post<{ updated: number }>(siteUrl(campId, '/employees/bulk'), body),

  // ── Ирц ────────────────────────────────────────────────────
  /** Загвар xlsx (JWT-тэй тул blob-оор татна) */
  importTemplate: async (campId: string): Promise<Blob> =>
    (await apiClient.get<Blob>(siteUrl(campId, '/movement-imports/template'), { responseType: 'blob' })).data,
  /**
   * multipart: Content-Type-ийг 'multipart/form-data' болгож өгнө — client-ийн анхдагч 'application/json' үлдвэл
   * axios FormData-г JSON болгон хувиргана. Browser boundary-г өөрөө нэмнэ.
   */
  uploadImport: async (campId: string, file: File): Promise<ImportPreview> => {
    const form = new FormData()
    form.append('file', file)
    return (await apiClient.post<ImportPreview>(siteUrl(campId, '/movement-imports'), form, { headers: { 'Content-Type': 'multipart/form-data' } })).data
  },
  imports: (campId: string) => get<ImportHeader[]>(siteUrl(campId, '/movement-imports')),
  confirmImport: (campId: string, id: string) => post<ImportConfirmResult>(siteUrl(campId, `/movement-imports/${id}/confirm`)),
  cancelImport: (campId: string, id: string) => post<unknown>(siteUrl(campId, `/movement-imports/${id}/cancel`)),
  movements: (campId: string, q: MovementQuery) => get<Movement[]>(siteUrl(campId, '/movements'), q),
  /** FB-14 (v0.2.0): олон ажилтны ирц → импортын урсгал (PREVIEW) */
  manualMovements: (campId: string, body: { date: string; direction: Direction; meals?: MealType[] | null; shift?: ShiftType; employeeIds: string[] }) =>
    post<ImportPreview>(siteUrl(campId, '/movement-imports/manual'), body),
  createMovement: (campId: string, body: { employeeId: string; date: string; direction: Direction; meals?: MealType[]; shift?: ShiftType }) =>
    post<unknown>(siteUrl(campId, '/movements'), body),
  deleteMovement: (campId: string, id: string) => del<unknown>(siteUrl(campId, `/movements/${id}`)),

  // ── Ээлж ───────────────────────────────────────────────────
  shiftCalendar: (campId: string, q: { from: string; to: string; departmentId?: string; crewId?: string }) =>
    get<ShiftCalendar>(siteUrl(campId, '/shift-calendar'), q),
  shiftAdjustments: (campId: string, q: { from: string; to: string; employeeId?: string }) => get<ShiftAdjustment[]>(siteUrl(campId, '/shift-adjustments'), q),
  createShiftAdjustments: (
    campId: string,
    body: { employeeIds: string[]; startDate: string; endDate: string; shift: ShiftType; reasonType: AdjustmentReason; reason?: string | null },
  ) => post<{ created: number }>(siteUrl(campId, '/shift-adjustments'), body),
  deleteShiftAdjustment: (campId: string, id: string) => del<unknown>(siteUrl(campId, `/shift-adjustments/${id}`)),

  // ── v0.2.0 §0.5: мастер өгөгдлийн импорт/экспорт ─────────
  /** H2: мастер өгөгдлийн импортын түүх (сүүлийн 50) */
  dataImports: (campId: string, type?: DataImportType) => get<DataImportHeader[]>(siteUrl(campId, '/data-imports'), type ? { type } : undefined),
  dataTemplate: async (campId: string, type: DataImportType): Promise<Blob> =>
    (await apiClient.get<Blob>(siteUrl(campId, `/data-imports/${type}/template`), { responseType: 'blob' })).data,
  dataUploadXlsx: async (campId: string, type: DataImportType, file: File): Promise<DataImportPreview> => {
    const form = new FormData()
    form.append('file', file)
    return (await apiClient.post<DataImportPreview>(siteUrl(campId, `/data-imports/${type}`), form, { headers: { 'Content-Type': 'multipart/form-data' } })).data
  },
  dataUploadRows: (campId: string, type: DataImportType, rows: Record<string, unknown>[]) => post<DataImportPreview>(siteUrl(campId, `/data-imports/${type}`), { rows }),
  dataConfirm: (campId: string, type: DataImportType, id: string, skipErrors: boolean) =>
    post<DataImportResult>(siteUrl(campId, `/data-imports/${type}/${id}/confirm`), { skipErrors }),
  dataCancel: (campId: string, type: DataImportType, id: string) => post<unknown>(siteUrl(campId, `/data-imports/${type}/${id}/cancel`)),
  exportFile: async (campId: string, type: ExportType): Promise<{ blob: Blob; fileName: string }> => {
    const res = await apiClient.get<Blob>(siteUrl(campId, `/export/${type}`), { responseType: 'blob' })
    const cd = String(res.headers['content-disposition'] ?? '')
    const m = /filename="([^"]+)"/.exec(cd)
    return { blob: res.data, fileName: m?.[1] ?? `${type}.xlsx` }
  },
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
