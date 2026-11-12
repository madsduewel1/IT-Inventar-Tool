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
