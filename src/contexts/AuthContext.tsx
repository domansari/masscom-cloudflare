import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode
} from "react";

type AdminUser = {
  id: string;
  email: string;
};

type AdminProfile = {
  role: "admin";
  full_name: string | null;
};

type AuthError = { message: string };

type AuthContextType = {
  user: AdminUser | null;
  session: { authenticated: true } | null;
  profile: AdminProfile | null;
  loading: boolean;
  signIn: (
    email: string,
    password: string
  ) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<{ error: AuthError | null }>;
  isAdmin: () => boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshSession() {
    const response = await fetch("/api/auth/me", {
      credentials: "same-origin",
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("Session check failed");
    }

    const data = await response.json();

    if (data.authenticated === true) {
      setUser({
        id: "admin",
        email: "Administrator"
      });
      return true;
    }

    setUser(null);
    return false;
  }

  useEffect(() => {
    refreshSession()
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function signIn(email: string, password: string) {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        return {
          error: {
            message:
              response.status === 429
                ? "Too many attempts. Try again later."
                : "Invalid email or password"
          }
        };
      }

      const authenticated = await refreshSession();

      if (!authenticated) {
        return { error: { message: "Unable to confirm login session" } };
      }

      setUser({ id: "admin", email });
      return { error: null };
    } catch {
      return { error: { message: "Unable to connect to login service" } };
    }
  }

  async function signOut() {
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin"
      });

      if (!response.ok) {
        return { error: { message: "Unable to sign out" } };
      }

      setUser(null);
      return { error: null };
    } catch {
      return { error: { message: "Unable to sign out" } };
    }
  }

  const profile: AdminProfile | null = user
    ? { role: "admin", full_name: null }
    : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        session: user ? { authenticated: true } : null,
        profile,
        loading,
        signIn,
        signOut,
        isAdmin: () => Boolean(user)
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
