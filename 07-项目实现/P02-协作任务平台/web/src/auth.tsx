import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, readSession, writeSession, type User } from './api';

type AuthContextValue = {
  user: User | null;
  message: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  clearMessage: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => readSession()?.user || null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      setMessage('会话已过期，请重新登录');
    };
    window.addEventListener('p02:session-expired', onExpired);
    return () => window.removeEventListener('p02:session-expired', onExpired);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    message,
    clearMessage: () => setMessage(null),
    async login(email, password) {
      const body = await api.login({ email, password });
      writeSession(body);
      setUser(body.user);
      setMessage(null);
    },
    async register(email, password, name) {
      const body = await api.register({ email, password, name });
      writeSession(body);
      setUser(body.user);
      setMessage(null);
    },
    logout() {
      writeSession(null);
      setUser(null);
    },
  }), [user, message]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return ctx;
}
