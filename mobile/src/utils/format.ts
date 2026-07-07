import { PaymentMethod } from "../types/api";

const paymentLabels: Record<string, string> = {
  bank: "Bank transfer",
  card: "Card",
  upi: "UPI",
  cash: "Cash",
  wallet: "Wallet",
  other: "Other",
};

export function parseAmount(value: string | number | null | undefined) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function formatCurrency(value: string | number | null | undefined) {
  const amount = parseAmount(value);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatCurrencyCompact(value: string | number | null | undefined) {
  const amount = parseAmount(value);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

export function formatPaymentMethod(value: string) {
  return paymentLabels[value] ?? value;
}

export function formatDateLabel(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatRelativeDateLabel(value: string) {
  const date = new Date(`${value}T00:00:00`);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((todayStart.getTime() - dateStart.getTime()) / 86400000);

  if (days === 0) {
    return "Today";
  }
  if (days === 1) {
    return "Yesterday";
  }

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

export function formatMonthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}
