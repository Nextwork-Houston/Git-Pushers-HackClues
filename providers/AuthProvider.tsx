"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useAppStore, type User } from "@/store/useAppStore";
import { authApi } from "@/lib/authApi";

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  register: (
    username: string,
    email: string,
    password: string,
    confirmPassword: string
  ) => Promise<string | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, isAuthenticated, setUser, setSessionToken, sessionToken } =
    useAppStore();
  const [loading, setLoading] = useState(true);

  // On mount, check for a stored session (mock)
  useEffect(() => {
    const storedToken = localStorage.getItem("session_token");
    const storedUser = localStorage.getItem("session_user");
    if (storedToken && storedUser) {
      try {
        const parsed = JSON.parse(storedUser) as User;
        setUser(parsed);
        setSessionToken(storedToken);
      } catch {
        localStorage.removeItem("session_token");
        localStorage.removeItem("session_user");
      }
    }
    setLoading(false);
  }, [setUser, setSessionToken]);

  const login = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      const result = await authApi.login({ email, password });
      if (result.success && result.token && result.user) {
        setUser(result.user);
        setSessionToken(result.token);
        localStorage.setItem("session_token", result.token);
        localStorage.setItem("session_user", JSON.stringify(result.user));
        router.push("/");
        return null;
      }
      return result.error ?? "Login failed.";
    },
    [setUser, setSessionToken, router]
  );

  const register = useCallback(
    async (
      username: string,
      email: string,
      password: string,
      confirmPassword: string
    ): Promise<string | null> => {
      const result = await authApi.register({ username, email, password, confirmPassword });

      if (result.success && result.token && result.user) {
        setUser(result.user);
        setSessionToken(result.token);
        localStorage.setItem("session_token", result.token);
        localStorage.setItem("session_user", JSON.stringify(result.user));
        router.push("/");
        return null;
      }
      return result.error ?? "Registration failed.";
    },
    [setUser, setSessionToken, router]
  );

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
    setSessionToken(null);
    localStorage.removeItem("session_token");
    localStorage.removeItem("session_user");
    router.push("/login");
  }, [setUser, setSessionToken, router]);

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated, loading, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}