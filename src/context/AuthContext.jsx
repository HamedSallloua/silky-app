import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getStoredUser, getUserToken, setUserAuth } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getStoredUser);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const onAuthExpired = () => setUser(null);
    window.addEventListener('silky:auth-expired', onAuthExpired);
    return () => window.removeEventListener('silky:auth-expired', onAuthExpired);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!getStoredUser() && !getUserToken()) {
        setLoading(false);
        return;
      }

      try {
        const { user: freshUser } = await api.getMe();
        if (!cancelled) {
          setUser(freshUser);
          setUserAuth(getUserToken(), freshUser);
        }
      } catch {
        if (!cancelled) {
          setUserAuth(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async ({ identifier, email, password }) => {
    const result = await api.login({ identifier: identifier || email, password });
    setUserAuth(result.token, result.user);
    setUser(result.user);
    return result;
  }, []);

  const register = useCallback(async (data) => {
    const result = await api.register(data);
    setUserAuth(result.token, result.user);
    setUser(result.user);
    return result;
  }, []);

  const adminPanelLogin = useCallback(async (password) => {
    const result = await api.adminLogin(password);
    setUserAuth(result.token, result.user);
    setUser(result.user);
    return result;
  }, []);

  const logout = useCallback(() => {
    setUserAuth(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const { user: freshUser } = await api.getMe();
    setUser(freshUser);
    setUserAuth(getUserToken(), freshUser);
    return freshUser;
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === 'admin',
      login,
      register,
      adminPanelLogin,
      logout,
      refreshUser,
    }),
    [user, loading, login, register, adminPanelLogin, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
