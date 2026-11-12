import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function ProtectedRoute({ roles, permissions }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="p-6 text-sm text-gray-500">Laden...</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  const role = user.effectiveRole || user.role;
  const userPermissions = user.effectivePermissions?.length ? user.effectivePermissions : (user.permissions || []);
  const roleAllowed = !roles?.length || roles.includes(role);
  const permissionAllowed = !permissions?.length || permissions.some((permission) => userPermissions.includes(permission) || userPermissions.includes('ADMIN'));
  // When both are provided, either a matching role or an explicit permission is enough.
  const allowed = roles?.length && permissions?.length ? (roleAllowed || permissionAllowed) : (roles?.length ? roleAllowed : permissionAllowed);

  if (!allowed) return <AccessDenied />;

  return <Outlet />;
}

function AccessDenied() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-xl p-6">
      <div className="card space-y-4 p-6">
        <div>
          <h1 className="text-xl font-semibold text-main">Keine Berechtigung</h1>
          <p className="mt-2 text-sm text-muted">
            Du hast für diese Seite aktuell keine Freigabe.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>
            Zurück
          </button>
          <Link className="btn-primary" to="/dashboard">
            Dashboard öffnen
          </Link>
        </div>
      </div>
    </div>
  );
}
