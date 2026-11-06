import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import PageSuspense from './components/PageSuspense';
import { HomeRedirect, ModuleGate } from './components/ModuleGate';
// Нэвтрэлтгүй хуудсууд — үндсэн chunk-д (анхны ачаалал хурдан, утас + Tunnel)
import LoginPage from './pages/LoginPage';
import SetPasswordPage from './pages/SetPasswordPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';

// v0.2.2 Блок 6 (PIL-10): нэвтэрсний дараах хуудас/модуль бүр тусдаа chunk
const ChangePasswordPage = lazy(() => import('./pages/ChangePasswordPage'));
const MRListPage = lazy(() => import('./pages/MRListPage'));
const MRCreatePage = lazy(() => import('./pages/MRCreatePage'));
const MRDetailPage = lazy(() => import('./pages/MRDetailPage'));
const ApprovalSlaPage = lazy(() => import('./pages/ApprovalSlaPage'));
const WorkflowDefinitionPage = lazy(() => import('./pages/WorkflowDefinitionPage'));
const DelegationPage = lazy(() => import('./pages/DelegationPage'));
const CampRoutes = lazy(() => import('./modules/camp/CampRoutes'));
const HrRoutes = lazy(() => import('./modules/hr/HrRoutes'));
const SettingsPage = lazy(() => import('./modules/settings/SettingsPage'));
const InventoryPage = lazy(() => import('./modules/inventory/InventoryPage'));
const VendorsPage = lazy(() => import('./modules/vendor/VendorsPage'));
const ReportPage = lazy(() => import('./modules/report/ReportPage'));
// v0.2.3 Блок F — санал хүсэлт, шинэчлэлийн түүх (модулиас үл хамаарна)
const FeedbackPage = lazy(() => import('./modules/feedback/FeedbackPage'));
const WhatsNewPage = lazy(() => import('./modules/feedback/WhatsNewPage'));
import { isEnabled } from './config/enabled-modules';

// Sprint 4: Module Federation — React.lazy + dynamic import
// mfe-requisitions remote-оос ачаалагдана (port 5174)
const RequisitionApp = React.lazy(
  () => import('mfe_requisitions/RequisitionApp'),
);

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      {/* v0.2.2 Блок 3: нэвтрэлтгүй — урилга, нууц үг сэргээх */}
      <Route path="/invite/:token" element={<SetPasswordPage />} />
      <Route path="/reset/:token" element={<SetPasswordPage />} />
      <Route path="/forgot" element={<ForgotPasswordPage />} />

      {/* Protected */}
      <Route element={<ProtectedRoute />}>
        {/* v0.2.2 D-06: Layout-гүй (нууц үг солих шаардлагатай үед цэс харуулахгүй) */}
        <Route path="/change-password" element={<PageSuspense><ChangePasswordPage /></PageSuspense>} />
        <Route element={<Layout />}>
          {/* v0.1.6: VITE_MODULES-оор шүүнэ (пилот = зөвхөн camp → нүүр /camp) */}
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/feedback" element={<FeedbackPage />} />
          <Route path="/whats-new" element={<WhatsNewPage />} />
          {isEnabled('mr') && (
            <>
              <Route path="/requisitions" element={<MRListPage />} />
              <Route path="/requisitions/new" element={<MRCreatePage />} />
              <Route path="/requisitions/:id" element={<MRDetailPage />} />
              <Route path="/admin/approval-sla" element={<ApprovalSlaPage />} />
              <Route path="/admin/workflow-definitions" element={<WorkflowDefinitionPage />} />
              <Route path="/admin/delegations" element={<DelegationPage />} />
            </>
          )}

          {/* Phase 6.0: хөнгөн модулиуд (Inventory / Vendor / Report) */}
          {isEnabled('inventory') && <Route path="/inventory" element={<InventoryPage />} />}
          {isEnabled('vendors') && <Route path="/vendors" element={<VendorsPage />} />}
          {isEnabled('reports') && <Route path="/reports" element={<ReportPage />} />}

          {/* Шат 8: Кемп модуль (V1) */}
          {isEnabled('camp') && <Route path="/camp/*" element={<ModuleGate mod="camp"><CampRoutes /></ModuleGate>} />}
          {/* v0.2.2 H2: Хүний нөөц (camp асвал автоматаар — lib/modules.ts) */}
          {isEnabled('hr') && <Route path="/hr/*" element={<ModuleGate mod="hr"><HrRoutes /></ModuleGate>} />}
          {/* v0.2.3 Блок 3 (ADR-007 B3-2): Системийн тохиргоо — роль, эрх, байгууллага, орчуулга */}
          {isEnabled('hr') && <Route path="/settings" element={<SettingsPage />} />}
          {isEnabled('hr') && <Route path="/settings/:section" element={<SettingsPage />} />}

          {/* Sprint 4: MFE Remote — /mfe route */}
          {isEnabled('mfe') && (
            <Route
              path="/mfe/*"
              element={
                <Suspense fallback={<div>MFE ачааллаж байна...</div>}>
                  <RequisitionApp />
                </Suspense>
              }
            />
          )}
        </Route>
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
