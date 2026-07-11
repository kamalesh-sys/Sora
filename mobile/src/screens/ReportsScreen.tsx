import { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import { SoraDonutChart } from "../components/SoraDonutChart";
import {
  AppButton,
  AppCard,
  AppScreen,
  AppSegmentedControl,
  AppText,
  EmptyState,
  ErrorState,
  FormField,
  IconButton,
  ListRow,
  SectionHeader,
  SkeletonBlock,
  SkeletonList,
  dsRadius,
  dsSpace,
  useDs,
} from "../design-system";
import { useAppSettings } from "../context/AppSettingsContext";
import { useAuth } from "../context/AuthContext";
import { type Translate, useI18n } from "../i18n";
import { getCategories, getMonthlySummary } from "../services/expenseApi";
import { exportMonthlyReport } from "../services/reportExport";
import { getCategoryVisual } from "../theme/soraTheme";
import type { ExpenseCategory, MonthlySummary, TransactionType } from "../types/api";
import { getCurrentMonth, isValidMonth } from "../utils/date";
import { formatCurrencyCompact, formatMonthLabel, formatPaymentMethod, parseAmount } from "../utils/format";

function getCashFlowSummary(current: MonthlySummary | null | undefined, t: Translate) {
  return t("Income {income} · Expenses {expenses}", {
    expenses: formatCurrencyCompact(current?.total_expense),
    income: formatCurrencyCompact(current?.total_income),
  });
}

const breakdownTypes: Array<{ icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: TransactionType }> = [
  { icon: "arrow-up-right", label: "Expenses", value: "expense" },
  { icon: "arrow-down-left", label: "Income", value: "income" },
];

export function ReportsScreen() {
  const { colors } = useDs();
  const { themeMode } = useAppSettings();
  const { token } = useAuth();
  const { t } = useI18n();
  const [month, setMonth] = useState(getCurrentMonth());
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [breakdownType, setBreakdownType] = useState<TransactionType>("expense");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!isValidMonth(month)) {
      setError(t("Month must use YYYY-MM format."));
      setLoading(false);
      return;
    }

    setError("");
    try {
      const [current, expenseCategories, incomeCategories] = await Promise.all([
        getMonthlySummary(month),
        getCategories("expense"),
        getCategories("income"),
      ]);
      setSummary(current);
      setCategories([...expenseCategories, ...incomeCategories]);
    } catch {
      setError(t("Could not load report. Pull to retry."));
    } finally {
      setLoading(false);
    }
  }, [month, t]);

  useFocusEffect(
    useCallback(() => {
      setLoading(!summary);
      load();
    }, [load, summary])
  );

  const total = parseAmount(summary?.total_expense);
  const totalIncome = parseAmount(summary?.total_income);
  const netCashFlow = parseAmount(summary?.net_cash_flow);
  const walletBalance = parseAmount(summary?.wallet_balance);
  const budget = parseAmount(summary?.total_budget);
  const budgetUsed = budget > 0 ? Math.min(100, Math.round((total / budget) * 100)) : 0;
  const primaryCardBackground = themeMode === "dark" ? colors.accent : colors.bgInverse;
  const primaryCardText = "#FFFFFF";
  const primaryCardMuted = "rgba(255,255,255,0.72)";
  const primaryIconBackground = themeMode === "dark" ? "#0A0B0D" : colors.accent;
  const categoryById = useMemo(() => new Map(categories.map((item) => [item.id, item])), [categories]);
  const categoryByName = useMemo(() => new Map(categories.map((item) => [item.name.toLowerCase(), item])), [categories]);
  const getBreakdownVisual = useCallback(
    (categoryId: number | null, categoryName: string) => {
      const category = (categoryId ? categoryById.get(categoryId) : undefined) ?? categoryByName.get(categoryName.toLowerCase());
      return getCategoryVisual(categoryName, category?.icon, category?.color);
    },
    [categoryById, categoryByName]
  );
  const activeCategoryBreakdown = breakdownType === "income" ? summary?.income_category_breakdown ?? [] : summary?.category_breakdown ?? [];
  const activePaymentBreakdown = breakdownType === "income" ? summary?.income_payment_method_breakdown ?? [] : summary?.payment_method_breakdown ?? [];
  const activeCount = breakdownType === "income" ? summary?.income_count ?? 0 : summary?.expense_count ?? 0;
  const chartRows = useMemo(
    () =>
      activeCategoryBreakdown.map((row) => {
        const visual = getBreakdownVisual(row.category_id, row.category_name);
        return { color: visual.color, count: row.count, label: row.category_name, value: row.total };
      }),
    [activeCategoryBreakdown, getBreakdownVisual]
  );

  const exportReport = async (type: "csv" | "pdf") => {
    if (!token) {
      setError(t("Login required."));
      return;
    }
    if (!isValidMonth(month)) {
      setError(t("Month must use YYYY-MM format."));
      return;
    }

    setExporting(type);
    setError("");
    try {
      await exportMonthlyReport({ month, token, type });
      setShowExport(false);
    } catch {
      setError(t("Could not export {type} report.", { type: type.toUpperCase() }));
    } finally {
      setExporting(null);
    }
  };

  return (
    <AppScreen bottomNavCurrent="Profile" onRefresh={load} refreshing={loading}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <AppText color="textMuted" variant="caption">{formatMonthLabel(month)}</AppText>
          <AppText variant="title">{t("Reports")}</AppText>
        </View>
        <IconButton accessibilityLabel={t("Export report")} icon={showExport ? "close" : "file-export-outline"} onPress={() => setShowExport((current) => !current)} />
      </View>

      <ErrorState text={error} />

      {showExport ? (
        <AppCard>
          <View style={styles.cardHeader}>
            <AppText variant="headline">{t("Export")}</AppText>
            <AppText color="textSubtle" variant="caption">{t((summary?.transaction_count ?? 0) === 1 ? "{count} transaction" : "{count} transactions", { count: summary?.transaction_count ?? 0 })}</AppText>
          </View>
          <View style={styles.actionRow}>
            <AppButton compact icon="file-pdf-box" loading={exporting === "pdf"} onPress={() => exportReport("pdf")} variant="secondary">PDF</AppButton>
            <AppButton compact icon="file-delimited-outline" loading={exporting === "csv"} onPress={() => exportReport("csv")} variant="secondary">CSV</AppButton>
          </View>
        </AppCard>
      ) : null}

      {loading && !summary ? (
        <ReportsSkeleton />
      ) : (
        <>
          <AppCard elevated style={[styles.primaryCard, { backgroundColor: primaryCardBackground, borderColor: primaryCardBackground }]}>
            <View style={styles.primaryTop}>
              <View>
                <AppText style={{ color: primaryCardMuted }} variant="caption">{t("Net cash flow")}</AppText>
                <AppText style={{ color: primaryCardText }} variant="display">{formatCurrencyCompact(netCashFlow)}</AppText>
              </View>
              <View style={[styles.primaryIcon, { backgroundColor: primaryIconBackground }]}>
                <MaterialCommunityIcons name="chart-line" size={24} color="#FFFFFF" />
              </View>
            </View>
            <AppText style={{ color: primaryCardMuted }} variant="body">{getCashFlowSummary(summary, t)}</AppText>
          </AppCard>

          <AppCard>
            <View style={styles.monthRow}>
              <FormField autoCapitalize="none" label={t("Month")} onChangeText={setMonth} placeholder="YYYY-MM" style={styles.monthInput} value={month} />
              <AppButton compact icon="refresh" onPress={load} style={styles.monthLoadButton} variant="secondary">{t("Load")}</AppButton>
            </View>
          </AppCard>

          <View style={styles.metricGrid}>
            <Metric label={t("Income")} value={formatCurrencyCompact(totalIncome)} meta={t("This month")} tone="success" />
            <Metric label={t("Expenses")} value={formatCurrencyCompact(total)} meta={t("This month")} />
          </View>

          <View style={styles.metricGrid}>
            <Metric label={t("Budget")} value={formatCurrencyCompact(budget)} meta={budget > 0 ? t("{percent}% used", { percent: budgetUsed }) : t("Not set")} />
            <Metric label={t("Wallet balance")} value={formatCurrencyCompact(walletBalance)} meta={t("All time")} tone={walletBalance < 0 ? "danger" : "success"} />
          </View>

          <AppSegmentedControl
            accessibilityLabel={t("Report breakdown type")}
            items={breakdownTypes}
            onChange={setBreakdownType}
            style={styles.breakdownSwitch}
            value={breakdownType}
          />

          <AppCard>
            <View style={styles.cardHeader}>
              <AppText variant="headline">{t(breakdownType === "income" ? "Where it came from" : "Where it went")}</AppText>
              <AppText color="textSubtle" variant="caption">{t(activeCount === 1 ? "{count} transaction" : "{count} transactions", { count: activeCount })}</AppText>
            </View>
            {chartRows.length ? <SoraDonutChart rows={chartRows} size={168} /> : <EmptyState body={t("Add transactions to build this category chart.")} icon="chart-donut" title={t("No breakdown yet")} />}
          </AppCard>

          <SectionHeader title={t("Categories")} />
          {activeCategoryBreakdown.length ? (
            <AppCard style={styles.listCard}>
              {activeCategoryBreakdown.map((row) => {
                const visual = getBreakdownVisual(row.category_id, row.category_name);
                return (
                  <ListRow
                    amount={formatCurrencyCompact(row.total)}
                    description={t(row.count === 1 ? "{count} transaction" : "{count} transactions", { count: row.count })}
                    icon={visual.icon}
                    iconColor={visual.color}
                    key={`${row.category_id}-${row.category_name}`}
                    title={row.category_name}
                  />
                );
              })}
            </AppCard>
          ) : (
            <EmptyState body={t("No matching transaction categories for this month.")} icon="shape-outline" title={t("No categories yet")} />
          )}

          <SectionHeader title={t("Payments")} />
          {activePaymentBreakdown.length ? (
            <AppCard style={styles.listCard}>
              {activePaymentBreakdown.map((row) => (
                <ListRow
                  amount={formatCurrencyCompact(row.total)}
                  description={t(row.count === 1 ? "{count} transaction" : "{count} transactions", { count: row.count })}
                  icon={row.payment_method === "cash" ? "cash" : row.payment_method === "card" ? "credit-card-outline" : row.payment_method === "bank" ? "bank-outline" : "cellphone"}
                  key={row.payment_method}
                  title={formatPaymentMethod(row.payment_method)}
                />
              ))}
            </AppCard>
          ) : (
            <EmptyState body={t("No matching payment entries for this month.")} icon="wallet-outline" title={t("No payments yet")} />
          )}
        </>
      )}
    </AppScreen>
  );
}

