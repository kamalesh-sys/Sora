import { AppLanguage, getActiveLanguage, getLocaleTag, translate } from "../i18n/catalogs";
import type { PaymentMethod } from "../types/api";

const paymentLabels: Record<PaymentMethod, string> = {
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

export function formatCurrency(value: string | number | null | undefined, language: AppLanguage = getActiveLanguage()) {
  const amount = parseAmount(value);
  return new Intl.NumberFormat(getLocaleTag(language), {
    style: "currency",
    currency: "INR",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatCurrencyCompact(value: string | number | null | undefined, language: AppLanguage = getActiveLanguage()) {
  const amount = parseAmount(value);
  return new Intl.NumberFormat(getLocaleTag(language), {
    style: "currency",
    currency: "INR",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

export function formatPaymentMethod(value: PaymentMethod | string, language: AppLanguage = getActiveLanguage()) {
  const label = paymentLabels[value as PaymentMethod];
  return label ? translate(language, label) : value;
}

export function formatDateLabel(value: string, language: AppLanguage = getActiveLanguage()) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(getLocaleTag(language), {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatRelativeDateLabel(value: string, language: AppLanguage = getActiveLanguage()) {
  const date = new Date(`${value}T00:00:00`);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((todayStart.getTime() - dateStart.getTime()) / 86400000);

  if (days === 0) {
    return translate(language, "Today");
  }
  if (days === 1) {
    return translate(language, "Yesterday");
  }

  return date.toLocaleDateString(getLocaleTag(language), {
    day: "numeric",
    month: "short",
  });
}

export function formatMonthLabel(value: string, language: AppLanguage = getActiveLanguage()) {
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(getLocaleTag(language), {
    month: "long",
    year: "numeric",
  });
}
