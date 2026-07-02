import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

export function PrivateRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

export function AdminRoute({ children }) {
  const { isAuthenticated, isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}

// Defensive: user-only pages (dashboard, transactions, risk, anomalies,
// notifications) read JWT-scoped personal data. An admin who hand-types
// /transactions would see their own empty admin account data — meaningless.
// Sidebar already hides these links; this guard catches direct URL navigation.
// /settings is intentionally NOT wrapped (admin-allowed, tabs filter inside).
export function UserOnlyRoute({ children }) {
  const { isAuthenticated, isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  return children;
}