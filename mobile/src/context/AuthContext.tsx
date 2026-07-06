import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";

import {
  getMe,
  loginWithEmail,
  logoutOnServer,
  registerWithEmail,
} from "../services/authApi";
import { setAuthToken } from "../services/apiClient";
import { AppUser, AuthResponse } from "../types/auth";

const TOKEN_KEY = "sora_expense_auth_token";

type AuthContextValue = {
  user: AppUser | null;
  token: string | null;
  initializing: boolean;
  login: (email: string, password: string, turnstileToken: string) => Promise<void>;
  register: (name: string, email: string, password: string, turnstileToken: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    async function restoreSession() {
      try {
        const savedToken = await SecureStore.getItemAsync(TOKEN_KEY);
        if (!savedToken) {
          return;
        }

        setAuthToken(savedToken);
        const profile = await getMe();
        setToken(savedToken);
        setUser(profile);
      } catch {
        await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
        setAuthToken(null);
      } finally {
        setInitializing(false);
      }
    }

    restoreSession();
  }, []);

  const applyAuth = async (auth: AuthResponse) => {
    await SecureStore.setItemAsync(TOKEN_KEY, auth.token);
    setAuthToken(auth.token);
    setToken(auth.token);
    setUser(auth.user);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      initializing,
      login: async (email, password, turnstileToken) => {
        await applyAuth(await loginWithEmail(email, password, turnstileToken));
      },
      register: async (name, email, password, turnstileToken) => {
        await applyAuth(await registerWithEmail(name, email, password, turnstileToken));
      },
      logout: async () => {
        try {
          await logoutOnServer();
        } catch {
          // Local logout should still succeed if the server is unreachable.
        }
        await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
        setAuthToken(null);
        setToken(null);
        setUser(null);
      },
    }),
    [initializing, token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return value;
}
