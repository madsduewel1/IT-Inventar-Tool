import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, loadCsrfToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(localStorage.getItem('token') || new URLSearchParams(window.location.search).has('sso-token')));

  const refresh = useCallback(async () => {
    if (!localStorage.getItem('token')) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
    } catch {
      localStorage.removeItem('token');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('sso-token');
    if (token) {
      localStorage.setItem('token', token);
      history.replaceState(null, '', window.location.pathname);
    }
    loadCsrfToken().catch(() => {});
    refresh();
  }, [refresh]);

  const login = async (username, password) => {
    await loadCsrfToken();
    const { data } = await api.post('/auth/login', { username, password });
    localStorage.setItem('token', data.token);
    setUser(data.user);
  };

  const updatePreferences = async (preferences) => {
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

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      localStorage.removeItem('token');
      setUser(null);
    }
  };

  const value = useMemo(() => ({ user, loading, login, logout, refresh, updatePreferences }), [user, loading, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  return useContext(AuthContext);
}
