import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

interface User {
  id: number;
  email: string;
  name: string;
  characterName: string;
  role: string;
  isActive?: boolean;
  emailVerified?: boolean;
  twoFactorEnabled?: boolean;
}

// El login puede terminar en dos estados:
//   - ok: cookie emitida, user cargado.
//   - 2fa: el server pidió un segundo paso (TOTP). El caller recibe el
//     challengeToken y debe llamar a verify2fa(challengeToken, code).
export type LoginResult =
  | { kind: 'ok' }
  | { kind: '2fa'; challengeToken: string; backupCodesRemaining: number };

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<LoginResult>;
  verify2fa: (challengeToken: string, code: string) => Promise<void>;
  register: (email: string, password: string, characterName: string, raidClanId?: number | null, raidCpId?: number | null, classMain?: string | null) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Clave histórica: hasta esta versión guardábamos el user en localStorage.
// Ya no lo hacemos (la cookie httpOnly + /api/auth/me son la única fuente
// de verdad), pero limpiamos la entrada vieja al montar para no dejar
// datos colgados del usuario en la máquina.
const LEGACY_STORAGE_KEY = 'user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Un único GET /api/auth/me para validar sesión. El backend responde
  // 200 con { user } si la cookie es válida, 401 si no. Nunca leemos
  // localStorage para determinar si hay sesión.
  const fetchMe = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me', { credentials: 'include' });
      if (!response.ok) {
        setUser(null);
        return;
      }
      const data = await response.json();
      setUser(data?.user ?? null);
    } catch (error) {
      console.error('Error checking session:', error);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    // Limpieza best-effort del storage legacy.
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    } catch { /* ignore */ }

    (async () => {
      await fetchMe();
      setLoading(false);
    })();
  }, [fetchMe]);

  // Revalidar al volver el foco a la pestaña — si el admin cambió el rol
  // o deshabilitó la cuenta mientras estabas afuera, lo notamos al toque.
  useEffect(() => {
    const onFocus = () => { fetchMe(); };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') fetchMe();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchMe]);

  const login = async (
    email: string,
    password: string,
    rememberMe: boolean = false,
  ): Promise<LoginResult> => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password, rememberMe }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.message || 'Error al iniciar sesión');
    }
    // El server pidió un segundo paso 2FA → NO cargamos el user todavía.
    // El llamador mostrará el input OTP y completará con verify2fa().
    if (data?.requires2fa && data?.challengeToken) {
      return {
        kind: '2fa',
        challengeToken: String(data.challengeToken),
        backupCodesRemaining: Number(data?.backupCodesRemaining ?? 0),
      };
    }
    if (data?.user) {
      setUser(data.user);
    } else {
      await fetchMe();
    }
    return { kind: 'ok' };
  };

  const verify2fa = async (challengeToken: string, code: string) => {
    const response = await fetch('/api/auth/login/2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ challengeToken, code }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.message || 'Código inválido');
    }
    if (data?.user) {
      setUser(data.user);
    } else {
      await fetchMe();
    }
  };

  const register = async (email: string, password: string, characterName: string, raidClanId?: number | null, raidCpId?: number | null, classMain?: string | null) => {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password, characterName, raidClanId: raidClanId || null, raidCpId: raidCpId || null, classMain: classMain || null }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.message || 'Error al registrarse');
    }
    if (data?.user) {
      setUser(data.user);
      return;
    }
    // Fallback por si el backend no devuelve el user en el register.
    await login(email, password);
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Error al cerrar sesión en servidor:', error);
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        login,
        verify2fa,
        register,
        logout,
        refresh: fetchMe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
}
