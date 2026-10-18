import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import HrLayout from './components/HrLayout'
import { HR_DEFAULT_SECTION } from './lib/hr-sections'

// v0.2.2 Блок 6 (PIL-10): хуудас бүр тусдаа chunk (Suspense — Layout-ийн Outlet)
const HrHomePage = lazy(() => import('./pages/HrHomePage'))
const HrImportPage = lazy(() => import('./pages/HrImportPage'))
const EmployeesPage = lazy(() => import('./pages/EmployeesPage'))
const DepartmentsPage = lazy(() => import('./pages/DepartmentsPage'))
const CrewsPage = lazy(() => import('./pages/CrewsPage'))
const ShiftsPage = lazy(() => import('./pages/ShiftsPage'))
const AttendancePage = lazy(() => import('./pages/AttendancePage'))
const HrPositionsPage = lazy(() => import('./pages/HrPositionsPage'))
const HrUsersPage = lazy(() => import('./pages/HrUsersPage'))
const EmployeeProfilePage = lazy(() => import('./pages/EmployeeProfilePage'))

/**
 * /hr/* — v0.2.2 H2 «Хүний нөөц» ([[ADR-006_HR_Core_Module]] §5.1).
 * `/hr` → сүүлийн / ганц ажлын байр · `/hr/positions` → тэр ажлын байрны «Албан тушаал» (tenant каталог).
 * Param нэр `campId` (H-Q1) — зөөсөн хуудсууд `useParams().campId`-г хэвээр ашиглана.
 */
export default function HrRoutes() {
  return (
    <Routes>
      <Route index element={<HrHomePage />} />
      <Route path="positions" element={<HrHomePage section="positions" />} />
      <Route path=":campId" element={<HrLayout />}>
        <Route index element={<Navigate to={HR_DEFAULT_SECTION} replace />} />
        <Route path="employees" element={<EmployeesPage />} />
        <Route path="employees/:employeeId" element={<EmployeeProfilePage />} />
        <Route path="departments" element={<DepartmentsPage />} />
        <Route path="crews" element={<CrewsPage />} />
        <Route path="shifts" element={<ShiftsPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="import" element={<HrImportPage />} />
        <Route path="positions" element={<HrPositionsPage />} />
        <Route path="users" element={<HrUsersPage />} />
        <Route path="*" element={<Navigate to={HR_DEFAULT_SECTION} replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/hr" replace />} />
    </Routes>
  )
}
