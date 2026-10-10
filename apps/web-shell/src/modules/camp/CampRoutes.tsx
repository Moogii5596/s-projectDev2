import { Navigate, Route, Routes } from 'react-router-dom'
import CampLayout from './components/CampLayout'
import CampHomePage from './pages/CampHomePage'
import OrganizationsPage from './pages/OrganizationsPage'
import RolesPage from './pages/RolesPage'
import UserRolesPage from './pages/UserRolesPage'
import CampSettingsPage from './pages/CampSettingsPage'
import FacilitiesPage from './pages/FacilitiesPage'
import DepartmentsPage from './pages/DepartmentsPage'
import CrewsPage from './pages/CrewsPage'
import EmployeesPage from './pages/EmployeesPage'
import AttendancePage from './pages/AttendancePage'
import ShiftsPage from './pages/ShiftsPage'
import RoomBoardPage from './pages/RoomBoardPage'
import PresencePage from './pages/PresencePage'

/** /camp/* — Кемп модуль (Шат 8, V1) */
export default function CampRoutes() {
  return (
    <Routes>
      <Route index element={<CampHomePage />} />
      <Route path="admin/organizations" element={<OrganizationsPage />} />
      <Route path="admin/roles" element={<RolesPage />} />
      <Route path="admin/user-roles" element={<UserRolesPage />} />
      <Route path=":campId" element={<CampLayout />}>
        <Route index element={<Navigate to="attendance" replace />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="shifts" element={<ShiftsPage />} />
        <Route path="rooms" element={<RoomBoardPage />} />
        <Route path="meals" element={<PresencePage />} />
        <Route path="employees" element={<EmployeesPage />} />
        <Route path="settings" element={<CampSettingsPage />} />
        <Route path="facilities" element={<FacilitiesPage />} />
        <Route path="departments" element={<DepartmentsPage />} />
        <Route path="crews" element={<CrewsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/camp" replace />} />
    </Routes>
  )
}
