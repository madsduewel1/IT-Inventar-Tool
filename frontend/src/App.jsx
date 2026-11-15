import { BrowserRouter, Navigate, Route, Routes, useParams, useSearchParams } from 'react-router-dom';
import { AuthProvider } from './store/authStore.jsx';
import { ConfirmProvider } from './components/ConfirmDialog';
import { useAuth } from './hooks/useAuth';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import MaintenanceGate from './components/MaintenanceGate';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ViewerDashboard from './pages/ViewerDashboard';
import MyDevice from './pages/MyDevice';
import Devices from './pages/Devices';
import DeviceCreate from './pages/DeviceCreate';
import DeviceEdit from './pages/DeviceEdit';
import DeviceDetail from './pages/DeviceDetail';
import DevicesPrint from './pages/DevicesPrint';
import Rooms from './pages/Rooms';
import RoomCreate from './pages/RoomCreate';
import RoomEdit from './pages/RoomEdit';
import Loans from './pages/Loans';
import LoanCreate from './pages/LoanCreate';
import LoanRequest from './pages/LoanRequest';
import LoanCertificate from './pages/LoanCertificate';
import LoanDetail from './pages/LoanDetail';
import Issues from './pages/Issues';
import IssueCreate from './pages/IssueCreate';
import IssueDetail from './pages/IssueDetail';
import ManageIssues from './pages/ManageIssues';
import SetupWizard from './pages/setup/SetupWizard';
import Users from './pages/admin/Users';
import UserCreate from './pages/admin/UserCreate';
import ApiKeys from './pages/admin/ApiKeys';
import Settings from './pages/admin/Settings';
import AdminDashboard from './pages/admin/AdminDashboard';
import SystemUpdates from './pages/admin/SystemUpdates';
import Logs from './pages/admin/Logs';
import MailLog from './pages/admin/MailLog';
import Roles from './pages/admin/Roles';
import PermissionEdit from './pages/admin/PermissionEdit';
import Areas from './pages/admin/Areas';
import AreaCreate from './pages/admin/AreaCreate';
import AreaDetail from './pages/admin/AreaDetail';
import TicketResponsibilities from './pages/admin/TicketResponsibilities';
import IssueTemplates from './pages/admin/IssueTemplates';
import TicketPriorities from './pages/admin/TicketPriorities';
import TicketNotifications from './pages/admin/TicketNotifications';
import DevicesImport from './pages/DevicesImport';

import DeviceUpdates from './pages/DeviceUpdates';
import DeviceUpdateCreate from './pages/DeviceUpdateCreate';
import DeviceUpdateDetail from './pages/DeviceUpdateDetail';
import EmailSupport from './pages/EmailSupport';
import EmailReply from './pages/EmailReply';
import EmailToTicket from './pages/EmailToTicket';
import Help from './pages/Help';

function DashboardRouter() {
  const { user } = useAuth();
  const role = user?.effectiveRole || user?.role;
  if (role === 'VIEWER') return <ViewerDashboard />;
  return <Dashboard />;
}

// Query-based detail routes keep old QR links stable while preserving list URLs.
function DevicesRouter() {
  const [searchParams] = useSearchParams();
  return searchParams.has('id') ? <DeviceDetail /> : <Devices />;
}

function DevicePrintRouter() {
  const { user } = useAuth();
  const role = user?.effectiveRole || user?.role;
  const [searchParams] = useSearchParams();
  if (role === 'VIEWER') return <Navigate to={searchParams.has('id') ? `/devices?id=${searchParams.get('id')}` : '/devices'} replace />;
  return searchParams.has('id') ? <DeviceDetail print /> : <DevicesPrint />;
}

function IssueRouter() {
  const [searchParams] = useSearchParams();
  return searchParams.has('id') ? <IssueDetail /> : <Issues />;
}

function UpdatesRouter() {
  const [searchParams] = useSearchParams();
  return searchParams.has('id') ? <DeviceUpdateDetail /> : <DeviceUpdates />;
}

