import { MaterialCommunityIcons } from "@expo/vector-icons";

import type {
  Loan,
  LoanDirection,
  LoanDisplayStatus,
  LoanRepaymentFrequency,
  LoanType,
} from "../../types/api";
import { getTodayDate } from "../../utils/date";
import { parseAmount } from "../../utils/format";

export const loanTypeOptions: Array<{ label: string; value: LoanType }> = [
  { label: "Personal", value: "personal" },
  { label: "Home", value: "home" },
  { label: "Business", value: "business" },
  { label: "Vehicle", value: "vehicle" },
  { label: "Education", value: "education" },
  { label: "Credit", value: "credit" },
  { label: "Other", value: "other" },
];

export const repaymentFrequencyOptions: Array<{ label: string; value: LoanRepaymentFrequency }> = [
  { label: "One-time", value: "one_time" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Custom", value: "custom" },
];

export function sanitizeLoanAmount(value: string) {
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

export function getLoanDirectionCopy(direction: LoanDirection) {
  return direction === "borrowed"
    ? { action: "You owe", counterparty: "Lender", icon: "arrow-down-left", label: "Borrowed" }
    : { action: "Owed to you", counterparty: "Borrower", icon: "arrow-up-right", label: "Lent" };
}

export function getLoanIcon(direction: LoanDirection): keyof typeof MaterialCommunityIcons.glyphMap {
  return direction === "borrowed" ? "arrow-down-left" : "arrow-up-right";
}

export function getLoanStatusMeta(status: LoanDisplayStatus) {
  if (status === "closed") {
    return { icon: "check-circle" as const, label: "Closed", tone: "success" as const };
  }
  if (status === "overdue") {
    return { icon: "calendar-alert" as const, label: "Overdue", tone: "danger" as const };
  }
  return { icon: "clock-outline" as const, label: "Active", tone: "info" as const };
}

export function getLoanDueCopy(loan: Loan) {
  if (loan.status === "closed") return "Fully settled";
  if (!loan.next_due_date) return "No repayment date set";
  if (loan.days_until_due === null) return `Due ${loan.next_due_date}`;
  if (loan.days_until_due < 0) return `${Math.abs(loan.days_until_due)} days overdue`;
  if (loan.days_until_due === 0) return "Due today";
  if (loan.days_until_due === 1) return "Due tomorrow";
  return `Due in ${loan.days_until_due} days`;
}

export function getLoanProgress(loan: Loan) {
  const initial = parseAmount(loan.principal_amount);
  const paid = parseAmount(loan.principal_paid);
  return initial > 0 ? Math.max(0, Math.min(1, paid / initial)) : 0;
}

export function isLoanPaymentDateValid(value: string, loan: Loan) {
  return value >= loan.disbursed_date && value <= getTodayDate();
}
