import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, getTokens, setTokens } from "@/lib/api";

export type CurrentUser = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_superuser: boolean;
  is_staff: boolean;
  is_active: boolean;
  is_super_admin: boolean;
  roles: number[];
  role_names: string[];
  dealer: number | null;
  dealer_name: string;
  permissions: string[];
  phone?: string;
  temporary_address?: string;
  permanent_address?: string;
  personal_email?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  join_date?: string | null;
  department?: string;
  designation?: string;
  employment_status?: string;
  photo_url?: string;
  can_view_sensitive?: boolean;
  date_of_birth?: string | null;
  pan_vat_number?: string;
  citizenship_number?: string;
};

export type Me = CurrentUser;

type AuthState = {
  token: string | null;
  me: Me | null;
  meLoading: boolean;
  meError: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
  hasPerm: (perm: string) => boolean;
  hasAnyPerm: (perms: string[]) => boolean;
  isSuperAdmin: boolean;
};

const AuthContext = createContext<AuthState>({
  token: null,
  me: null,
  meLoading: false,
  meError: null,
  login: async () => {},
  logout: () => {},
  refreshMe: async () => {},
  hasPerm: () => false,
  hasAnyPerm: () => false,
  isSuperAdmin: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getTokens()?.access ?? null);
  const [me, setMe] = useState<Me | null>(null);
  const [meLoading, setMeLoading] = useState(false);
  const [meError, setMeError] = useState<string | null>(null);

  const logout = useCallback(() => {
    // Record staff logout in audit log
    api("/api/auth/logout/", { method: "POST" }).catch(() => {});
    setTokens(null);
    localStorage.removeItem("vt_username");
    setToken(null);
    setMe(null);
    setMeError(null);
  }, []);

  const refreshMe = useCallback(async () => {
    const tokens = getTokens();
    if (!tokens?.access) {
      setMe(null);
      setMeError(null);
      return;
    }
    setMeLoading(true);
    setMeError(null);
    try {
      const data = await api<CurrentUser>("/api/auth/user/");
      setMe(data);
      setMeError(null);
    } catch (err) {
      // Token invalid/expired and refresh failed -> force re-login.
      // For 403 (inactive etc.) keep the session so the UI can show the error.
      const current = getTokens();
      if (!current?.access) {
        setMe(null);
        setToken(null);
        setMeError(null);
      } else {
        setMeError(err instanceof Error ? err.message : "Failed to load account permissions.");
      }
    } finally {
      setMeLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) refreshMe();
    else setMe(null);
  }, [token, refreshMe]);

  const login = async (username: string, password: string) => {
    const data = await api<{ access: string; refresh: string }>("/api/auth/token/", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setTokens(data);
    localStorage.setItem("vt_username", username.trim());
    setToken(data.access);
  };

  const hasPerm = useCallback(
    (perm: string) => {
      if (!me) return false;
      if (me.is_super_admin || me.is_superuser) return true;
      return me.permissions.includes(perm);
    },
    [me],
  );

  const hasAnyPerm = useCallback(
    (perms: string[]) => {
      if (!me) return false;
      if (me.is_super_admin || me.is_superuser) return true;
      return perms.some((p) => me.permissions.includes(p));
    },
    [me],
  );

  const isSuperAdmin = !!me && (me.is_super_admin || me.is_superuser);

  return (
    <AuthContext.Provider
      value={{ token, me, meLoading, meError, login, logout, refreshMe, hasPerm, hasAnyPerm, isSuperAdmin }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function useRequireAuth() {
  const { token, logout } = useAuth();
  useEffect(() => {
    if (!token) logout();
  }, [token, logout]);
}
