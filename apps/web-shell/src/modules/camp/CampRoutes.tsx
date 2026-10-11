import { Navigate, Route, Routes } from 'react-router-dom'
import CampLayout from './components/CampLayout'
import CampHomePage from './pages/CampHomePage'
import CampSettingsPage from './pages/CampSettingsPage'
import SystemSettingsPage from './pages/SystemSettingsPage'
import EmployeesPage from './pages/EmployeesPage'
import AttendancePage from './pages/AttendancePage'
import ShiftsPage from './pages/ShiftsPage'
import RoomBoardPage from './pages/RoomBoardPage'
import PresencePage from './pages/PresencePage'
import AssetsPage from './pages/AssetsPage'
import MaintenanceListPage from './pages/MaintenanceListPage'
import MaintenanceDetailPage from './pages/MaintenanceDetailPage'

/** /camp/* — Кемп модуль (Шат 8, V1; v0.2.0 — системийн тохиргоо, тохиргооны каталог) */
export default function CampRoutes() {
  return (
    <Routes>
      <Route index element={<CampHomePage />} />
      {/* FB-11 (v0.2.0): "Системийн тохиргоо" — хуучин /camp/admin/* хаягууд redirect */}
      <Route path="system" element={<Navigate to="camps" replace />} />
      <Route path="system/:section" element={<SystemSettingsPage />} />
      <Route path="admin/organizations" element={<Navigate to="/camp/system/organizations" replace />} />
      <Route path="admin/roles" element={<Navigate to="/camp/system/roles" replace />} />
      <Route path="admin/user-roles" element={<Navigate to="/camp/system/user-roles" replace />} />
      <Route path="admin/asset-categories" element={<Navigate to="/camp/system/asset-categories" replace />} />
      <Route path=":campId" element={<CampLayout />}>
        <Route index element={<Navigate to="attendance" replace />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="shifts" element={<ShiftsPage />} />
        <Route path="rooms" element={<RoomBoardPage />} />
        <Route path="meals" element={<PresencePage />} />
        <Route path="maintenance" element={<MaintenanceListPage />} />
        <Route path="maintenance/:id" element={<MaintenanceDetailPage />} />
        <Route path="assets" element={<AssetsPage />} />
        <Route path="employees" element={<EmployeesPage />} />
        {/* FB-05 (v0.2.0): тохиргооны каталог; хуучин хаягууд redirect */}
        <Route path="settings" element={<Navigate to="general" replace />} />
        <Route path="settings/:section" element={<CampSettingsPage />} />
        <Route path="facilities" element={<Navigate to="../settings/facilities" replace />} />
        <Route path="departments" element={<Navigate to="../settings/departments" replace />} />
        <Route path="crews" element={<Navigate to="../settings/crews" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/camp" replace />} />
    </Routes>
  )
}
