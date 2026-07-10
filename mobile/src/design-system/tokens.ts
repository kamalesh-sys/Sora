export const dsSpace = {
  0: 0,
  0.5: 4,
  1: 8,
  1.5: 12,
  2: 16,
  2.5: 20,
  3: 24,
  4: 32,
  5: 40,
  6: 48,
  8: 64,
} as const;

export const dsSize = {
  icon: {
    sm: 18,
    md: 22,
    lg: 28,
  },
  control: {
    sm: 40,
    md: 48,
    lg: 56,
  },
  screen: {
    compactWidth: 390,
    maxContentWidth: 680,
  },
} as const;

export const dsRadius = {
  none: 0,
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  sheet: 24,
  pill: 999,
} as const;

export const dsTouch = {
  min: 44,
  comfortable: 48,
  large: 56,
} as const;

export const dsDuration = {
  fast: 120,
  base: 180,
  slow: 240,
} as const;

export const dsTypography = {
  display: {
    fontFamily: "Inter_400Regular",
    fontSize: 40,
    fontWeight: "400" as const,
    lineHeight: 48,
  },
  amount: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 48,
    fontWeight: "600" as const,
    lineHeight: 56,
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 28,
    fontWeight: "600" as const,
    lineHeight: 36,
  },
  headline: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    fontWeight: "600" as const,
    lineHeight: 24,
  },
  bodyStrong: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    fontWeight: "600" as const,
    lineHeight: 24,
  },
  body: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    fontWeight: "400" as const,
    lineHeight: 24,
  },
  label: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    fontWeight: "600" as const,
    lineHeight: 20,
  },
  caption: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    fontWeight: "600" as const,
    lineHeight: 16,
  },
} as const;

export const dsColorPrimitives = {
  blue0: "#F5F8FF",
  blue50: "#EFF6FF",
  blue600: "#0052FF",
  green0: "#F5FFFB",
  green50: "#EAF8EF",
  green600: "#098551",
  orange0: "#FFFAF5",
  orange50: "#FFF7E6",
  orange600: "#CF470E",
  red0: "#FFF5F6",
  red50: "#FEF2F2",
  red600: "#CF202F",
  gray0: "#FFFFFF",
  gray5: "#F7F8F9",
  gray10: "#EEF0F3",
  gray20: "#CED2DB",
  gray40: "#89909E",
  gray50: "#717886",
  gray60: "#5B616E",
  gray80: "#32353D",
  gray100: "#0A0B0D",
} as const;

export const dsShadow = {
  none: {
    elevation: 0,
    shadowOpacity: 0,
  },
  low: {
    elevation: 1,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  medium: {
    elevation: 3,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
} as const;

export const dsState = {
  success: dsColorPrimitives.green600,
  successBg: dsColorPrimitives.green50,
  warning: dsColorPrimitives.orange600,
  warningBg: dsColorPrimitives.orange50,
  danger: dsColorPrimitives.red600,
  dangerBg: dsColorPrimitives.red50,
  info: dsColorPrimitives.blue600,
  infoBg: dsColorPrimitives.blue50,
} as const;

export type DsColorScheme = {
  accent: string;
  accentWash: string;
  bg: string;
  bgAlt: string;
  bgInverse: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  borderStrong: string;
  text: string;
  textInverse: string;
  textMuted: string;
  textSubtle: string;
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  danger: string;
  dangerBg: string;
  info: string;
  infoBg: string;
  chipBg: string;
  press: string;
};

export function makeDsColors(themeMode: "light" | "dark", accent: string): DsColorScheme {
  if (themeMode === "dark") {
    return {
      accent,
      accentWash: "rgba(87,139,250,0.16)",
      bg: "#0A0B0D",
      bgAlt: "#1E2025",
      bgInverse: "#FFFFFF",
      surface: "#141519",
      surfaceAlt: "#1E2025",
      border: "rgba(138,145,158,0.24)",
      borderStrong: "rgba(138,145,158,0.66)",
      text: "#FFFFFF",
      textInverse: "#0A0B0D",
      textMuted: "#8A919E",
      textSubtle: "#A5AAB6",
      success: "#27AD75",
      successBg: "rgba(39,173,117,0.16)",
      warning: "#F07836",
      warningBg: "rgba(240,120,54,0.16)",
      danger: "#F0616D",
      dangerBg: "rgba(240,97,109,0.16)",
      info: "#578BFA",
      infoBg: "rgba(87,139,250,0.16)",
      chipBg: "#282B31",
      press: "rgba(255,255,255,0.08)",
    };
  }

  return {
    accent,
    accentWash: dsColorPrimitives.blue0,
    bg: dsColorPrimitives.gray0,
    bgAlt: dsColorPrimitives.gray10,
    bgInverse: dsColorPrimitives.gray100,
    surface: dsColorPrimitives.gray0,
    surfaceAlt: dsColorPrimitives.gray5,
    border: "rgba(91,97,110,0.2)",
    borderStrong: "rgba(91,97,110,0.66)",
    text: dsColorPrimitives.gray100,
    textInverse: dsColorPrimitives.gray0,
    textMuted: dsColorPrimitives.gray60,
    textSubtle: dsColorPrimitives.gray50,
    success: dsState.success,
    successBg: dsState.successBg,
    warning: dsState.warning,
    warningBg: dsState.warningBg,
    danger: dsState.danger,
    dangerBg: dsState.dangerBg,
    info: dsState.info,
    infoBg: dsState.infoBg,
    chipBg: dsColorPrimitives.gray10,
    press: "rgba(10,11,13,0.06)",
  };
}
