import type { GridColumn } from '../../camp/components/ImportDialog'

/** v0.2.2 H2: импортын баганууд — ажилтан/хэлтсийн хуудас ба «Импорт» хуудас хуваалцана */
/** FB-08 (v0.2.0): Excel / хүснэгтээр оруулах — баганын түлхүүр backend EMPLOYEES_SPEC-тэй ижил */
export const EMPLOYEE_IMPORT_COLUMNS: GridColumn[] = [
  { key: 'employeeCode', label: 'camp.emp.col.code', required: true },
  { key: 'fullName', label: 'camp.emp.col.full_name', required: true },
  { key: 'position', label: 'camp.emp.col.position' },
  { key: 'mealLocation', label: 'camp.emp.col.meal_location' },
  { key: 'mealsIncluded', label: 'camp.emp.col.meals_included' },
  { key: 'phone', label: 'camp.emp.col.phone' },
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
