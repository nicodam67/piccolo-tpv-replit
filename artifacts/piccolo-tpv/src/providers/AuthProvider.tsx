/**
 * AuthProvider — global authentication context for Piccolo TPV.
 *
 * On mount, calls GET /api/auth/me using the HttpOnly session cookie.
 * Exposes:
 *   - `user`            — decoded server-side user, or null when unauthenticated
 *   - `isLoading`       — true while the initial /me request is in-flight
 *   - `isAuthenticated` — true once /me succeeded
 *   - `error`           — ApiClientError if /me failed (e.g. expired token)
 *   - `login(id, pin)`  — POST /api/auth/pin, receives cookie, re-fetches /me
 *   - `logout()`        — revokes the session cookie and redirects
 *   - `refreshSession()`— re-fetches /me (e.g. after a settings change)
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { api, ApiClientError } from '../lib/api-client';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface AuthUser {
  id: string;
  name: string;
  role: string;
  expiresAt: string | null;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: ApiClientError | null;
}

interface AuthContextValue extends AuthState {
  login: (employeeId: string, pin: string) => Promise<void>;
  logout: () => void;
  refreshSession: () => Promise<void>;
}

// ── Context ───────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user:            null,
    isLoading:       true,
    isAuthenticated: false,
    error:           null,
  });

  // ── /me fetch ─────────────────────────────────────────────────────────────
  const fetchMe = useCallback(async () => {
    try {
      const user = await api.get<AuthUser>('/api/auth/me');
      setState({ user, isLoading: false, isAuthenticated: true, error: null });
    } catch (err) {
      // Expired or invalid cookie — purge only non-sensitive compatibility data.
      if (err instanceof ApiClientError && err.isAuth) {
        localStorage.removeItem('employee');
      }
      setState({
        user:            null,
        isLoading:       false,
        isAuthenticated: false,
        error:           err instanceof ApiClientError ? err : null,
      });
    }
  }, []);

  useEffect(() => {
    void fetchMe();
  }, [fetchMe]);

  // ── login ─────────────────────────────────────────────────────────────────
  const login = useCallback(
    async (employeeId: string, pin: string) => {
      setState(s => ({ ...s, isLoading: true, error: null }));
      // login throws ApiClientError on failure — caller handles it
      const data = await api.post<{
        employee: { id: string; name: string; role: string };
      }>('/api/auth/pin', { employeeId, pin });
      // Compatibility-only profile cache; the credential remains HttpOnly.
      localStorage.setItem('employee', JSON.stringify(data.employee));
      await fetchMe();
    },
    [fetchMe],
  );

  // ── logout ────────────────────────────────────────────────────────────────
  // Calls POST /api/auth/logout to revoke the JWT server-side (inserts jti into
  // revoked_tokens). Only clears localStorage and redirects after the server
  // confirms the revocation — if the server returns an error we throw so the
  // caller can retry or show a message.
  const logout = useCallback(async () => {
    // Authoritative revocation — must succeed before clearing local state.
    await api.post('/api/auth/logout', {});

    // Revocation confirmed — now safe to clear client-side state.
    localStorage.removeItem('employee');
    setState({ user: null, isLoading: false, isAuthenticated: false, error: null });
    window.location.href = import.meta.env.BASE_URL ?? '/';
  }, []);

  // ── refreshSession ────────────────────────────────────────────────────────
  const refreshSession = useCallback(() => fetchMe(), [fetchMe]);

  return (
    <AuthContext.Provider
      value={{ ...state, login, logout, refreshSession }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() must be called inside <AuthProvider>');
  return ctx;
}
