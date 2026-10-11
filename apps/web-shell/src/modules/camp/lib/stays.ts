import type { Stay, StayShiftGroup } from '../api/types'

/** v0.2.1 (C-14): ирцийн өдрийн жагсаалтын шүүлт (цэвэр функц — unit тест) */
export interface StayFilter {
  group: StayShiftGroup | ''
  departmentCode: string
  /** албан тушаал — хэсэгчилсэн, том/жижиг үсэг үл хамаарна */
  position: string
  /** код эсвэл нэр */
  q: string
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

export function filterStays(rows: Stay[], f: StayFilter): Stay[] {
  const pos = norm(f.position)
  const q = norm(f.q)
  return rows.filter(
    (s) =>
      (!f.group || s.shiftGroup === f.group) &&
      (!f.departmentCode || s.employee.department.code === f.departmentCode) &&
      (!pos || norm(s.positionName ?? '').includes(pos)) &&
      (!q || norm(s.employee.employeeCode).includes(q) || norm(s.employee.fullName).includes(q)),
  )
}
