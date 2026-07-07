import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import {
  AppButton,
  AppBottomSheet,
  AppCard,
  AppScreen,
  AppText,
  CategoryChip,
  EmptyState,
  ErrorState,
  FormField,
  IconButton,
  ListRow,
  SectionHeader,
  SkeletonList,
  dsSpace,
  useDs,
} from "../design-system";
import { useAuth } from "../context/AuthContext";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { getCategories, getExpenses } from "../services/expenseApi";
import { exportMonthlyReport, ReportExportType } from "../services/reportExport";
import { getCategoryVisual } from "../theme/soraTheme";
import type { Expense, ExpenseCategory, PaymentMethod } from "../types/api";
import { getCurrentMonth, isValidMonth } from "../utils/date";
import { formatCurrencyCompact, formatDateLabel, formatPaymentMethod, parseAmount } from "../utils/format";

type Props = NativeStackScreenProps<RootStackParamList, "Expenses">;
type PaymentFilter = "all" | PaymentMethod;
type OrderingFilter = "recent" | "oldest" | "amount_desc" | "amount_asc";
type ExpenseSection = { data: Expense[]; key: string; title: string };

const paymentOptions: Array<{ icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: PaymentFilter }> = [
  { icon: "dots-horizontal", label: "All", value: "all" },
  { icon: "cellphone", label: "UPI", value: "upi" },
  { icon: "cash", label: "Cash", value: "cash" },
  { icon: "credit-card-outline", label: "Card", value: "card" },
  { icon: "bank-outline", label: "Bank", value: "bank" },
];

const orderingOptions: Array<{ label: string; value: OrderingFilter }> = [
  { label: "Recent", value: "recent" },
  { label: "Oldest", value: "oldest" },
  { label: "High", value: "amount_desc" },
  { label: "Low", value: "amount_asc" },
];

