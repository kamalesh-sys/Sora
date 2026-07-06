import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { MD3DarkTheme, MD3LightTheme } from "react-native-paper";

const THEME_MODE_KEY = "sora_expense_theme_mode";
const ACCENT_KEY = "sora_expense_accent";
const CUSTOM_ACCENT_KEY = "sora_expense_custom_accent";

export type ThemeMode = "light" | "dark";
export type AccentName =
  | "blue"
  | "green"
  | "purple"
  | "orange"
  | "teal"
  | "rose"
  | "slate"
  | "indigo"
  | "custom";

export const accentOptions: { name: AccentName; label: string; color: string }[] = [
  { name: "blue", label: "Blue", color: "#2563eb" },
  { name: "green", label: "Green", color: "#16a34a" },
  { name: "purple", label: "Purple", color: "#6d28d9" },
  { name: "orange", label: "Orange", color: "#ea580c" },
  { name: "teal", label: "Teal", color: "#0f766e" },
  { name: "rose", label: "Rose", color: "#e11d48" },
  { name: "slate", label: "Slate", color: "#475569" },
  { name: "indigo", label: "Indigo", color: "#4f46e5" },
];

export type AppColors = {
  accent: string;
  background: string;
  border: string;
  card: string;
  danger: string;
  muted: string;
  success: string;
  text: string;
  warning: string;
};

type AppSettingsContextValue = {
  accentName: AccentName;
  accentColor: string;
  customAccentColor: string;
  colors: AppColors;
  paperTheme: typeof MD3LightTheme;
  setAccentName: (nextAccent: AccentName) => void;
  setCustomAccentColor: (nextColor: string) => void;
  setThemeMode: (nextMode: ThemeMode) => void;
  themeMode: ThemeMode;
};

const AppSettingsContext = createContext<AppSettingsContextValue | undefined>(undefined);

function getAccentColor(accentName: AccentName, customAccentColor: string) {
  if (accentName === "custom") {
    return customAccentColor;
  }
  return accentOptions.find((item) => item.name === accentName)?.color ?? accentOptions[0].color;
}

function getColors(themeMode: ThemeMode, accent: string): AppColors {
  if (themeMode === "dark") {
    return {
      accent,
      background: "#0f172a",
      border: "#273449",
      card: "#111827",
      danger: "#f87171",
      muted: "#94a3b8",
      success: "#4ade80",
      text: "#f8fafc",
      warning: "#fbbf24",
    };
  }

  return {
    accent,
    background: "#f8fafc",
    border: "#e2e8f0",
    card: "#ffffff",
    danger: "#dc2626",
    muted: "#64748b",
    success: "#16a34a",
    text: "#0f172a",
    warning: "#d97706",
  };
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark";
}

function isAccentName(value: string | null): value is AccentName {
  return value === "custom" || accentOptions.some((item) => item.name === value);
}

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>("light");
  const [accentName, setAccentNameState] = useState<AccentName>("blue");
  const [customAccentColor, setCustomAccentColorState] = useState("#2563eb");

  useEffect(() => {
    async function restoreSettings() {
      try {
        const [savedThemeMode, savedAccent, savedCustomAccent] = await Promise.all([
          SecureStore.getItemAsync(THEME_MODE_KEY),
          SecureStore.getItemAsync(ACCENT_KEY),
          SecureStore.getItemAsync(CUSTOM_ACCENT_KEY),
        ]);

        if (isThemeMode(savedThemeMode)) {
          setThemeModeState(savedThemeMode);
        }
        if (isAccentName(savedAccent)) {
          setAccentNameState(savedAccent);
        }
        if (savedCustomAccent && /^#[0-9a-fA-F]{6}$/.test(savedCustomAccent)) {
          setCustomAccentColorState(savedCustomAccent);
        }
      } catch {
        // Theme preferences are non-critical. Keep defaults if secure storage is unavailable.
      }
    }

    restoreSettings();
  }, []);

  const accent = getAccentColor(accentName, customAccentColor);
  const colors = useMemo(() => getColors(themeMode, accent), [accent, themeMode]);
  const paperTheme = useMemo(() => {
    const baseTheme = themeMode === "dark" ? MD3DarkTheme : MD3LightTheme;

    return {
      ...baseTheme,
      roundness: 8,
      colors: {
        ...baseTheme.colors,
        primary: colors.accent,
        background: colors.background,
        surface: colors.card,
        surfaceVariant: colors.card,
        onSurface: colors.text,
        onSurfaceVariant: colors.muted,
        outline: colors.border,
        error: colors.danger,
      },
    };
  }, [colors, themeMode]);

  const value = useMemo<AppSettingsContextValue>(
    () => ({
      accentName,
      accentColor: accent,
      customAccentColor,
      colors,
      paperTheme,
      setAccentName: (nextAccent) => {
        setAccentNameState(nextAccent);
        SecureStore.setItemAsync(ACCENT_KEY, nextAccent).catch(() => undefined);
      },
      setCustomAccentColor: (nextColor) => {
        setCustomAccentColorState(nextColor);
        setAccentNameState("custom");
        SecureStore.setItemAsync(CUSTOM_ACCENT_KEY, nextColor).catch(() => undefined);
        SecureStore.setItemAsync(ACCENT_KEY, "custom").catch(() => undefined);
      },
      setThemeMode: (nextMode) => {
        setThemeModeState(nextMode);
        SecureStore.setItemAsync(THEME_MODE_KEY, nextMode).catch(() => undefined);
      },
      themeMode,
    }),
    [accent, accentName, colors, customAccentColor, paperTheme, themeMode]
  );

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings() {
  const value = useContext(AppSettingsContext);
  if (!value) {
    throw new Error("useAppSettings must be used inside AppSettingsProvider.");
  }
  return value;
}
