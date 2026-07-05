import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";

import {
  getMe,
  loginWithEmail,
  logoutOnServer,
  registerWithEmail,
  requestSignupOtp,
} from "../services/authApi";
import { setAuthToken } from "../services/apiClient";
import { AppUser, AuthResponse } from "../types/auth";

const TOKEN_KEY = "sora_expense_auth_token";

type AuthContextValue = {
  user: AppUser | null;
  token: string | null;
  initializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  requestOtp: (email: string) => Promise<void>;
  register: (name: string, email: string, password: string, otp: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    async function restoreSession() {
      const savedToken = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!savedToken) {
        setInitializing(false);
        return;
      }

      setAuthToken(savedToken);
      try {
        const profile = await getMe();
        setToken(savedToken);
        setUser(profile);
      } catch {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
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
      login: async (email, password) => {
        await applyAuth(await loginWithEmail(email, password));
      },
      requestOtp: async (email) => {
        await requestSignupOtp(email);
      },
      register: async (name, email, password, otp) => {
        await applyAuth(await registerWithEmail(name, email, password, otp));
      },
      logout: async () => {
        try {
          await logoutOnServer();
        } catch {
          // Local logout should still succeed if the server is unreachable.
        }
        await SecureStore.deleteItemAsync(TOKEN_KEY);
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
