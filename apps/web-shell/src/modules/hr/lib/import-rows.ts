import type { Crew, Department, ImportPreview, ImportRow, ImportRowEdit, Organization } from '../api/camp-bridge'

/**
 * v0.2.3 Блок R4.4–R4.6 — PREVIEW хүснэгт (цэвэр): шүүлт, эх мөрийн байрлал / нэр, засварын горимын payload.
 * Дүрэм (R-10): алдаатай мөрийг алгасаж батлахгүй — засах / устгах; бүх мөр зөв үед л CONFIRM.
 */
export type RowFilter = 'errors' | 'warnings' | 'all'

export const hasErrors = (r: ImportRow) => !r.deleted && r.errors.length > 0
const hasWarnings = (r: ImportRow) => !r.deleted && (r.warnings?.length ?? 0) > 0

export function filterRows(rows: ImportRow[], f: RowFilter): ImportRow[] {
  if (f === 'errors') return rows.filter(hasErrors)
  if (f === 'warnings') return rows.filter(hasWarnings)
  return rows
}

/** Алдаатай байвал «алдаатай», эс бөгөөс анхааруулгатай байвал «анхааруулгатай», эс бөгөөс «бүгд» */
export function defaultFilter(p: ImportPreview): RowFilter {
  if (p.rows.some(hasErrors)) return 'errors'
  if (p.rows.some(hasWarnings)) return 'warnings'
  return 'all'
}

export function filterCounts(rows: ImportRow[]): Record<RowFilter, number> {
  return { errors: rows.filter(hasErrors).length, warnings: rows.filter(hasWarnings).length, all: rows.length }
}

/** Эх байрлал: ShiftChange → «хуудас · мөр», «Ирц» загвар → мөрийн дугаар */
export const rowPlace = (r: ImportRow): string => (r.source ? `${r.source.sheet} · ${r.source.row}` : String(r.row))

/** Файл дахь нэр (ShiftChange) */
export const fileName = (r: ImportRow): string => (r.source ? `${r.source.lastName} ${r.source.firstName}`.trim() : '')

/** Ажилтан хайх анхдагч утга: файлын нэр (нэр → овог) эсвэл код */
export const pickerQuery = (r: ImportRow): string => (r.source ? r.source.firstName || r.source.lastName : r.employeeCode).trim()

/** R9: шинэ ажилтны байгууллага / хэлтэс / баг */
export interface NewEmployeeDraft {
  organizationId: string
  departmentId: string
  crewId: string
}

/** Засварын горимын мөр бүрийн сонголт */
export interface RowDraft {
  employeeId?: string
  deleted?: boolean
  /** R9: 'new' = шинэ ажилтан бүртгэх */
  mode?: 'existing' | 'new'
  newEmployee?: NewEmployeeDraft
}

/** Засварын горим → PATCH payload (өөрчлөгдсөн мөр л; устгах нь ажилтан солихоос давуу) */
export function buildEdits(rows: ImportRow[], drafts: Record<number, RowDraft>): ImportRowEdit[] {
  const out: ImportRowEdit[] = []
  for (const r of rows) {
    const d = drafts[r.row]
    if (!d) continue
    if (d.deleted !== undefined && d.deleted !== !!r.deleted) out.push({ row: r.row, deleted: d.deleted })
    else if (!d.deleted && d.mode === 'new') {
      if (newReady(d.newEmployee)) out.push({ row: r.row, newEmployee: { ...d.newEmployee, crewId: d.newEmployee.crewId || null } })
    } else if (!d.deleted && d.employeeId && d.employeeId !== r.employeeId) out.push({ row: r.row, employeeId: d.employeeId })
  }
  return out
}

/** R4.6 — «Алдаатай бүх мөрийг устгах» */
export const deleteErrorRowsEdits = (rows: ImportRow[]): ImportRowEdit[] => rows.filter(hasErrors).map((r) => ({ row: r.row, deleted: true }))

// ── R9 — шинэ ажилтан бүртгэх ─────────────────────────────

/** Зөвхөн ShiftChange мөр (овог, нэр файлд) */
export const canRegisterNew = (r: ImportRow): boolean => !!r.source && !!(r.source.firstName || r.source.lastName)

const norm = (v: string | null | undefined) => (v ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

const newReady = (n: NewEmployeeDraft | undefined): n is NewEmployeeDraft => !!n && !!n.organizationId && !!n.departmentId

/** Файлын «Хэлтэс» → хэлтэс (код эсвэл нэрээр, идэвхтэй) */
export function matchDepartment(text: string | undefined, depts: Department[]): string {
  const t = norm(text)
  if (!t) return ''
  return depts.find((d) => d.isActive && (norm(d.code) === t || norm(d.name) === t))?.id ?? ''
}

/** Файлын «Shift» (A–D …) → баг (кодоор, идэвхтэй) */
export function matchCrew(letter: string | null | undefined, crews: Crew[]): string {
  const t = norm(letter)
  if (!t) return ''
  return crews.find((c) => c.isActive && norm(c.code) === t)?.id ?? ''
}

/** Анхдагч байгууллага: идэвхтэй үндсэн (MAIN) ганц бол түүнийг; эс бөгөөс ганц байгууллага; эс бөгөөс сонгоогүй */
export function defaultOrganization(orgs: Organization[]): string {
  const active = orgs.filter((o) => o.isActive)
  const main = active.filter((o) => o.orgType === 'MAIN')
  if (main.length === 1) return main[0].id
  return active.length === 1 ? active[0].id : ''
}

export function newEmployeeDefaults(r: ImportRow, orgs: Organization[], depts: Department[], crews: Crew[]): NewEmployeeDraft {
  return { organizationId: defaultOrganization(orgs), departmentId: matchDepartment(r.source?.department, depts), crewId: matchCrew(r.source?.crew, crews) }
}

/** «Шинэ» горимтой боловч байгууллага / хэлтэс сонгоогүй мөрийн тоо (хадгалахыг хаана) */
export const incompleteNew = (drafts: Record<number, RowDraft>): number =>
  Object.values(drafts).filter((d) => !d.deleted && d.mode === 'new' && !newReady(d.newEmployee)).length