// Converts older path URLs such as /devices/132 into the current query format.
function PathRedirect({ to }) {
  const params = useParams();
  let target = to;
  for (const [key, value] of Object.entries(params)) {
    target = target.split(`:${key}`).join(encodeURIComponent(value || ''));
  }
  return <Navigate to={target} replace />;
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/+$/, '')}>
      <AuthProvider>
        <ConfirmProvider>
          <MaintenanceGate>
          <Routes>
          <Route path="/setup" element={<SetupWizard />} />
          <Route path="/login" element={<Login />} />
          <Route path="/login/no-sso-login" element={<Login />} />
          <Route path="/login/no-sso-sign-in" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/devices/print" element={<DevicePrintRouter />} />
            <Route element={<ProtectedRoute permissions={['LOAN_VIEW']} />}>
              <Route path="/loans/certificate" element={<LoanCertificate />} />
            </Route>
            <Route element={<Layout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardRouter />} />
              {/* „Mein Gerät" braucht keine Sonderrechte – das Backend liefert
                  nur die eigene aktive Ausleihe. */}
              <Route path="/my-device" element={<MyDevice />} />
              <Route path="/help" element={<Help />} />
              <Route element={<ProtectedRoute permissions={['DEVICE_VIEW']} />}>
                <Route path="/devices" element={<DevicesRouter />} />
                <Route element={<ProtectedRoute roles={['STAFF', 'ADMIN']} />}>
                  <Route path="/devices/import" element={<DevicesImport />} />
                </Route>
                <Route path="/devices/new" element={<DeviceCreate />} />
                <Route path="/devices/edit" element={<DeviceEdit />} />
                <Route path="/devices/:id" element={<PathRedirect to="/devices?id=:id" />} />
                <Route path="/devices/:id/edit" element={<PathRedirect to="/devices/edit?id=:id" />} />
                <Route path="/devices/:id/print" element={<PathRedirect to="/devices/print?id=:id" />} />
              </Route>
              <Route element={<ProtectedRoute permissions={['ROOM_VIEW']} />}>
                <Route path="/rooms" element={<Rooms />} />
                <Route path="/rooms/new" element={<RoomCreate />} />
                <Route path="/rooms/edit" element={<RoomEdit />} />
                <Route path="/rooms/:id/edit" element={<PathRedirect to="/rooms/edit?id=:id" />} />
              </Route>
              <Route element={<ProtectedRoute permissions={['LOAN_VIEW']} />}>
                <Route path="/loans" element={<Loans />} />
                <Route path="/loans/detail" element={<LoanDetail />} />
                <Route path="/loans/new" element={<LoanCreate />} />
                <Route path="/loans/request" element={<LoanRequest />} />
                <Route path="/loans/my" element={<Loans mine />} />
                <Route path="/loans/:id" element={<PathRedirect to="/loans/detail?id=:id" />} />
              </Route>
              <Route element={<ProtectedRoute roles={['STAFF', 'ADMIN']} permissions={['UPDATE_VIEW']} />}>
                <Route path="/updates" element={<UpdatesRouter />} />
                <Route path="/updates/new" element={<DeviceUpdateCreate />} />
                <Route path="/updates/:id" element={<PathRedirect to="/updates?id=:id" />} />
              </Route>
              <Route element={<ProtectedRoute roles={['STAFF', 'ADMIN']} permissions={['MAIL_MANAGE']} />}>
                <Route path="/email-support" element={<EmailSupport />} />
                <Route path="/email-support/new" element={<EmailReply />} />
                <Route path="/email-support/convert" element={<EmailToTicket />} />
              </Route>
              <Route element={<ProtectedRoute permissions={['ISSUE_CREATE']} />}>
                <Route path="/issues" element={<IssueRouter />} />
                <Route path="/issues/new" element={<IssueCreate />} />
                <Route path="/issues/:id" element={<PathRedirect to="/issues?id=:id" />} />
              </Route>
              <Route element={<ProtectedRoute permissions={['ISSUE_MANAGE']} />}>
                <Route path="/issues/manage" element={<ManageIssues />} />
                <Route path="/issues/capture" element={<IssueCreate mode="capture" />} />
              </Route>
              <Route element={<ProtectedRoute roles={['ADMIN']} permissions={['SETTINGS_MANAGE']} />}>
                <Route path="/admin/dashboard" element={<AdminDashboard />} />
                <Route path="/admin/settings" element={<Settings />} />
                <Route path="/admin/settings/:section" element={<Settings />} />
                <Route path="/admin/sso" element={<Navigate to="/admin/settings/sso" replace />} />
                <Route path="/admin/system/updates" element={<SystemUpdates />} />
              </Route>
              <Route element={<ProtectedRoute roles={['ADMIN']} />}>
                <Route path="/admin/users" element={<Users />} />
                <Route path="/admin/users/new" element={<UserCreate />} />
                <Route path="/admin/areas" element={<Areas />} />
                <Route path="/admin/areas/new" element={<AreaCreate />} />
                <Route path="/admin/areas/:id" element={<AreaDetail />} />
                <Route path="/admin/ticket-responsibilities" element={<TicketResponsibilities />} />
                <Route path="/admin/ticket-templates" element={<IssueTemplates />} />
                <Route path="/admin/ticket-priorities" element={<TicketPriorities />} />
                <Route path="/admin/ticket-notifications" element={<TicketNotifications />} />
                <Route path="/admin/roles" element={<Roles />} />
                <Route path="/admin/roles/edit" element={<PermissionEdit />} />
                <Route path="/admin/roles/:type/:id/edit" element={<PathRedirect to="/admin/roles/edit?type=:type&id=:id" />} />
                <Route path="/admin/api-keys" element={<ApiKeys />} />
                <Route path="/admin/logs" element={<Logs />} />
                <Route path="/admin/mail" element={<MailLog />} />
              </Route>
            </Route>
          </Route>
        </Routes>
          </MaintenanceGate>
        </ConfirmProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
