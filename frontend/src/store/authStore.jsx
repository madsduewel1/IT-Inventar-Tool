import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, loadCsrfToken } from '../api/client';

const AuthContext = createContext(null);

function getToken() {
  return sessionStorage.getItem('token');
}

function setToken(token) {
  sessionStorage.setItem('token', token);
}

function clearToken() {
  sessionStorage.removeItem('token');
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken() || new URLSearchParams(window.location.search).has('sso-token')));

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
    } finally {
      clearToken();
      setUser(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('sso-token');
    if (token) {
      // The backend sends short-lived SSO tokens through the URL once; store it
      // and remove it from browser history before the user can copy/share it.
      setToken(token);
      params.delete('sso-token');
      const remaining = params.toString();
      history.replaceState(null, '', window.location.pathname + (remaining ? `?${remaining}` : ''));
    }
    loadCsrfToken().catch(() => {});
    refresh();
  }, [refresh]);

  const login = async (username, password) => {
    await loadCsrfToken();
    const { data } = await api.post('/auth/login', { username, password });
    setToken(data.token);
    setUser(data.user);
  };

  const updatePreferences = async (preferences) => {
    // Optimistic update keeps theme/language changes instant; refresh restores
    // the server state if saving fails.
    const nextUser = { ...user, preferences: { ...(user?.preferences || {}), ...preferences } };
    setUser(nextUser);
    try {
      const { data } = await api.patch('/auth/preferences', preferences);
      setUser(data.user);
      return data.user;
    } catch (error) {
      await refresh();
      throw error;
    }
  };

  const value = useMemo(() => ({ user, loading, login, logout, refresh, updatePreferences }), [user, loading, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  return useContext(AuthContext);
}

export function useAuth() {
  return useAuthContext();
}
