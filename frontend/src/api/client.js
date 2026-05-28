import axios from 'axios';

const basePath = import.meta.env.BASE_URL || '/';
export const api = axios.create({
  baseURL: `${basePath.endsWith('/') ? basePath.slice(0, -1) : basePath}/api`
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  const csrfToken = localStorage.getItem('csrfToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (csrfToken && !['get', 'head', 'options'].includes(config.method)) {
    config.headers['X-CSRF-Token'] = csrfToken;
  }
  return config;
});

export async function loadCsrfToken() {
  const { data } = await api.get('/csrf-token');
  localStorage.setItem('csrfToken', data.csrfToken);
  return data.csrfToken;
}
