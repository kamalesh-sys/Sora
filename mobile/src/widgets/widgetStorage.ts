import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import type { WidgetInfo, WidgetRepresentation } from "react-native-android-widget";

import type { Expense } from "../types/api";
import { getActiveLanguage, isAppLanguage, translate } from "../i18n/catalogs";
import { formatCurrencyCompact, formatPaymentMethod, formatRelativeDateLabel } from "../utils/format";
import type { SoraExpenseWidgetData } from "./widgetTypes";

declare const require: (moduleName: string) => unknown;

export const SORA_EXPENSE_WIDGET_NAME = "SoraExpense";

const WIDGET_STORAGE_KEY = "sora_expense_widget_latest";

const emptyWidgetData: SoraExpenseWidgetData = {
  amount: "",
  category: "",
  dateLabel: "",
  hasExpense: false,
  language: getActiveLanguage(),
  paymentMethod: "",
  title: "No expense yet",
};

function getEmptyWidgetData(): SoraExpenseWidgetData {
  return { ...emptyWidgetData, language: getActiveLanguage() };
}

function toWidgetData(expense?: Expense | null): SoraExpenseWidgetData {
  const language = getActiveLanguage();
  if (!expense) {
    return getEmptyWidgetData();
  }

  return {
    amount: formatCurrencyCompact(expense.amount, language),
    category: expense.category_detail?.name ?? translate(language, "Uncategorized"),
    dateLabel: formatRelativeDateLabel(expense.expense_date, language),
    hasExpense: true,
    language,
    paymentMethod: formatPaymentMethod(expense.payment_method, language),
    title: expense.title,
  };
}

export async function getStoredWidgetData() {
  try {
    const raw = await AsyncStorage.getItem(WIDGET_STORAGE_KEY);
    if (!raw) {
      return getEmptyWidgetData();
    }
    const parsed = JSON.parse(raw) as Partial<SoraExpenseWidgetData>;
    return {
      ...getEmptyWidgetData(),
      ...parsed,
      language: isAppLanguage(parsed.language) ? parsed.language : getActiveLanguage(),
    } as SoraExpenseWidgetData;
  } catch {
    return getEmptyWidgetData();
  }
}

export async function saveLatestExpenseForWidget(expense?: Expense | null) {
  const data = toWidgetData(expense);
  await AsyncStorage.setItem(WIDGET_STORAGE_KEY, JSON.stringify(data)).catch(() => undefined);
  return data;
}

export async function renderSoraExpenseWidget(): Promise<WidgetRepresentation> {
  const data = await getStoredWidgetData();
  const widgetComponent = require("./SoraExpenseWidget") as typeof import("./SoraExpenseWidget");
  return widgetComponent.SoraExpenseWidget(data);
}

export async function updateSoraExpenseWidget(expense?: Expense | null) {
  await saveLatestExpenseForWidget(expense).catch(() => undefined);

  if (Platform.OS !== "android") {
    return;
  }

  try {
    const widgetModule = require("react-native-android-widget") as typeof import("react-native-android-widget");
    await widgetModule.requestWidgetUpdate({
      renderWidget: (_widgetInfo: WidgetInfo) => renderSoraExpenseWidget(),
      widgetName: SORA_EXPENSE_WIDGET_NAME,
    });
  } catch {
    // Expo Go and builds without the widget native module should keep running normally.
  }
}
