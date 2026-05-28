import { AdminPage } from './Users';

export default function Logs() {
  return (
    <AdminPage title="Systemlogs">
      <div className="card p-4 text-sm text-gray-600">Backend-Logs liegen unter <code>backend/logs/app.log</code>. Ein API-Logviewer ist vorbereitet.</div>
    </AdminPage>
  );
}
