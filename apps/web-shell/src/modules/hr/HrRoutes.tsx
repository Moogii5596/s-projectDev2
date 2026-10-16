import { Navigate, Route, Routes } from 'react-router-dom'
import HrLayout from './components/HrLayout'
import HrHomePage from './pages/HrHomePage'
import HrImportPage from './pages/HrImportPage'
import EmployeesPage from './pages/EmployeesPage'
import DepartmentsPage from './pages/DepartmentsPage'
import CrewsPage from './pages/CrewsPage'
import ShiftsPage from './pages/ShiftsPage'
import AttendancePage from './pages/AttendancePage'
import HrPositionsPage from './pages/HrPositionsPage'
import HrUsersPage from './pages/HrUsersPage'
import { HR_DEFAULT_SECTION } from './lib/hr-sections'

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
