import type { AppLanguage } from "../i18n/catalogs";

export type SoraExpenseWidgetData = {
  amount: string;
  category: string;
  dateLabel: string;
  hasExpense: boolean;
  language: AppLanguage;
  paymentMethod: string;
  title: string;
};