export function ExpensesScreen({ navigation }: Props) {
  const { colors } = useDs();
  const { token } = useAuth();
  const [month, setMonth] = useState(getCurrentMonth());
  const [exportMonth, setExportMonth] = useState(getCurrentMonth());
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [ordering, setOrdering] = useState<OrderingFilter>("recent");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState<ReportExportType | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const cleanMonth = month.trim();
    if (cleanMonth && !isValidMonth(cleanMonth)) {
      setError("Month must use YYYY-MM format.");
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setError("");
    try {
      const [expenseRows, categoryRows] = await Promise.all([
        getExpenses({
          category: categoryFilter ?? undefined,
          month: cleanMonth || undefined,
          ordering,
          payment_method: paymentFilter === "all" ? undefined : paymentFilter,
        }),
        getCategories(),
      ]);
      setExpenses(expenseRows);
      setCategories(categoryRows);
    } catch {
      setError("Could not load expenses. Pull to retry.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [categoryFilter, month, ordering, paymentFilter]);

  useFocusEffect(
    useCallback(() => {
      setLoading(!expenses.length);
      load();
    }, [expenses.length, load])
  );

  const total = useMemo(() => expenses.reduce((sum, expense) => sum + parseAmount(expense.amount), 0), [expenses]);
  const groupedExpenses = useMemo(() => groupExpensesByDate(expenses), [expenses]);

  const refresh = () => {
    setRefreshing(true);
    load();
  };

  const clearFilters = () => {
    setMonth(getCurrentMonth());
    setCategoryFilter(null);
    setPaymentFilter("all");
    setOrdering("recent");
  };

  const exportReport = async (type: ReportExportType) => {
    if (!token) {
      setError("You must be logged in to export reports.");
      return;
    }
    if (!isValidMonth(exportMonth)) {
      setError("Export month must use YYYY-MM format.");
      return;
    }

    setExporting(type);
    setError("");
    try {
      await exportMonthlyReport({ month: exportMonth, token, type });
      setShowExport(false);
    } catch {
      setError(`Could not export ${type.toUpperCase()} report.`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <AppScreen bottomNavCurrent="Expenses" onRefresh={refresh} refreshing={refreshing}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <AppText variant="title">Expenses</AppText>
          <AppText color="textSubtle" variant="caption">
            {expenses.length} {expenses.length === 1 ? "expense" : "expenses"} | {formatCurrencyCompact(total)}
          </AppText>
        </View>
        <IconButton accessibilityLabel="Export expenses" icon={showExport ? "close" : "file-export-outline"} onPress={() => {
          setExportMonth(month || getCurrentMonth());
          setShowExport((current) => !current);
        }} />
      </View>

      <ErrorState text={error} />

      <AppCard style={[styles.summaryCard, { backgroundColor: colors.accent, borderColor: colors.accent }]}>
        <View>
          <AppText style={styles.inverseMuted} variant="label">{month || "All months"}</AppText>
          <AppText style={styles.inverseAmount} variant="display">{formatCurrencyCompact(total)}</AppText>
        </View>
        <AppButton icon="filter-variant" onPress={() => setShowFilters((current) => !current)} variant="secondary">
          Filters
        </AppButton>
      </AppCard>

      {showExport ? (
        <AppCard>
          <SectionHeader title="Export" />
          <FormField autoCapitalize="none" label="Month" onChangeText={setExportMonth} placeholder="YYYY-MM" value={exportMonth} />
          <View style={styles.actionRow}>
            <AppButton loading={exporting === "pdf"} onPress={() => exportReport("pdf")} variant="secondary">PDF</AppButton>
            <AppButton loading={exporting === "csv"} onPress={() => exportReport("csv")} variant="secondary">CSV</AppButton>
          </View>
        </AppCard>
      ) : null}

      {loading && !expenses.length ? (
        <SkeletonList rows={6} />
      ) : groupedExpenses.length ? (
        groupedExpenses.map((section) => (
          <View key={section.key} style={styles.section}>
            <AppText style={styles.sectionTitle} variant="headline">{section.title}</AppText>
            <AppCard>
              {section.data.map((expense) => {
                const visual = getCategoryVisual(expense.category_detail?.name, expense.category_detail?.icon, expense.category_detail?.color);
                const showDate = !["today", "yesterday"].includes(getDateGroupKey(expense.expense_date));
                const meta = [
                  expense.category_detail?.name ?? "Uncategorized",
                  formatPaymentMethod(expense.payment_method),
                  showDate ? formatDateLabel(expense.expense_date) : null,
                ].filter(Boolean).join(" | ");
                return (
                  <ListRow
                    amount={formatCurrencyCompact(expense.amount)}
                    description={meta}
                    icon={visual.icon}
                    iconColor={visual.color}
                    key={expense.id}
                    onPress={() => navigation.navigate("ExpenseForm", { expenseId: expense.id })}
                    rightLabel={expense.expense_type === "shared" ? "Shared" : undefined}
                    title={expense.title}
                  />
                );
              })}
            </AppCard>
          </View>
        ))
      ) : (
        <EmptyState
          action="Add expense"
          body="Use the plus button and your expenses will be grouped here by date."
          icon="receipt-text-plus-outline"
          onAction={() => navigation.navigate("ExpenseForm")}
          title="No expenses found"
        />
      )}

      <ExpenseFilterSheet
        categories={categories}
        categoryFilter={categoryFilter}
        clearFilters={clearFilters}
        month={month}
        onCategoryChange={setCategoryFilter}
        onClose={() => setShowFilters(false)}
        onMonthChange={setMonth}
        onOrderingChange={setOrdering}
        onPaymentChange={setPaymentFilter}
        ordering={ordering}
        paymentFilter={paymentFilter}
        visible={showFilters}
      />
    </AppScreen>
  );
}

function ExpenseFilterSheet({
  categories,
  categoryFilter,
  clearFilters,
  month,
  onCategoryChange,
  onClose,
  onMonthChange,
  onOrderingChange,
  onPaymentChange,
  ordering,
  paymentFilter,
  visible,
}: {
  categories: ExpenseCategory[];
  categoryFilter: number | null;
  clearFilters: () => void;
  month: string;
  onCategoryChange: (value: number | null) => void;
  onClose: () => void;
  onMonthChange: (value: string) => void;
  onOrderingChange: (value: OrderingFilter) => void;
  onPaymentChange: (value: PaymentFilter) => void;
  ordering: OrderingFilter;
  paymentFilter: PaymentFilter;
  visible: boolean;
}) {
  return (
    <AppBottomSheet
      footer={<AppButton block onPress={onClose}>Apply filters</AppButton>}
      onClose={onClose}
      title="Filters"
      visible={visible}
    >
      <FormField autoCapitalize="none" label="Month" onChangeText={onMonthChange} placeholder="YYYY-MM" value={month} />

      <AppText color="textMuted" style={styles.filterLabel} variant="label">Payment</AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {paymentOptions.map((option) => (
          <CategoryChip
            active={paymentFilter === option.value}
            icon={option.icon}
            key={option.value}
            label={option.label}
            onPress={() => onPaymentChange(option.value)}
          />
        ))}
      </ScrollView>

      <AppText color="textMuted" style={styles.filterLabel} variant="label">Sort</AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {orderingOptions.map((option) => (
          <CategoryChip active={ordering === option.value} key={option.value} label={option.label} onPress={() => onOrderingChange(option.value)} />
        ))}
      </ScrollView>

      <AppText color="textMuted" style={styles.filterLabel} variant="label">Category</AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        <CategoryChip active={categoryFilter === null} label="All" onPress={() => onCategoryChange(null)} />
        {categories.map((item) => {
          const visual = getCategoryVisual(item.name, item.icon, item.color);
          return (
            <CategoryChip
              active={categoryFilter === item.id}
              icon={visual.icon}
              key={item.id}
              label={item.name}
              onPress={() => onCategoryChange(item.id)}
            />
          );
        })}
      </ScrollView>

      <AppButton compact icon="filter-remove-outline" onPress={clearFilters} style={styles.resetButton} variant="secondary">
        Reset filters
      </AppButton>
    </AppBottomSheet>
  );
}

function groupExpensesByDate(rows: Expense[]): ExpenseSection[] {
  const sections: ExpenseSection[] = [];
  const sectionByKey = new Map<string, ExpenseSection>();

  rows.forEach((expense) => {
    const key = getDateGroupKey(expense.expense_date);
    const existing = sectionByKey.get(key);
    if (existing) {
      existing.data.push(expense);
      return;
    }
    const next = { data: [expense], key, title: getDateGroupTitle(expense.expense_date) };
    sections.push(next);
    sectionByKey.set(key, next);
  });

  return sections;
}

function getDateGroupKey(value: string) {
  const days = getDaysFromToday(value);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days >= 2 && days <= 6) return "this-week";
  if (days >= 7 && days <= 13) return "last-week";
  return value.slice(0, 7);
}

function getDateGroupTitle(value: string) {
  const days = getDaysFromToday(value);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days >= 2 && days <= 6) return "This Week";
  if (days >= 7 && days <= 13) return "Last Week";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function getDaysFromToday(value: string) {
  const date = new Date(`${value}T00:00:00`);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((todayStart.getTime() - dateStart.getTime()) / 86400000);
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: "row",
    gap: dsSpace[1],
    marginTop: dsSpace[1.5],
  },
  filterLabel: {
    marginBottom: dsSpace[1],
    marginTop: dsSpace[2],
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: dsSpace[1],
    marginBottom: dsSpace[2],
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  inverseAmount: {
    color: "#FFFFFF",
    marginTop: dsSpace[0.5],
  },
  inverseMuted: {
    color: "rgba(255,255,255,0.78)",
  },
  rail: {
    gap: dsSpace[1],
    paddingBottom: dsSpace[1],
    paddingRight: dsSpace[3],
  },
  resetButton: {
    marginTop: dsSpace[2],
  },
  section: {
    marginBottom: dsSpace[1],
  },
  sectionTitle: {
    marginBottom: dsSpace[1],
  },
  summaryCard: {
    alignItems: "center",
    flexDirection: "row",
    gap: dsSpace[2],
    justifyContent: "space-between",
  },
});
