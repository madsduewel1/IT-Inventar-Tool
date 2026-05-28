import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function ProtectedRoute({ roles, permissions }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="p-6 text-sm text-gray-500">Laden...</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  const role = user.effectiveRole || user.role;
  const userPermissions = user.permissions || [];
  if (roles?.length && !roles.includes(role)) return <Navigate to="/dashboard" replace />;
  if (permissions?.length && !permissions.some((permission) => userPermissions.includes(permission) || userPermissions.includes('ADMIN'))) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
