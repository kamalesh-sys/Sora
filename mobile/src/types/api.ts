export type PaymentMethod = "upi" | "cash" | "bank" | "card" | "wallet" | "other";
export type ExpenseType = "personal" | "shared" | "household";
export type ExpenseVisibility = "private" | "shared" | "household";

export type ExpenseCategory = {
  id: number;
  name: string;
  icon?: string;
  color?: string;
  created_at: string;
};

export type UserMini = {
  id: number;
  email: string;
  first_name: string;
  last_name?: string;
};

export type Person = {
  id: number;
  name: string;
  email: string | null;
  phone: string;
  relation_type: "family" | "friend" | "roommate" | "relative" | "helper" | "other";
  linked_user?: UserMini | null;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type PeopleInvitation = {
  id: number;
  invited_by: number;
  invited_by_detail?: UserMini;
  email: string;
  relation_type: Person["relation_type"];
  person: number | null;
  person_detail?: Pick<Person, "id" | "name" | "email" | "relation_type"> | null;
  direction?: "sent" | "received";
  status: "pending" | "accepted" | "expired" | "cancelled";
  invite_token?: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Household = {
  id: number;
  name: string;
  description: string;
  monthly_budget: string | null;
  currency: string;
  my_role?: HouseholdMemberRole | null;
  members_count?: number;
  members?: HouseholdMember[];
  created_at: string;
  updated_at: string;
};

export type HouseholdMemberRole = "owner" | "admin" | "member" | "viewer";
export type HouseholdMemberStatus = "active" | "invited" | "removed";
export type HouseholdVisibilityLevel =
  | "shared_only"
  | "category_summary"
  | "monthly_summary"
  | "full_household";

export type HouseholdMember = {
  id: number;
  household: number;
  user: number | null;
  user_detail?: UserMini | null;
  person: number | null;
  person_detail?: Pick<Person, "id" | "name" | "email" | "relation_type"> | null;
  role: HouseholdMemberRole;
  status: HouseholdMemberStatus;
  visibility_level: HouseholdVisibilityLevel;
  joined_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ExpenseShare = {
  id: number;
  expense: number;
  user: number | null;
  user_detail?: UserMini | null;
  person: number | null;
  person_detail?: Pick<Person, "id" | "name" | "email" | "relation_type"> | null;
  household_member?: number | null;
  share_amount: string;
  paid_amount: string;
  pending_amount: string;
  status: "pending" | "partially_paid" | "settled" | "waived";
  note?: string;
};

export type Expense = {
  id: number;
  title: string;
  amount: string;
  category: number | null;
  category_detail: ExpenseCategory | null;
  household: number | null;
  household_detail?: Pick<Household, "id" | "name" | "currency"> | null;
  payment_method: PaymentMethod;
  paid_by_user?: number | null;
  paid_by_user_detail?: UserMini | null;
  paid_by_person?: number | null;
  paid_by_person_detail?: Pick<Person, "id" | "name" | "email" | "relation_type"> | null;
  expense_date: string;
  expense_type?: ExpenseType;
  visibility?: ExpenseVisibility;
  note: string;
  shares?: ExpenseShare[];
  share_summary?: {
    total_share_amount: string;
    settled_amount: string;
    pending_amount: string;
    status: string;
  };
  created_at: string;
  updated_at: string;
};

export type SplitType = "equal" | "custom_amount" | "percentage";

export type CreateExpensePayload = {
  title: string;
  amount: string;
  category: number | null;
  payment_method: PaymentMethod;
  expense_date: string;
  note: string;
  household?: number | null;
  paid_by_user?: number | "me" | null;
  paid_by_person?: number | null;
  visibility?: ExpenseVisibility;
  expense_type?: ExpenseType;
  split_type?: SplitType;
  participants?: Array<{
    person?: number;
    user?: number;
    household_member?: number;
    share_amount?: string;
    percentage?: string;
  }>;
};

export type CreateCategoryPayload = {
  name: string;
  icon?: string;
  color?: string;
};

export type MonthlyBudget = {
  id: number;
  month: string;
  amount: string;
  note: string;
  created_at: string;
  updated_at: string;
};

export type SaveBudgetPayload = {
  month: string;
  amount: string;
  note: string;
};

export type CategoryBreakdownItem = {
  category_id: number | null;
  category_name: string;
  total: string;
  count: number;
};

export type PaymentMethodBreakdownItem = {
  payment_method: PaymentMethod;
  total: string;
  count: number;
};

export type MonthlySummary = {
  month: string;
  total_expense: string;
  total_budget: string;
  balance: string;
  category_breakdown: CategoryBreakdownItem[];
  payment_method_breakdown: PaymentMethodBreakdownItem[];
  expense_count: number;
};

export type DashboardSummary = {
  summary: MonthlySummary;
  previous_summary: MonthlySummary;
  recent_expenses: Expense[];
};

export type Settlement = {
  id: number;
  expense: number | null;
  expense_share: number | null;
  from_user: number | null;
  from_person: number | null;
  to_user: number | null;
  to_person: number | null;
  amount: string;
  method: PaymentMethod;
  status: "pending" | "completed" | "cancelled";
  settled_at: string | null;
  note: string;
  created_by: number;
  created_at: string;
  updated_at: string;
};

export type PersonLedger = {
  total_owed_to_me: string;
  total_i_owe: string;
  settlements_count: number;
  pending_balance: string;
};

export type PeopleOverview = {
  people: Person[];
  invitations: PeopleInvitation[];
  ledgers: Record<string, PersonLedger>;
};

export type HouseholdBalance = {
  share_id: number;
  user: number | null;
  person: number | null;
  name: string;
  pending_amount: string;
  status: ExpenseShare["status"];
};

export type CategoryBudget = {
  id: number;
  user: number | null;
  household: number | null;
  category: number;
  category_detail?: ExpenseCategory;
  month: string;
  amount: string;
  note: string;
  created_at: string;
  updated_at: string;
};

export type CategoryBudgetUsageRow = {
  category_id: number;
  category_name: string;
  budget_amount: string;
  spent_amount: string;
  remaining_amount: string;
  used_percent: string;
  status: "safe" | "careful" | "exceeded";
};

export type CategoryBudgetUsage = {
  month: string;
  rows: CategoryBudgetUsageRow[];
};

export type RecurringBill = {
  id: number;
  user: number | null;
  household: number | null;
  name: string;
  category: number | null;
  category_detail?: ExpenseCategory | null;
  amount: string;
  payment_method: PaymentMethod;
  frequency: "monthly" | "weekly" | "yearly" | "custom";
  due_day: number | null;
  next_due_date: string;
  reminder_days_before: number;
  auto_create_expense: boolean;
  is_active: boolean;
  note: string;
  created_at: string;
  updated_at: string;
};

export type BillOccurrence = {
  id: number;
  recurring_bill: number;
  recurring_bill_detail?: RecurringBill;
  due_date: string;
  amount: string;
  status: "upcoming" | "paid" | "skipped" | "overdue";
  paid_expense: number | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

export type HouseholdMonthlyReport = {
  household: Pick<Household, "id" | "name">;
  month: string;
  total_spent: string;
  household_budget: string;
  remaining: string;
  expense_count: number;
  category_breakdown: CategoryBreakdownItem[];
  payment_method_breakdown: PaymentMethodBreakdownItem[];
  paid_by_breakdown: Array<{ name: string; amount: string }>;
  member_share_breakdown: Array<{
    share_id: number;
    name: string;
    share_amount: string;
    paid_amount: string;
    pending_amount: string;
    status: string;
  }>;
  pending_settlements: Array<{
    share_id: number;
    name: string;
    share_amount: string;
    paid_amount: string;
    pending_amount: string;
    status: string;
  }>;
  recurring_bills: {
    paid: number[];
    unpaid: number[];
    overdue: number[];
  };
  category_budget_usage: CategoryBudgetUsageRow[];
};

export type ShareSummary = {
  text: string;
};
