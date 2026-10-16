import { Navigate, Route, Routes } from 'react-router-dom'
import CampLayout from './components/CampLayout'
import CampHomePage from './pages/CampHomePage'
import CampSettingsPage from './pages/CampSettingsPage'
import SystemSettingsPage from './pages/SystemSettingsPage'
import RoomBoardPage from './pages/RoomBoardPage'
import PresencePage from './pages/PresencePage'
import AssetsPage from './pages/AssetsPage'
import MaintenanceListPage from './pages/MaintenanceListPage'
import MaintenanceDetailPage from './pages/MaintenanceDetailPage'
import LegacyHrRedirect from '../hr/components/LegacyHrRedirect'
import { CAMP_DEFAULT_SECTION } from './components/CampLayout'

/**
 * /camp/* — Кемп модуль (Шат 8, V1; v0.2.0 — системийн тохиргоо, тохиргооны каталог).
 * v0.2.2 H2: ажилтан, ирц, ээлж, хэлтэс, бригад, албан тушаал → «Хүний нөөц» (/hr/*); хуучин хаягууд redirect.
 */
export default function CampRoutes() {
  return (
    <Routes>
      <Route index element={<CampHomePage />} />
      {/* FB-11 (v0.2.0): "Системийн тохиргоо" — хуучин /camp/admin/* хаягууд redirect */}
      <Route path="system" element={<Navigate to="camps" replace />} />
      <Route path="system/positions" element={<Navigate to="/hr/positions" replace />} />
      <Route path="system/:section" element={<SystemSettingsPage />} />
      <Route path="admin/organizations" element={<Navigate to="/camp/system/organizations" replace />} />
      <Route path="admin/roles" element={<Navigate to="/camp/system/roles" replace />} />
      <Route path="admin/user-roles" element={<Navigate to="/camp/system/user-roles" replace />} />
      <Route path="admin/asset-categories" element={<Navigate to="/camp/system/asset-categories" replace />} />
      <Route path=":campId" element={<CampLayout />}>
        <Route index element={<Navigate to={CAMP_DEFAULT_SECTION} replace />} />
        <Route path="rooms" element={<RoomBoardPage />} />
        <Route path="meals" element={<PresencePage />} />
        <Route path="maintenance" element={<MaintenanceListPage />} />
        <Route path="maintenance/:id" element={<MaintenanceDetailPage />} />
        <Route path="assets" element={<AssetsPage />} />
        {/* FB-05 (v0.2.0): тохиргооны каталог; хуучин хаягууд redirect */}
        <Route path="settings" element={<Navigate to="general" replace />} />
        <Route path="settings/departments" element={<LegacyHrRedirect section="departments" />} />
        <Route path="settings/crews" element={<LegacyHrRedirect section="crews" />} />
        <Route path="settings/:section" element={<CampSettingsPage />} />
        <Route path="facilities" element={<Navigate to="../settings/facilities" replace />} />
        {/* v0.2.2 H2: HR руу шилжсэн хэсгүүд */}
        <Route path="employees" element={<LegacyHrRedirect section="employees" />} />
        <Route path="attendance" element={<LegacyHrRedirect section="attendance" />} />
        <Route path="shifts" element={<LegacyHrRedirect section="shifts" />} />
        <Route path="departments" element={<LegacyHrRedirect section="departments" />} />
        <Route path="crews" element={<LegacyHrRedirect section="crews" />} />
      </Route>
      <Route path="*" element={<Navigate to="/camp" replace />} />
    </Routes>
  )
}
