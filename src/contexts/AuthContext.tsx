import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode
} from "react";

type Account = {
  id: string;
  email: string;
  role: "admin" | "verifier";
};

type AccountProfile = {
  role: Account["role"];
  full_name: string | null;
};

type AuthError = { message: string };

type AuthContextType = {
  user: Account | null;
  session: { authenticated: true } | null;
  profile: AccountProfile | null;
  loading: boolean;
  signIn: (
    email: string,
    password: string
  ) => Promise<{ error: AuthError | null; role?: Account["role"] }>;
  signInWithOtp: (
    email: string,
    code: string
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
  const [user, setUser] = useState<Account | null>(null);
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

    if (
      data.authenticated === true &&
      (data.role === "admin" || data.role === "verifier") &&
      typeof data.user?.id === "string" &&
      typeof data.user?.email === "string"
    ) {
      setUser({
        id: data.user.id,
        email: data.user.email,
        role: data.role
      });
      return data.role as Account["role"];
    }

    setUser(null);
    return null;
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

      return { error: null, role: authenticated };
    } catch {
      return { error: { message: "Unable to connect to login service" } };
    }
  }


  async function signInWithOtp(email: string, code: string) {
    try {
      const response = await fetch("/api/auth/totp/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code })
      });

      if (!response.ok) {
        return {
          error: {
            message: response.status === 429
              ? "Too many attempts. Try again later."
              : "Invalid or expired authenticator code"
          }
        };
      }

      const authenticated = await refreshSession();

      if (!authenticated) {
        return { error: { message: "Unable to confirm login session" } };
      }

      return { error: null, role: authenticated };
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

  const profile: AccountProfile | null = user
    ? { role: user.role, full_name: null }
    : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        session: user ? { authenticated: true } : null,
        profile,
        loading,
        signIn,
        signInWithOtp,
        signOut,
        isAdmin: () => user?.role === "admin"
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
