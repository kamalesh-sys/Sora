import { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Text, TextInput } from "react-native-paper";

import { AppButton } from "../components/AppLayout";
import {
  SoraCard,
  SoraChip,
  SoraEmpty,
  SoraError,
  SoraHeader,
  SoraIconRow,
  SoraRowSkeleton,
  SoraScreen,
} from "../components/SoraUI";
import { useAppSettings } from "../context/AppSettingsContext";
import { useAuth } from "../context/AuthContext";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { getCategories, getExpenses } from "../services/expenseApi";
import { exportMonthlyReport, ReportExportType } from "../services/reportExport";
import { getCategoryVisual } from "../theme/soraTheme";
import type { Expense, ExpenseCategory, PaymentMethod } from "../types/api";
import { getCurrentMonth, isValidMonth } from "../utils/date";
import {
  formatCurrencyCompact,
  formatPaymentMethod,
  formatRelativeDateLabel,
  parseAmount,
} from "../utils/format";

type Props = NativeStackScreenProps<RootStackParamList, "Expenses">;
type PaymentFilter = "all" | PaymentMethod;
type OrderingFilter = "recent" | "oldest" | "amount_desc" | "amount_asc";

const paymentOptions: Array<{ label: string; value: PaymentFilter }> = [
  { label: "All", value: "all" },
  { label: "UPI", value: "upi" },
  { label: "Cash", value: "cash" },
  { label: "Card", value: "card" },
  { label: "Bank", value: "bank" },
];

const orderingOptions: Array<{ label: string; value: OrderingFilter }> = [
  { label: "Recent", value: "recent" },
  { label: "Oldest", value: "oldest" },
  { label: "High", value: "amount_desc" },
  { label: "Low", value: "amount_asc" },
];

export function ExpensesScreen({ navigation }: Props) {
  const { colors } = useAppSettings();
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
      setError("Could not load expenses. Check backend connection.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [categoryFilter, month, ordering, paymentFilter]);

  useFocusEffect(
    useCallback(() => {
      setLoading(expenses.length === 0);
      load();
    }, [expenses.length, load])
  );

  const total = useMemo(
    () => expenses.reduce((sum, expense) => sum + parseAmount(expense.amount), 0),
    [expenses]
  );

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
    <SoraScreen bottomNavCurrent="Expenses" scroll={false} style={styles.screen}>
      <SoraHeader
        actionIcon={showExport ? "close" : "download-outline"}
        onAction={() => {
          setExportMonth(month || getCurrentMonth());
          setShowExport((current) => !current);
        }}
        title="Expenses"
        subtitle={`${expenses.length} rows · ${formatCurrencyCompact(total)}`}
      />

      <SoraError text={error} />

      <SoraCard style={styles.summaryCard} tone="purple">
        <View>
          <Text style={styles.summaryLabel}>{month || "All months"}</Text>
          <Text style={styles.summaryAmount}>{formatCurrencyCompact(total)}</Text>
        </View>
        <AppButton compact icon="filter-variant" mode="contained-tonal" onPress={() => setShowFilters((current) => !current)}>
          Filters
        </AppButton>
      </SoraCard>

      {showExport ? (
        <SoraCard>
          <Text style={[styles.blockTitle, { color: colors.text }]}>Export report</Text>
          <TextInput
            label="Month"
            mode="outlined"
            value={exportMonth}
            onChangeText={setExportMonth}
            placeholder="YYYY-MM"
            autoCapitalize="none"
            style={styles.input}
          />
          <View style={styles.actionRow}>
            <AppButton mode="outlined" loading={exporting === "csv"} disabled={Boolean(exporting)} onPress={() => exportReport("csv")}>
              CSV
            </AppButton>
            <AppButton mode="outlined" loading={exporting === "pdf"} disabled={Boolean(exporting)} onPress={() => exportReport("pdf")}>
              PDF
            </AppButton>
          </View>
        </SoraCard>
      ) : null}

      {showFilters ? (
        <SoraCard>
          <View style={styles.filterHeader}>
            <Text style={[styles.blockTitle, { color: colors.text }]}>Filters</Text>
            <AppButton compact mode="text" onPress={clearFilters}>
              Reset
            </AppButton>
          </View>
          <TextInput
            label="Month"
            mode="outlined"
            value={month}
            onChangeText={setMonth}
            placeholder="YYYY-MM"
            autoCapitalize="none"
            style={styles.input}
          />
          <Text style={[styles.filterLabel, { color: colors.muted }]}>Payment</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {paymentOptions.map((option) => (
              <SoraChip
                active={paymentFilter === option.value}
                key={option.value}
                onPress={() => setPaymentFilter(option.value)}
              >
                {option.label}
              </SoraChip>
            ))}
          </ScrollView>

          <Text style={[styles.filterLabel, { color: colors.muted }]}>Sort</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {orderingOptions.map((option) => (
              <SoraChip active={ordering === option.value} key={option.value} onPress={() => setOrdering(option.value)}>
                {option.label}
              </SoraChip>
            ))}
          </ScrollView>

          <Text style={[styles.filterLabel, { color: colors.muted }]}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <SoraChip active={categoryFilter === null} onPress={() => setCategoryFilter(null)}>
              All
            </SoraChip>
            {categories.map((category) => (
              <SoraChip
                active={categoryFilter === category.id}
                key={category.id}
                onPress={() => setCategoryFilter(category.id)}
              >
                {category.name}
              </SoraChip>
            ))}
          </ScrollView>
        </SoraCard>
      ) : null}

      <FlatList
        data={expenses}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
        showsVerticalScrollIndicator={false}
        style={styles.list}
        contentContainerStyle={[styles.listContent, expenses.length === 0 && styles.emptyListContent]}
        ListEmptyComponent={
          loading ? <SoraRowSkeleton rows={6} /> : <SoraEmpty text="No expenses found for this view." />
        }
        renderItem={({ item }) => (
          <ExpenseRow expense={item} onPress={() => navigation.navigate("ExpenseForm", { expenseId: item.id })} />
        )}
      />
    </SoraScreen>
  );
}

function ExpenseRow({ expense, onPress }: { expense: Expense; onPress: () => void }) {
  const categoryName = expense.household_detail?.name ?? expense.category_detail?.name ?? "Uncategorized";
  const visual = getCategoryVisual(expense.category_detail?.name, expense.category_detail?.icon, expense.category_detail?.color);

  return (
    <SoraCard style={styles.expenseCard}>
      <SoraIconRow
        amount={formatCurrencyCompact(expense.amount)}
        icon={visual.icon}
        iconBackground={visual.background}
        iconColor={visual.color}
        meta={`${categoryName} · ${formatPaymentMethod(expense.payment_method)} · ${formatRelativeDateLabel(expense.expense_date)}`}
        onPress={onPress}
        title={expense.title}
      />
    </SoraCard>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: 8,
  },
  summaryCard: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryLabel: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 15,
    fontWeight: "800",
  },
  summaryAmount: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "900",
    marginTop: 4,
  },
  blockTitle: {
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 10,
  },
  input: {
    marginBottom: 12,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  filterHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 8,
    marginTop: 4,
  },
  chipRow: {
    gap: 8,
    paddingBottom: 12,
    paddingRight: 20,
  },
  listContent: {
    paddingBottom: 16,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  list: {
    flex: 1,
  },
  expenseCard: {
    marginBottom: 10,
    paddingVertical: 10,
  },
});
