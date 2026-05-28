import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './store/authStore.jsx';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Devices from './pages/Devices';
import DeviceCreate from './pages/DeviceCreate';
import DeviceEdit from './pages/DeviceEdit';
import DeviceDetail from './pages/DeviceDetail';
import Rooms from './pages/Rooms';
import RoomCreate from './pages/RoomCreate';
import RoomEdit from './pages/RoomEdit';
import Loans from './pages/Loans';
import LoanCreate from './pages/LoanCreate';
import LoanRequest from './pages/LoanRequest';
import Issues from './pages/Issues';
import IssueCreate from './pages/IssueCreate';
import IssueDetail from './pages/IssueDetail';
import ManageIssues from './pages/ManageIssues';
import Scanner from './pages/Scanner';
import SetupWizard from './pages/setup/SetupWizard';
import Users from './pages/admin/Users';
import UserCreate from './pages/admin/UserCreate';
import ApiKeys from './pages/admin/ApiKeys';
import Monitoring from './pages/admin/Monitoring';
import Settings from './pages/admin/Settings';
import Logs from './pages/admin/Logs';
import MailLog from './pages/admin/MailLog';
import Roles from './pages/admin/Roles';

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <AuthProvider>
        <Routes>
          <Route path="/setup" element={<SetupWizard />} />
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/devices" element={<Devices />} />
              <Route path="/devices/new" element={<DeviceCreate />} />
              <Route path="/devices/:id/edit" element={<DeviceEdit />} />
              <Route path="/devices/:id" element={<DeviceDetail />} />
              <Route path="/devices/:id/print" element={<DeviceDetail print />} />
              <Route path="/rooms" element={<Rooms />} />
              <Route path="/rooms/new" element={<RoomCreate />} />
              <Route path="/rooms/:id/edit" element={<RoomEdit />} />
              <Route path="/loans" element={<Loans />} />
              <Route path="/loans/new" element={<LoanCreate />} />
              <Route path="/loans/request" element={<LoanRequest />} />
              <Route path="/loans/my" element={<Loans mine />} />
              <Route element={<ProtectedRoute permissions={['ISSUE_REPORT']} />}>
                <Route path="/issues" element={<Issues />} />
                <Route path="/issues/new" element={<IssueCreate />} />
                <Route path="/issues/:id" element={<IssueDetail />} />
              </Route>
              <Route element={<ProtectedRoute permissions={['ISSUE_MANAGE']} />}>
                <Route path="/issues/manage" element={<ManageIssues />} />
              </Route>
              <Route path="/scanner" element={<Scanner />} />
              <Route element={<ProtectedRoute roles={['ADMIN']} />}>
                <Route path="/admin/users" element={<Users />} />
                <Route path="/admin/users/new" element={<UserCreate />} />
                <Route path="/admin/roles" element={<Roles />} />
                <Route path="/admin/api-keys" element={<ApiKeys />} />
                <Route path="/admin/monitoring" element={<Monitoring />} />
                <Route path="/admin/settings" element={<Settings />} />
                <Route path="/admin/settings/:section" element={<Settings />} />
                <Route path="/admin/sso" element={<Navigate to="/admin/settings/sso" replace />} />
                <Route path="/admin/logs" element={<Logs />} />
                <Route path="/admin/mail" element={<MailLog />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