function ReportsSkeleton() {
  return (
    <>
      <AppCard style={styles.primaryCard}>
        <SkeletonBlock height={16} width="34%" />
        <SkeletonBlock height={46} style={styles.skeletonGap} width="62%" />
        <SkeletonBlock height={16} style={styles.skeletonGap} width="54%" />
      </AppCard>
      <AppCard>
        <SkeletonBlock height={56} />
      </AppCard>
      <View style={styles.metricGrid}>
        <AppCard style={styles.metricCard}>
          <SkeletonBlock height={14} width="38%" />
          <SkeletonBlock height={24} style={styles.skeletonGap} width="70%" />
        </AppCard>
        <AppCard style={styles.metricCard}>
          <SkeletonBlock height={14} width="44%" />
          <SkeletonBlock height={24} style={styles.skeletonGap} width="66%" />
        </AppCard>
      </View>
      <SkeletonList rows={4} />
    </>
  );
}

function Metric({
  label,
  meta,
  tone,
  value,
}: {
  label: string;
  meta: string;
  tone?: "success" | "danger";
  value: string;
}) {
  const { colors } = useDs();
  const valueColor = tone === "success" ? colors.success : tone === "danger" ? colors.danger : colors.text;
  return (
    <AppCard style={styles.metricCard}>
      <AppText color="textMuted" variant="caption">{label}</AppText>
      <AppText numberOfLines={1} style={{ color: valueColor }} variant="headline">{value}</AppText>
      <AppText color="textSubtle" numberOfLines={1} variant="caption">{meta}</AppText>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: "row",
    gap: dsSpace[1],
    marginTop: dsSpace[1.5],
  },
  breakdownSwitch: {
    marginBottom: dsSpace[2],
  },
  cardHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: dsSpace[1.5],
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
  listCard: {
    paddingVertical: 0,
  },
  metricCard: {
    flex: 1,
    marginBottom: 0,
    minHeight: 96,
  },
  metricGrid: {
    flexDirection: "row",
    gap: dsSpace[1],
    marginBottom: dsSpace[2],
  },
  monthInput: {
    flex: 1,
  },
  monthLoadButton: {
    marginTop: 25,
  },
  monthRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: dsSpace[1],
  },
  primaryCard: {
    borderRadius: dsRadius.lg,
    paddingVertical: dsSpace[3],
  },
  primaryIcon: {
    alignItems: "center",
    borderRadius: dsRadius.pill,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  primaryTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: dsSpace[1],
  },
  skeletonGap: {
    marginTop: dsSpace[1],
  },
});
