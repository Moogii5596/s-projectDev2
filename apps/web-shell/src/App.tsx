import React, { Suspense, lazy, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, RouterProvider, useParams } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import PageSuspense from './components/PageSuspense';
import RouteErrorBoundary from './components/RouteErrorBoundary';
import { HomeRedirect, ModuleGate } from './components/ModuleGate';
import LoginPage from './pages/LoginPage';
import SetPasswordPage from './pages/SetPasswordPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import { FEED_ENABLED, isEnabled } from './config/enabled-modules';
import { APP_MODULES, MODULE_ROUTES, moduleRoutesForBuild } from './lib/modules';

const ChangePasswordPage = lazy(() => import('./pages/ChangePasswordPage'));
const DevicesPage = lazy(() => import('./pages/DevicesPage'));
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
const FeedbackPage = lazy(() => import('./modules/feedback/FeedbackPage'));
const WhatsNewPage = lazy(() => import('./modules/feedback/WhatsNewPage'));
const FeedPage = lazy(() => import('./modules/feed/FeedPage'));
const FeedReportsPage = lazy(() => import('./modules/feed/FeedReportsPage'));
const RequisitionApp = React.lazy(() => import('mfe_requisitions/RequisitionApp'));
const DebugModulesPage = lazy(() => import('./modules/settings/DebugModulesPage'));
// v0.2.4 — мэдэгдэл, батлах урсгал, профайл, Debug, нэг пост
const NotificationsPage = lazy(() => import('./modules/core/NotificationsPage'));
const ApprovalsPage = lazy(() => import('./modules/core/ApprovalsPage'));
const ApprovalDetailPage = lazy(() => import('./modules/core/ApprovalDetailPage'));
const ProfilePage = lazy(() => import('./modules/core/ProfilePage'));
const DebugPage = lazy(() => import('./modules/debug/DebugPage'));
const FeedPostPage = lazy(() => import('./modules/feed/FeedPostPage'));
const MfeLoading = lazy(() => import('./components/MfeLoading'));

function LegacyMrDetailRedirect() {
  const { id } = useParams();
  return <Navigate to={id ? `/debug/modules/mr/${id}` : '/debug/modules/mr'} replace />;
}

type ModuleRouteKey = (typeof MODULE_ROUTES)[number]['key'];

const MODULE_ROUTE_ELEMENTS = {
  home: <HomeRedirect />,
  devices: <DevicesPage />,
  feedback: <FeedbackPage />,
  settings: <SettingsPage />,
  'settings-section': <SettingsPage />,
  'debug-modules': <DebugModulesPage />,
  debug: <DebugPage />,
  'debug-tab': <DebugPage />,
  notifications: <NotificationsPage />,
  approvals: <ApprovalsPage />,
  'approval-detail': <ApprovalDetailPage />,
  profile: <ProfilePage />,
  'legacy-org-settings': <Navigate to="/settings/organizations" replace />,
  'legacy-role-settings': <Navigate to="/settings/roles" replace />,
  'legacy-user-role-settings': <Navigate to="/settings/user-roles" replace />,
  'legacy-translation-settings': <Navigate to="/settings/translations" replace />,
  'legacy-building-settings': <Navigate to="/settings/building-types" replace />,
  'legacy-asset-settings': <Navigate to="/settings/asset-categories" replace />,
  'whats-new': <WhatsNewPage />,
  hr: <HrRoutes />,
  camp: <CampRoutes />,
  feed: <FeedPage />,
  'feed-reports': <FeedReportsPage />,
  'feed-post': <FeedPostPage />,
  mr: <MRListPage />,
  'mr-new': <MRCreatePage />,
  'mr-detail': <MRDetailPage />,
  'legacy-mr': <Navigate to="/debug/modules/mr" replace />,
  'legacy-mr-new': <Navigate to="/debug/modules/mr/new" replace />,
  'legacy-mr-detail': <LegacyMrDetailRedirect />,
  'approval-sla': <ApprovalSlaPage />,
  'workflow-definitions': <WorkflowDefinitionPage />,
  delegations: <DelegationPage />,
  'legacy-approval-sla': <Navigate to="/debug/modules/workflow/approval-sla" replace />,
  'legacy-workflow-definitions': <Navigate to="/debug/modules/workflow/definitions" replace />,
  'legacy-delegations': <Navigate to="/debug/modules/workflow/delegations" replace />,
  inventory: <InventoryPage />,
  'legacy-inventory': <Navigate to="/debug/modules/inventory" replace />,
  vendors: <VendorsPage />,
  'legacy-vendors': <Navigate to="/debug/modules/vendors" replace />,
  reports: <ReportPage />,
  'legacy-reports': <Navigate to="/debug/modules/reports" replace />,
  mfe: <Suspense fallback={<Suspense fallback={null}><MfeLoading /></Suspense>}><RequisitionApp /></Suspense>,
  'legacy-mfe': <Navigate to="/debug/modules/mfe" replace />,
} satisfies Record<ModuleRouteKey, ReactNode>;

const moduleRoutes = moduleRoutesForBuild(new Set(APP_MODULES.filter(isEnabled)), FEED_ENABLED)
  .flatMap(({ key, path, module }) => {
  const element = MODULE_ROUTE_ELEMENTS[key];
  return [{
    path,
    element: module === 'core'
      ? element
      : <ModuleGate mod={module}>{element}</ModuleGate>,
  }];
});

const router = createBrowserRouter([
  {
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/invite/:token', element: <SetPasswordPage /> },
      { path: '/reset/:token', element: <SetPasswordPage /> },
      { path: '/forgot', element: <ForgotPasswordPage /> },
      {
        element: <ProtectedRoute />,
        children: [
          { path: '/change-password', element: <PageSuspense><ChangePasswordPage /></PageSuspense> },
          {
            element: <Layout />,
            children: [
              ...moduleRoutes,
            ],
          },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
