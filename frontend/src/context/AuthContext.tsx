import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import client from "../api/client";
import type { User } from "../types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session statelessly from HttpOnly cookie via /api/auth/me on app load
  useEffect(() => {
    let isMounted = true;
    async function restoreSession() {
      try {
        const res = await client.get("/auth/me");
        if (isMounted) {
          setUser(res.data);
        }
      } catch {
        if (isMounted) {
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    restoreSession();
    return () => {
      isMounted = false;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await client.post("/auth/railsync/login", {
      username,
      password,
    });
    setUser(res.data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await client.post("/auth/logout");
    } finally {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        isAdmin: user?.role === "admin",
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
