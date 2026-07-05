import type { MaterialCommunityIcons } from "@expo/vector-icons";

export const soraPalette = {
  black: "#071226",
  muted: "#667085",
  surface: "#FFFFFF",
  appBackground: "#F8F9FE",
  border: "#EEF0F6",
  purple: "#6C48F5",
  purpleLight: "#8A6AF8",
  purpleSoft: "#F3F0FF",
  green: "#2F9E55",
  greenSurface: "#F2FCF5",
  greenBorder: "#DDF7E6",
  red: "#D94841",
  redSurface: "#FFF5F4",
  redBorder: "#F7DDDB",
  blue: "#5B7BEF",
  iconMuted: "#9EA4B3",
};

export const soraSpacing = {
  screenX: 24,
  section: 28,
  card: 20,
};

export const soraRadius = {
  card: 24,
  pill: 999,
  icon: 28,
};

export const soraShadow = {
  soft: {
    elevation: 2,
    shadowColor: "#1D2939",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  purple: {
    elevation: 4,
    shadowColor: soraPalette.purple,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
  },
};

export type CategoryVisual = {
  background: string;
  color: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
};

const categoryVisuals: Record<string, CategoryVisual> = {
  electricity: { icon: "lightbulb-outline", color: "#F79009", background: "#FFF8EC" },
  fuel: { icon: "gas-station-outline", color: "#D94841", background: "#FFF5F4" },
  groceries: { icon: "cart-outline", color: "#54B96A", background: "#F1FCF4" },
  home: { icon: "home-outline", color: "#6C48F5", background: "#F3F0FF" },
  petrol: { icon: "gas-station-outline", color: "#D94841", background: "#FFF5F4" },
  shopping: { icon: "shopping-outline", color: "#D95FA7", background: "#FFF1FA" },
  transport: { icon: "car-outline", color: "#6C48F5", background: "#F3F0FF" },
  utilities: { icon: "lightning-bolt-outline", color: "#5B7BEF", background: "#F1F5FF" },
};

export function getCategoryVisual(name?: string | null, icon?: string, color?: string): CategoryVisual {
  const key = (name ?? "").trim().toLowerCase();
  const match = Object.keys(categoryVisuals).find((item) => key.includes(item));
  const base = match ? categoryVisuals[match] : { icon: "receipt-text-outline", color: soraPalette.purple, background: soraPalette.purpleSoft };

  return {
    icon: (icon || base.icon) as keyof typeof MaterialCommunityIcons.glyphMap,
    color: color || base.color,
    background: base.background,
  };
}
