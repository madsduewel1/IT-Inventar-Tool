import axios from 'axios';

const basePath = import.meta.env.BASE_URL || '/';
const base = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
export const api = axios.create({
  baseURL: `${base}/api`
});

api.interceptors.request.use((config) => {
  // Every mutating API request carries auth and CSRF headers from sessionStorage.
  const token = sessionStorage.getItem('token');
  const csrfToken = sessionStorage.getItem('csrfToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (csrfToken && !['get', 'head', 'options'].includes(config.method)) {
    config.headers['X-CSRF-Token'] = csrfToken;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Wartungsmodus: alle weiteren API-Aufrufe werden abgelehnt. Die
    // Oberflaeche zeigt dann den Wartungsbildschirm an.
    if (error.response?.status === 503 && error.response?.data?.code === 'MAINTENANCE') {
      sessionStorage.setItem('maintenanceExpected', '1');
      window.dispatchEvent(new CustomEvent('maintenance-mode', {
        detail: { ...error.response.data, enabled: true }
      }));
    }
    // A 401 means the backend no longer accepts the session, so the UI must
    // forget the token before sending the user back to login.
    if (error.response?.status === 401 && !window.location.pathname.endsWith('/login')) {
      sessionStorage.removeItem('token');
      window.location.href = `${base}/login`;
    }
    return Promise.reject(error);
  }
);

export async function loadCsrfToken() {
  const { data } = await api.get('/csrf-token');
  sessionStorage.setItem('csrfToken', data.csrfToken);
  return data.csrfToken;
}

export async function streamDeviceImport(devices, onEvent, signal) {
  const token = sessionStorage.getItem('token');
  const csrfToken = sessionStorage.getItem('csrfToken');
  const response = await fetch(`${base}/api/devices/bulk/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
    },
    body: JSON.stringify({ devices }),
    signal
  });

  if (!response.ok) {
    let message = 'Import fehlgeschlagen.';
    try {
      const data = await response.json();
      message = data.error || message;
    } catch {}
    if (response.status === 401) {
      sessionStorage.removeItem('token');
      window.location.href = `${base}/login`;
    }
    throw new Error(message);
  }

  if (!response.body) throw new Error('Der Browser unterstützt keinen Live-Import.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  function emit(line) {
    if (!line.trim()) return;
    try {
      onEvent(JSON.parse(line));
    } catch {}
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    lines.forEach(emit);
  }

  buffer += decoder.decode();
  emit(buffer);
}
