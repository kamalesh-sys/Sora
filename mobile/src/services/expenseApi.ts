import {
  BillOccurrence,
  CategoryBudget,
  CategoryBudgetUsage,
  CreateCategoryPayload,
  CreateExpensePayload,
  DashboardSummary,
  Expense,
  ExpenseCategory,
  MonthlyBudget,
  MonthlySummary,
  PaymentMethod,
  PeopleOverview,
  Person,
  PersonLedger,
  RecurringBill,
  SaveBudgetPayload,
  ShareSummary,
  Settlement,
} from "../types/api";
import { cachedGet, client } from "./apiClient";

export type ExpenseFilters = {
  month?: string;
  category?: number;
  payment_method?: PaymentMethod;
  start_date?: string;
  end_date?: string;
  expense_type?: string;
  household?: number;
  limit?: number;
  ordering?: "recent" | "oldest" | "amount_desc" | "amount_asc";
};

function unpackList<T>(data: T[] | { results: T[] }): T[] {
  return Array.isArray(data) ? data : data.results;
}

export async function getCategories() {
  const response = await cachedGet<ExpenseCategory[] | { results: ExpenseCategory[] }>("/categories/");
  return unpackList(response.data);
}

export async function createCategory(payload: CreateCategoryPayload) {
  const response = await client.post<ExpenseCategory>("/categories/", payload);
  return response.data;
}

export async function updateCategory(id: number, payload: CreateCategoryPayload) {
  const response = await client.put<ExpenseCategory>(`/categories/${id}/`, payload);
  return response.data;
}

export async function deleteCategory(id: number) {
  await client.delete(`/categories/${id}/`);
}

export async function seedDefaultCategories() {
  const response = await client.post<ExpenseCategory[]>("/categories/seed-defaults/");
  return response.data;
}

export async function getExpenses(filters: ExpenseFilters = {}) {
  const response = await cachedGet<Expense[] | { results: Expense[] }>("/expenses/", {
    params: filters,
  });
  return unpackList(response.data);
}

export async function getExpense(id: number) {
  const response = await cachedGet<Expense>(`/expenses/${id}/`);
  return response.data;
}

export async function createExpense(payload: CreateExpensePayload) {
  const response = await client.post<Expense>("/expenses/", payload);
  return response.data;
}

export async function updateExpense(id: number, payload: CreateExpensePayload) {
  const response = await client.put<Expense>(`/expenses/${id}/`, payload);
  return response.data;
}

export async function deleteExpense(id: number) {
  await client.delete(`/expenses/${id}/`);
}

export async function getMonthlySummary(month: string) {
  const response = await cachedGet<MonthlySummary>("/reports/monthly-summary/", {
    params: { month },
  });
  return response.data;
}

export async function getDashboardSummary(month: string, limit = 30) {
  const response = await cachedGet<DashboardSummary>("/reports/dashboard-summary/", {
    params: { month, limit },
  });
  return response.data;
}

export async function getBudgets(month?: string) {
  const response = await cachedGet<MonthlyBudget[] | { results: MonthlyBudget[] }>("/budgets/", {
    params: month ? { month } : undefined,
  });
  return unpackList(response.data);
}

export async function createBudget(payload: SaveBudgetPayload) {
  const response = await client.post<MonthlyBudget>("/budgets/", payload);
  return response.data;
}

export async function updateBudget(id: number, payload: SaveBudgetPayload) {
  const response = await client.put<MonthlyBudget>(`/budgets/${id}/`, payload);
  return response.data;
}

export async function getPeople() {
  const response = await cachedGet<Person[] | { results: Person[] }>("/people/");
  return unpackList(response.data);
}

export async function getPeopleOverview() {
  const response = await cachedGet<PeopleOverview>("/people/overview/");
  return response.data;
}

export async function createPerson(payload: Partial<Person> & { name: string }) {
  const response = await client.post<Person>("/people/", payload);
  return response.data;
}

export async function updatePerson(id: number, payload: Partial<Person>) {
  const response = await client.patch<Person>(`/people/${id}/`, payload);
  return response.data;
}

export async function deletePerson(id: number) {
  await client.delete(`/people/${id}/`);
}

export async function getPersonLedger(id: number) {
  const response = await cachedGet<PersonLedger>(`/people/${id}/ledger/`);
  return response.data;
}

export async function getPersonShareSummary(id: number, month?: string) {
  const response = await cachedGet<ShareSummary>(`/people/${id}/share-summary/`, {
    params: month ? { month } : undefined,
  });
  return response.data;
}

export async function getPersonHistory(id: number) {
  const response = await cachedGet<Expense[]>(`/people/${id}/history/`);
  return response.data;
}

export async function createSettlement(payload: {
  amount: string;
  expense?: number | null;
  expense_share?: number | null;
  from_person?: number | null;
  from_user?: number | null;
  method?: PaymentMethod;
  note?: string;
  status?: Settlement["status"];
  to_person?: number | null;
  to_user?: number | null;
}) {
  const response = await client.post<Settlement>("/settlements/", payload);
  return response.data;
}

export async function getCategoryBudgets(params?: { month?: string; household?: number }) {
  const response = await cachedGet<CategoryBudget[] | { results: CategoryBudget[] }>("/category-budgets/", {
    params,
  });
  return unpackList(response.data);
}

export async function saveCategoryBudget(payload: {
  category: number;
  month: string;
  amount: string;
  note?: string;
  household?: number | null;
}) {
  const response = await client.post<CategoryBudget>("/category-budgets/", payload);
  return response.data;
}

export async function getCategoryBudgetUsage(month: string) {
  const response = await cachedGet<CategoryBudgetUsage>("/category-budgets/usage/", {
    params: { month },
  });
  return response.data;
}

export async function getRecurringBills() {
  const response = await cachedGet<RecurringBill[] | { results: RecurringBill[] }>("/recurring-bills/");
  return unpackList(response.data);
}

export async function createRecurringBill(payload: Partial<RecurringBill> & { name: string; amount: string; next_due_date: string }) {
  const response = await client.post<RecurringBill>("/recurring-bills/", payload);
  return response.data;
}

export async function updateRecurringBill(id: number, payload: Partial<RecurringBill>) {
  const response = await client.patch<RecurringBill>(`/recurring-bills/${id}/`, payload);
  return response.data;
}

export async function deleteRecurringBill(id: number) {
  await client.delete(`/recurring-bills/${id}/`);
}

export async function getBillOccurrences() {
  const response = await cachedGet<BillOccurrence[] | { results: BillOccurrence[] }>("/bill-occurrences/");
  return unpackList(response.data);
}

export async function getBillCalendar(month: string) {
  const response = await cachedGet<BillOccurrence[]>("/bill-calendar/", { params: { month } });
  return response.data;
}

export async function markBillPaid(
  id: number,
  payload: boolean | { amount?: string; create_expense?: boolean; paid_date?: string; payment_method?: PaymentMethod } = true
) {
  const body = typeof payload === "boolean" ? { create_expense: payload } : payload;
  const response = await client.post<BillOccurrence>(`/bill-occurrences/${id}/mark-paid/`, body);
  return response.data;
}

export async function skipBillOccurrence(id: number) {
  const response = await client.post<BillOccurrence>(`/bill-occurrences/${id}/skip/`);
  return response.data;
}

