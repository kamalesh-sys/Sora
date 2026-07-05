import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import type { WidgetInfo, WidgetRepresentation } from "react-native-android-widget";

import type { Expense } from "../types/api";
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
  paymentMethod: "",
  title: "No expense yet",
};

function toWidgetData(expense?: Expense | null): SoraExpenseWidgetData {
  if (!expense) {
    return emptyWidgetData;
  }

  return {
    amount: formatCurrencyCompact(expense.amount),
    category: expense.category_detail?.name ?? "Uncategorized",
    dateLabel: formatRelativeDateLabel(expense.expense_date),
    hasExpense: true,
    paymentMethod: formatPaymentMethod(expense.payment_method),
    title: expense.title,
  };
}

export async function getStoredWidgetData() {
  const raw = await AsyncStorage.getItem(WIDGET_STORAGE_KEY);
  if (!raw) {
    return emptyWidgetData;
  }

  try {
    return { ...emptyWidgetData, ...JSON.parse(raw) } as SoraExpenseWidgetData;
  } catch {
    return emptyWidgetData;
  }
}

export async function saveLatestExpenseForWidget(expense?: Expense | null) {
  const data = toWidgetData(expense);
  await AsyncStorage.setItem(WIDGET_STORAGE_KEY, JSON.stringify(data));
  return data;
}

export async function renderSoraExpenseWidget(): Promise<WidgetRepresentation> {
  const data = await getStoredWidgetData();
  const widgetComponent = require("./SoraExpenseWidget") as typeof import("./SoraExpenseWidget");
  return widgetComponent.SoraExpenseWidget(data);
}

export async function updateSoraExpenseWidget(expense?: Expense | null) {
  await saveLatestExpenseForWidget(expense);

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
