import type { GridColumn } from '../../camp/components/ImportDialog'

/** v0.2.2 H2: импортын баганууд — ажилтан/хэлтсийн хуудас ба «Импорт» хуудас хуваалцана */
/** FB-08 (v0.2.0): Excel / хүснэгтээр оруулах — баганын түлхүүр backend EMPLOYEES_SPEC-тэй ижил */
export const EMPLOYEE_IMPORT_COLUMNS: GridColumn[] = [
  { key: 'employeeCode', label: 'camp.emp.col.code', required: true },
  // v0.2.3 Блок D (S1): овог, нэр тусдаа (хуучин «Овог нэр» баганыг backend хүлээн авна)
  { key: 'lastName', label: 'camp.emp.col.last_name' },
  { key: 'firstName', label: 'camp.emp.col.first_name', required: true },
  { key: 'familyName', label: 'camp.emp.col.family_name' },
  { key: 'position', label: 'camp.emp.col.position' },
  { key: 'mealLocation', label: 'camp.emp.col.meal_location' },
  { key: 'mealsIncluded', label: 'camp.emp.col.meals_included' },
  { key: 'phone', label: 'camp.emp.col.phone' },
  { key: 'extraPhones', label: 'camp.emp.col.extra_phones' },
  { key: 'email', label: 'camp.emp.col.email' },
  { key: 'organization', label: 'camp.emp.col.organization', required: true },
  { key: 'department', label: 'camp.emp.col.department', required: true },
  { key: 'crew', label: 'camp.emp.col.crew' },
  { key: 'status', label: 'camp.emp.col.status' },
]

/** FB-02 (v0.2.0): Excel / хүснэгтээр оруулах — баганын түлхүүр backend DEPARTMENTS_SPEC-тэй ижил */
export const DEPARTMENT_IMPORT_COLUMNS: GridColumn[] = [
  { key: 'code', label: 'camp.dept.col.code', required: true },
  { key: 'name', label: 'camp.dept.col.name', required: true },
  { key: 'active', label: 'camp.dept.col.active' },
]

/** v0.2.3 Блок D (S7): ажлаас гарсан ажилтны түүх — backend FORMER_EMPLOYEES_SPEC */
export const FORMER_EMPLOYEE_IMPORT_COLUMNS: GridColumn[] = [
  { key: 'employeeCode', label: 'camp.emp.col.code', required: true },
  { key: 'lastName', label: 'camp.emp.col.last_name' },
  { key: 'firstName', label: 'camp.emp.col.first_name', required: true },
  { key: 'familyName', label: 'camp.emp.col.family_name' },
  { key: 'position', label: 'camp.emp.col.position' },
  { key: 'phone', label: 'camp.emp.col.phone' },
  { key: 'extraPhones', label: 'camp.emp.col.extra_phones' },
  { key: 'email', label: 'camp.emp.col.email' },
  { key: 'organization', label: 'camp.emp.col.organization', required: true },
  { key: 'department', label: 'camp.emp.col.department', required: true },
  { key: 'crew', label: 'camp.emp.col.crew' },
  { key: 'terminatedAt', label: 'hr.term.date', required: true },
  { key: 'terminationReason', label: 'hr.term.reason', required: true },
  { key: 'terminationNote', label: 'hr.import.col.note' },
]

/** v0.2.3 Блок D (S4): албан тушаал — backend POSITIONS_SPEC */
export const POSITION_IMPORT_COLUMNS: GridColumn[] = [
  { key: 'name', label: 'hr.import.col.position_name', required: true },
  { key: 'code', label: 'hr.import.col.position_code' },
  { key: 'active', label: 'camp.dept.col.active' },
]

/** v0.2.3 Блок D (S5): өрөөний тохиргоо — backend facilities.handlers.ts */
export const BUILDING_TYPE_IMPORT_COLUMNS: GridColumn[] = [
  { key: 'name', label: 'hr.import.col.building_type', required: true },
  { key: 'active', label: 'camp.dept.col.active' },
]
export const BUILDING_IMPORT_COLUMNS: GridColumn[] = [
  { key: 'code', label: 'hr.import.col.building_code', required: true },
  { key: 'name', label: 'hr.import.col.building_name', required: true },
  { key: 'type', label: 'hr.import.col.building_type' },
  { key: 'active', label: 'camp.dept.col.active' },
]
export const ROOM_IMPORT_COLUMNS: GridColumn[] = [
  { key: 'building', label: 'hr.import.col.building_code', required: true },
  { key: 'roomNo', label: 'hr.import.col.room_no', required: true },
  { key: 'floor', label: 'hr.import.col.floor' },
  { key: 'capacity', label: 'hr.import.col.capacity', required: true },
  { key: 'status', label: 'camp.common.status' },
  { key: 'note', label: 'hr.import.col.note' },
]

/** v0.2.3 Блок D (S6): өрөөнд байрлуулалт (түүхтэй) — backend ROOM_ALLOCATIONS_SPEC */
export const ROOM_ALLOCATION_IMPORT_COLUMNS: GridColumn[] = [
  { key: 'employeeCode', label: 'camp.emp.col.code', required: true },
  { key: 'building', label: 'hr.import.col.building_code', required: true },
  { key: 'roomNo', label: 'hr.import.col.room_no', required: true },
  { key: 'startDate', label: 'hr.import.col.start_date', required: true },
  { key: 'endDate', label: 'hr.import.col.end_date' },
]
