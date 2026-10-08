import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import MRListPage from './pages/MRListPage';
import MRCreatePage from './pages/MRCreatePage';
import MRDetailPage from './pages/MRDetailPage';
import ApprovalSlaPage from './pages/ApprovalSlaPage';
import WorkflowDefinitionPage from './pages/WorkflowDefinitionPage';
import DelegationPage from './pages/DelegationPage';

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

      {/* Protected */}
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/requisitions" replace />} />
          <Route path="/requisitions" element={<MRListPage />} />
          <Route path="/requisitions/new" element={<MRCreatePage />} />
          <Route path="/requisitions/:id" element={<MRDetailPage />} />
          <Route path="/admin/approval-sla" element={<ApprovalSlaPage />} />
          <Route path="/admin/workflow-definitions" element={<WorkflowDefinitionPage />} />
          <Route path="/admin/delegations" element={<DelegationPage />} />

          {/* Sprint 4: MFE Remote — /mfe route */}
          <Route
            path="/mfe/*"
            element={
              <Suspense fallback={<div>MFE ачааллаж байна...</div>}>
                <RequisitionApp />
              </Suspense>
            }
          />
        </Route>
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
