import { apollosmsApi, UserResponse } from "@/api/apollosms";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

interface AuthContextValue {
  user: UserResponse | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (tokenUser: { access_token: string; user: UserResponse }) => void;
  refreshUser: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(() => apollosmsApi.auth.storedUser());
  const [isLoading, setIsLoading] = useState(Boolean(apollosmsApi.auth.token()));

  const refreshUser = async () => {
    if (!apollosmsApi.auth.token()) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const nextUser = await apollosmsApi.auth.me();
      setUser(nextUser);
    } catch (err: any) {
      // Only clear storage and user state on 401 Unauthorized.
      // Do not log out on transient network or 5xx server errors.
      if (err && err.status === 401) {
        apollosmsApi.auth.clear();
        setUser(null);
      } else {
        console.error("Failed to refresh user:", err);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
    const handler = (event: Event) => {
      setUser((event as CustomEvent<UserResponse | undefined>).detail || apollosmsApi.auth.storedUser());
    };
    window.addEventListener("apollosms-auth-change", handler);
    window.addEventListener("renult-auth-change", handler);
    return () => {
      window.removeEventListener("apollosms-auth-change", handler);
      window.removeEventListener("renult-auth-change", handler);
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isAuthenticated: Boolean(user && apollosmsApi.auth.token()),
    isLoading,
    login: (auth) => {
      apollosmsApi.auth.save(auth);
      setUser(auth.user);
      window.dispatchEvent(new CustomEvent("apollosms-login", { detail: { userId: auth.user.id } }));
    },
    refreshUser,
    logout: () => {
      apollosmsApi.auth.clear();
      setUser(null);
    },
  }), [user, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-sm text-muted-foreground">Loading account...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-sm text-muted-foreground">Loading account...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (user?.role !== "admin") {
    return <Navigate to="/settings" replace />;
  }

  return <>{children}</>;
}
