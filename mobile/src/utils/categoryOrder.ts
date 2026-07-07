import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ExpenseCategory } from "../types/api";

export const CATEGORY_ORDER_KEY = "sora_expense_add_expense_category_order";

export async function applySavedCategoryOrder(rows: ExpenseCategory[]) {
  try {
    const rawOrder = await AsyncStorage.getItem(CATEGORY_ORDER_KEY);
    const savedIds = rawOrder ? (JSON.parse(rawOrder) as number[]) : [];
    if (!Array.isArray(savedIds) || !savedIds.length) {
      return rows;
    }

    const byId = new Map(rows.map((item) => [item.id, item]));
    const ordered = savedIds.map((id) => byId.get(id)).filter((item): item is ExpenseCategory => Boolean(item));
    const missing = rows.filter((item) => !savedIds.includes(item.id));
    return [...ordered, ...missing];
  } catch {
    return rows;
  }
}

export async function saveCategoryOrder(rows: ExpenseCategory[]) {
  await AsyncStorage.setItem(CATEGORY_ORDER_KEY, JSON.stringify(rows.map((item) => item.id)));
}
