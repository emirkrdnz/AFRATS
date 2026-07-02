import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import AuthLayout from '../layouts/AuthLayout';
import { PrivateRoute, AdminRoute, UserOnlyRoute } from './Guards';

// Legacy /profile?... → /settings?... — preserves tab + filter query params so
// old bookmarks/notification links keep landing on the right tab.
function LegacySettingsRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/settings${search}`} replace />;
}

// Auth Pages
const Login = lazy(() => import('../pages/auth/Login'));
const Register = lazy(() => import('../pages/auth/Register'));
const ForgotPassword = lazy(() => import('../pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('../pages/auth/ResetPassword'));

// User Pages
const Dashboard = lazy(() => import('../pages/dashboard/Dashboard'));
const TransactionList = lazy(() => import('../pages/transactions/TransactionList'));
const RiskDetail = lazy(() => import('../pages/risk/RiskDetail'));
const AnomalyList = lazy(() => import('../pages/anomalies/AnomalyList'));
const AnomalyDetail = lazy(() => import('../pages/anomalies/AnomalyDetail'));
const NotificationList = lazy(() => import('../pages/notifications/NotificationList'));
const Settings = lazy(() => import('../pages/settings/Settings'));

// Admin Pages
const AdminDashboard = lazy(() => import('../pages/admin/AdminDashboard'));
const UserManagement = lazy(() => import('../pages/admin/UserManagement'));
const SystemHealth = lazy(() => import('../pages/admin/SystemHealth'));
const MLModels = lazy(() => import('../pages/admin/MLModels'));

function PageLoader() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Auth Routes — sidebar yok */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
        </Route>

        {/* Protected Routes — sidebar + navbar */}
        <Route
          element={
            <PrivateRoute>
              <MainLayout />
            </PrivateRoute>
          }
        >
          <Route path="/"                          element={<UserOnlyRoute><Dashboard /></UserOnlyRoute>} />
          <Route path="/transactions"              element={<UserOnlyRoute><TransactionList /></UserOnlyRoute>} />
          <Route path="/risk"                      element={<UserOnlyRoute><RiskDetail /></UserOnlyRoute>} />
          <Route path="/anomalies"                 element={<UserOnlyRoute><AnomalyList /></UserOnlyRoute>} />
          <Route path="/anomalies/:transactionId"  element={<UserOnlyRoute><AnomalyDetail /></UserOnlyRoute>} />
          <Route path="/notifications"             element={<UserOnlyRoute><NotificationList /></UserOnlyRoute>} />
          <Route path="/settings"                  element={<Settings />} />
          <Route path="/profile"                   element={<LegacySettingsRedirect />} />

          {/* Admin Routes */}
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminDashboard />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <AdminRoute>
                <UserManagement />
              </AdminRoute>
            }
          />
          
          {/* Sprint AB4: eski /admin/users/:userId/risk sayfası kaldırıldı.
             Risk bilgisi UserManagement drawer'ında entegre (mini gauge + sparkline).
             Eski link gelirse user list'e redirect. */}
          <Route
            path="/admin/users/:userId/risk"
            element={<Navigate to="/admin/users" replace />}
          />

          {/* System Health — live service status + architecture overview */}
          <Route
            path="/admin/health"
            element={
              <AdminRoute>
                <SystemHealth />
              </AdminRoute>
            }
          />
          {/* ML Models — anomaly + risk score model performance & ensemble */}
          <Route
            path="/admin/ml-models"
            element={
              <AdminRoute>
                <MLModels />
              </AdminRoute>
            }
          />
          {/* Eski link'ler redirect (bookmark uyumu) */}
          <Route path="/admin/analytics" element={<Navigate to="/admin"        replace />} />
          <Route path="/admin/topology"  element={<Navigate to="/admin/health" replace />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}