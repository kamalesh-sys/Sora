import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { configureFonts, MD3DarkTheme, MD3LightTheme } from "react-native-paper";

import {
  AppLanguage,
  createTranslator,
  getDeviceLanguage,
  isAppLanguage,
  localeTags,
  setActiveLanguage,
  Translate,
} from "../i18n/catalogs";
import { abstractAvatarOptions, type AbstractAvatarKey } from "../components/AbstractAvatar";

const THEME_MODE_KEY = "sora_expense_theme_mode";
const ACCENT_KEY = "sora_expense_accent";
const CUSTOM_ACCENT_KEY = "sora_expense_custom_accent";
const LANGUAGE_KEY = "sora_expense_language";
const AVATAR_KEY = "sora_expense_avatar";

const baseInterFonts = configureFonts({
  config: {
    fontFamily: "Inter_400Regular",
  },
});

const interFonts = {
  ...baseInterFonts,
  bodyLarge: { ...baseInterFonts.bodyLarge, fontFamily: "Inter_400Regular", fontWeight: "400" as const },
  bodyMedium: { ...baseInterFonts.bodyMedium, fontFamily: "Inter_400Regular", fontWeight: "400" as const },
  bodySmall: { ...baseInterFonts.bodySmall, fontFamily: "Inter_400Regular", fontWeight: "400" as const },
  default: { ...baseInterFonts.default, fontFamily: "Inter_400Regular", fontWeight: "400" as const },
  displayLarge: { ...baseInterFonts.displayLarge, fontFamily: "Inter_900Black", fontWeight: "900" as const },
  displayMedium: { ...baseInterFonts.displayMedium, fontFamily: "Inter_900Black", fontWeight: "900" as const },
  displaySmall: { ...baseInterFonts.displaySmall, fontFamily: "Inter_800ExtraBold", fontWeight: "800" as const },
  headlineLarge: { ...baseInterFonts.headlineLarge, fontFamily: "Inter_900Black", fontWeight: "900" as const },
  headlineMedium: { ...baseInterFonts.headlineMedium, fontFamily: "Inter_800ExtraBold", fontWeight: "800" as const },
  headlineSmall: { ...baseInterFonts.headlineSmall, fontFamily: "Inter_800ExtraBold", fontWeight: "800" as const },
  labelLarge: { ...baseInterFonts.labelLarge, fontFamily: "Inter_700Bold", fontWeight: "700" as const },
  labelMedium: { ...baseInterFonts.labelMedium, fontFamily: "Inter_600SemiBold", fontWeight: "600" as const },
  labelSmall: { ...baseInterFonts.labelSmall, fontFamily: "Inter_600SemiBold", fontWeight: "600" as const },
  titleLarge: { ...baseInterFonts.titleLarge, fontFamily: "Inter_800ExtraBold", fontWeight: "800" as const },
  titleMedium: { ...baseInterFonts.titleMedium, fontFamily: "Inter_700Bold", fontWeight: "700" as const },
  titleSmall: { ...baseInterFonts.titleSmall, fontFamily: "Inter_700Bold", fontWeight: "700" as const },
};

const systemFontFamily = Platform.select({ android: "sans-serif", ios: "System", default: "System" });
const systemFonts = Object.fromEntries(
  Object.entries(interFonts).map(([name, config]) => [name, { ...config, fontFamily: systemFontFamily }])
) as typeof interFonts;

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
  { name: "blue", label: "Blue", color: "#0052ff" },
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
  avatarKey: AbstractAvatarKey;
  customAccentColor: string;
  colors: AppColors;
  language: AppLanguage;
  locale: string;
  paperTheme: typeof MD3LightTheme;
  setAccentName: (nextAccent: AccentName) => void;
  setAvatarKey: (nextAvatar: AbstractAvatarKey) => void;
  setCustomAccentColor: (nextColor: string) => void;
  setLanguage: (nextLanguage: AppLanguage) => void;
  setThemeMode: (nextMode: ThemeMode) => void;
  settingsReady: boolean;
  t: Translate;
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
      background: "#0a0b0d",
      border: "rgba(138,145,158,0.24)",
      card: "#141519",
      danger: "#f0616d",
      muted: "#8a919e",
      success: "#27ad75",
      text: "#ffffff",
      warning: "#f07836",
    };
  }

  return {
    accent,
    background: "#ffffff",
    border: "rgba(91,97,110,0.2)",
    card: "#ffffff",
    danger: "#cf202f",
    muted: "#5b616e",
    success: "#098551",
    text: "#0a0b0d",
    warning: "#cf470e",
  };
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark";
}

function isAccentName(value: string | null): value is AccentName {
  return value === "custom" || accentOptions.some((item) => item.name === value);
}

function isAvatarKey(value: string | null): value is AbstractAvatarKey {
  return abstractAvatarOptions.some((item) => item === value);
}

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>("light");
  const [accentName, setAccentNameState] = useState<AccentName>("blue");
  const [customAccentColor, setCustomAccentColorState] = useState("#0052ff");
  const [language, setLanguageState] = useState<AppLanguage>(() => getDeviceLanguage());
  const [avatarKey, setAvatarKeyState] = useState<AbstractAvatarKey>("orbit");
  const [settingsReady, setSettingsReady] = useState(false);

  useEffect(() => {
    async function restoreSettings() {
      try {
        const [savedThemeMode, savedAccent, savedCustomAccent, savedLanguage, savedAvatar] = await Promise.all([
          SecureStore.getItemAsync(THEME_MODE_KEY),
          SecureStore.getItemAsync(ACCENT_KEY),
          SecureStore.getItemAsync(CUSTOM_ACCENT_KEY),
          SecureStore.getItemAsync(LANGUAGE_KEY),
          SecureStore.getItemAsync(AVATAR_KEY),
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
        if (isAppLanguage(savedLanguage)) {
          setLanguageState(savedLanguage);
          setActiveLanguage(savedLanguage);
        }
        if (isAvatarKey(savedAvatar)) {
          setAvatarKeyState(savedAvatar);
        }
      } catch {
        // Display preferences are non-critical. Keep device-aware defaults if storage is unavailable.
      } finally {
        setSettingsReady(true);
      }
    }

    restoreSettings();
  }, []);

  const accent = getAccentColor(accentName, customAccentColor);
  const colors = useMemo(() => getColors(themeMode, accent), [accent, themeMode]);
  const t = useMemo(() => createTranslator(language), [language]);
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
      fonts: language === "en" ? interFonts : systemFonts,
    };
  }, [colors, language, themeMode]);

  const value = useMemo<AppSettingsContextValue>(
    () => ({
      accentName,
      accentColor: accent,
      avatarKey,
      customAccentColor,
      colors,
      language,
      locale: localeTags[language],
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
      setAvatarKey: (nextAvatar) => {
        setAvatarKeyState(nextAvatar);
        SecureStore.setItemAsync(AVATAR_KEY, nextAvatar).catch(() => undefined);
      },
      setLanguage: (nextLanguage) => {
        setLanguageState(nextLanguage);
        setActiveLanguage(nextLanguage);
        SecureStore.setItemAsync(LANGUAGE_KEY, nextLanguage).catch(() => undefined);
      },
      setThemeMode: (nextMode) => {
        setThemeModeState(nextMode);
        SecureStore.setItemAsync(THEME_MODE_KEY, nextMode).catch(() => undefined);
      },
      settingsReady,
      t,
      themeMode,
    }),
    [accent, accentName, avatarKey, colors, customAccentColor, language, paperTheme, settingsReady, t, themeMode]
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
