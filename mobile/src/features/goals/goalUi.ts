import { MaterialCommunityIcons } from "@expo/vector-icons";

import type { Goal, GoalHealthStatus } from "../../types/api";
import { parseAmount } from "../../utils/format";

export type GoalTone = "primary" | "success" | "warning" | "danger";

export const goalColorPresets = [
  { label: "Forest", value: "#2E7D5B" },
  { label: "Blue", value: "#276EF1" },
  { label: "Violet", value: "#7A5AF8" },
  { label: "Amber", value: "#B54708" },
  { label: "Rose", value: "#C11574" },
  { label: "Teal", value: "#087E8B" },
  { label: "Slate", value: "#344054" },
] as const;

const goalIcons: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  business: "briefcase-outline",
  education: "school-outline",
  emergency: "shield-check-outline",
  gadget: "laptop",
  home: "home-heart",
  travel: "airplane",
  vehicle: "car-outline",
  wedding: "ring",
};

export function getGoalIcon(value?: string, templateKey?: string) {
  const normalizedValue = value?.trim().toLowerCase();
  if (normalizedValue && normalizedValue in MaterialCommunityIcons.glyphMap) {
    return normalizedValue as keyof typeof MaterialCommunityIcons.glyphMap;
  }
  return goalIcons[templateKey?.toLowerCase() ?? ""] ?? "star-four-points-outline";
}

export function sanitizeGoalAmount(value: string) {
  const clean = value.replace(/[^\d.]/g, "");
  const [whole, ...rest] = clean.split(".");
  const decimal = rest.join("").slice(0, 2);
  return rest.length ? `${whole}.${decimal}` : whole;
}

export function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fromDateInputValue(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function defaultGoalDate(months = 12) {
  const target = new Date();
  target.setMonth(target.getMonth() + Math.max(1, months));
  return toDateInputValue(target);
}

export function isFutureDate(value: string) {
  const target = fromDateInputValue(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return target.getTime() > today.getTime();
}

export function getGoalProgress(goal: Goal) {
  const fromPercent = Number(goal.progress_percent);
  if (Number.isFinite(fromPercent)) return Math.max(0, Math.min(1, fromPercent / 100));
  const target = parseAmount(goal.target_amount);
  return target > 0 ? Math.max(0, Math.min(1, parseAmount(goal.saved_amount) / target)) : 0;
}

export function getGoalHealthMeta(status: GoalHealthStatus) {
  if (status === "completed") {
    return { icon: "check-circle" as const, label: "Completed", tone: "success" as const };
  }
  if (status === "overdue") {
    return { icon: "calendar-alert" as const, label: "Past target", tone: "danger" as const };
  }
  if (status === "at_risk") {
    return { icon: "alert-circle-outline" as const, label: "Needs attention", tone: "warning" as const };
  }
  return { icon: "check-circle-outline" as const, label: "On track", tone: "info" as const };
}

export function getProgressTone(status: GoalHealthStatus): GoalTone {
  if (status === "completed") return "success";
  if (status === "overdue") return "danger";
  if (status === "at_risk") return "warning";
  return "primary";
}

export function getGoalHealthExplanation(goal: Goal) {
  if (goal.health_status === "completed") {
    return "You reached this goal. Every contribution is saved in your history.";
  }
  if (goal.health_status === "overdue") {
    return "The target date has passed. Edit the date or add the remaining amount to finish the goal.";
  }
  if (goal.health_status === "at_risk") {
    const shortfall = parseAmount(goal.shortfall_amount);
    return shortfall > 0
      ? `You are behind the planned pace. Adding the shortfall now will bring the goal back on track.`
      : "This goal needs a little more each month to reach the target date.";
  }
  return "Your contributions match the pace needed for the target date.";
}

export function safeGoalColor(value: string | undefined, fallback: string) {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

export function goalColorWash(color: string) {
  return `${color}18`;
}
