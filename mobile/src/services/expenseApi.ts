import {
  BillOccurrence,
  CategoryBudget,
  CategoryBudgetUsage,
  CreateCategoryPayload,
  CreateExpensePayload,
  DashboardSummary,
  Expense,
  ExpenseCategory,
  AddGoalContributionPayload,
  AddGoalContributionResult,
  Goal,
  GoalMutationResult,
  GoalTemplate,
  Loan,
  LoanPayment,
  LoanPaymentMutationResult,
  LoanDirection,
  LoanStatus,
  SaveGoalPayload,
  SaveLoanPayload,
  SaveLoanPaymentPayload,
  SkipGoalResult,
  MonthlyBudget,
  MonthlySummary,
  PaymentMethod,
  TransactionType,
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
  transaction_type?: TransactionType;
};

export type TransactionFilters = ExpenseFilters;

function unpackList<T>(data: T[] | { results: T[] }): T[] {
  return Array.isArray(data) ? data : data.results;
}

export async function getCategories(transactionType: TransactionType = "expense") {
  const response = await cachedGet<ExpenseCategory[] | { results: ExpenseCategory[] }>("/categories/", {
    params: { transaction_type: transactionType },
  });
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

export async function seedDefaultCategories(transactionType: TransactionType = "expense") {
  const response = await client.post<ExpenseCategory[]>("/categories/seed-defaults/", {
    transaction_type: transactionType,
  });
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

export async function getTransactions(filters: TransactionFilters = {}) {
  const response = await cachedGet<Expense[] | { results: Expense[] }>("/transactions/", {
    params: filters,
  });
  return unpackList(response.data);
}

export async function getTransaction(id: number) {
  const response = await cachedGet<Expense>(`/transactions/${id}/`);
  return response.data;
}

export async function createTransaction(payload: CreateExpensePayload) {
  const response = await client.post<Expense>("/transactions/", payload);
  return response.data;
}

export async function updateTransaction(id: number, payload: CreateExpensePayload) {
  const response = await client.put<Expense>(`/transactions/${id}/`, payload);
  return response.data;
}

export async function deleteTransaction(id: number) {
  await client.delete(`/transactions/${id}/`);
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

export async function getGoals() {
  const response = await cachedGet<Goal[] | { results: Goal[] }>("/goals/");
  return unpackList(response.data);
}

export async function getGoal(id: number) {
  const response = await cachedGet<Goal>(`/goals/${id}/`);
  return response.data;
}

export async function getGoalTemplates() {
  const response = await cachedGet<GoalTemplate[]>("/goals/templates/", undefined, 5 * 60 * 1000);
  return response.data;
}

export async function createGoal(payload: SaveGoalPayload) {
  const response = await client.post<Goal>("/goals/", payload);
  return response.data;
}

export async function updateGoal(id: number, payload: SaveGoalPayload) {
  const response = await client.patch<Goal>(`/goals/${id}/`, payload);
  return response.data;
}

export async function deleteGoal(id: number) {
  await client.delete(`/goals/${id}/`);
}

export async function addGoalContribution(id: number, payload: AddGoalContributionPayload) {
  const response = await client.post<AddGoalContributionResult>(`/goals/${id}/contributions/`, payload);
  return response.data;
}

export async function updateGoalContribution(
  goalId: number,
  contributionId: number,
  payload: Partial<AddGoalContributionPayload>
) {
  const response = await client.patch<AddGoalContributionResult>(
    `/goals/${goalId}/contributions/${contributionId}/`,
    payload
  );
  return response.data;
}

export async function deleteGoalContribution(goalId: number, contributionId: number) {
  const response = await client.delete<GoalMutationResult>(`/goals/${goalId}/contributions/${contributionId}/`);
  return response.data;
}

export async function skipGoalMonth(id: number, month: string) {
  const response = await client.post<SkipGoalResult>(`/goals/${id}/skip/`, { month });
  return response.data;
}

export async function undoGoalMonthSkip(goalId: number, skipId: number) {
  const response = await client.delete<GoalMutationResult>(`/goals/${goalId}/skips/${skipId}/`);
  return response.data;
}

export async function getLoans(filters: { direction?: LoanDirection; status?: LoanStatus } = {}) {
  const response = await cachedGet<Loan[] | { results: Loan[] }>("/loans/", { params: filters });
  return unpackList(response.data);
}

export async function getLoan(id: number) {
  const response = await cachedGet<Loan>(`/loans/${id}/`);
  return response.data;
}

export async function createLoan(payload: SaveLoanPayload) {
  const response = await client.post<Loan>("/loans/", payload);
  return response.data;
}

export async function updateLoan(id: number, payload: Partial<SaveLoanPayload>) {
  const response = await client.patch<Loan>(`/loans/${id}/`, payload);
  return response.data;
}

export async function deleteLoan(id: number) {
  await client.delete(`/loans/${id}/`);
}

export async function getLoanPayments(id: number) {
  const response = await cachedGet<LoanPayment[]>(`/loans/${id}/payments/`);
  return response.data;
}

export async function createLoanPayment(id: number, payload: SaveLoanPaymentPayload) {
  const response = await client.post<LoanPaymentMutationResult>(`/loans/${id}/payments/`, payload);
  return response.data;
}

export async function deleteLoanPayment(loanId: number, paymentId: number) {
  const response = await client.delete<LoanPaymentMutationResult>(`/loans/${loanId}/payments/${paymentId}/`);
  return response.data;
}

