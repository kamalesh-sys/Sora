import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import {
  AppBottomSheet,
  AppButton,
  AppCard,
  AppScreen,
  AppText,
  EmptyState,
  ErrorState,
  IconButton,
  ListRow,
  SectionHeader,
  SkeletonBlock,
  SkeletonList,
  dsRadius,
  dsSpace,
  useDs,
} from "../design-system";
import { AbstractAvatar, type AbstractAvatarKey } from "../components/AbstractAvatar";
import { useAppSettings } from "../context/AppSettingsContext";
import { useAuth } from "../context/AuthContext";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { getDashboardSummary } from "../services/expenseApi";
import { getCategoryVisual } from "../theme/soraTheme";
import type { DashboardSummary, Expense } from "../types/api";
import { getCurrentMonth } from "../utils/date";
import { formatCurrencyCompact, formatMonthLabel, formatRelativeDateLabel, parseAmount } from "../utils/format";
import { updateSoraExpenseWidget } from "../widgets/widgetStorage";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 16) return "Good afternoon";
  if (hour >= 16 && hour < 21) return "Good evening";
  return "Good night";
}

function getDisplayName(userName?: string, email?: string) {
  const cleanName = userName?.trim();
  if (cleanName) return cleanName.split(/\s+/)[0];
  return email?.split("@")[0] || "there";
}

function todayTotal(expenses: Expense[]) {
  const today = new Date().toISOString().slice(0, 10);
  return expenses
    .filter((expense) => expense.expense_date === today && expense.transaction_type !== "income")
    .reduce((sum, expense) => sum + parseAmount(expense.amount), 0);
}

export function DashboardScreen({ navigation }: Props) {
  const { colors } = useDs();
  const { avatarKey, t, themeMode } = useAppSettings();
  const { user } = useAuth();
  const [month] = useState(getCurrentMonth());
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [accountTrayOpen, setAccountTrayOpen] = useState(false);

  const displayName = getDisplayName(user?.first_name, user?.email);
  const recentExpenses = useMemo(
    () => [...(data?.recent_transactions ?? [])].sort((a, b) => b.expense_date.localeCompare(a.expense_date) || b.created_at.localeCompare(a.created_at)),
    [data?.recent_transactions]
  );
  const todaySpend = todayTotal(recentExpenses);
  const monthSpend = parseAmount(data?.summary.total_expense);
  const monthIncome = parseAmount(data?.summary.total_income);
  const netCashFlow = parseAmount(data?.summary.net_cash_flow);
  const walletBalance = parseAmount(data?.summary.wallet_balance);
  const budget = parseAmount(data?.summary.total_budget);
  const balance = parseAmount(data?.summary.balance);
  const budgetUsed = budget > 0 ? Math.min(100, Math.round((monthSpend / budget) * 100)) : 0;
  const primaryCardBackground = themeMode === "dark" ? colors.accent : colors.bgInverse;
  const primaryCardText = "#FFFFFF";
  const primaryCardMuted = "rgba(255,255,255,0.72)";
  const primaryIconBackground = themeMode === "dark" ? "#0A0B0D" : colors.accent;

  const load = useCallback(async () => {
    setError("");
    try {
      const nextData = await getDashboardSummary(month, 30);
      setData(nextData);
      void updateSoraExpenseWidget(nextData.recent_expenses[0] ?? null);
    } catch {
      setError("Could not load dashboard. Pull to retry.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [month]);

  useFocusEffect(
    useCallback(() => {
      setLoading(!data);
      load();
    }, [data, load])
  );

  const refresh = () => {
    setRefreshing(true);
    load();
  };

  return (
    <AppScreen bottomNavCurrent="Home" onRefresh={refresh} refreshing={refreshing}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <AppText color="textMuted" variant="caption">{getGreeting()}, {displayName}</AppText>
          <AppText variant="title">Home</AppText>
        </View>
        <Pressable
          accessibilityLabel={t("Open account menu")}
          accessibilityRole="button"
          android_ripple={{ color: colors.press, borderless: true }}
          hitSlop={8}
          onPress={() => setAccountTrayOpen(true)}
          style={styles.avatarButton}
        >
          <AbstractAvatar size={44} variant={avatarKey} />
        </Pressable>
      </View>

      <ErrorState text={error} />

      {loading && !data ? (
        <DashboardSkeleton />
      ) : (
        <>
          <AppCard elevated style={[styles.primaryCard, { backgroundColor: primaryCardBackground, borderColor: primaryCardBackground }]}>
            <View style={styles.primaryTop}>
              <View>
                <AppText style={{ color: primaryCardMuted }} variant="caption">{t("Wallet balance")}</AppText>
                <AppText style={{ color: primaryCardText }} variant="display">{formatCurrencyCompact(walletBalance)}</AppText>
              </View>
              <View style={[styles.primaryIcon, { backgroundColor: primaryIconBackground }]}>
                <MaterialCommunityIcons name="wallet-outline" size={24} color="#FFFFFF" />
              </View>
            </View>
            <AppText style={{ color: primaryCardMuted }} variant="body">
              {t("{month} net: {amount}", { amount: formatCurrencyCompact(netCashFlow), month: formatMonthLabel(month) })}
            </AppText>
          </AppCard>

          <View style={styles.metricGrid}>
            <MetricCard label={t("Income")} value={formatCurrencyCompact(monthIncome)} meta={t("This month")} tone="success" />
            <MetricCard label={t("Expenses")} value={formatCurrencyCompact(monthSpend)} meta={t("{amount} today", { amount: formatCurrencyCompact(todaySpend) })} />
          </View>

          <AppCard>
            <View style={styles.cardTopRow}>
              <View>
                <AppText variant="headline">Budget</AppText>
                <AppText color="textSubtle" variant="caption">{budget ? `${formatCurrencyCompact(budget)} monthly limit` : "Not set"}</AppText>
              </View>
              <AppText color={balance < 0 ? "danger" : "success"} variant="label">{budget ? `${budgetUsed}%` : "--"}</AppText>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: colors.chipBg }]}>
              <View style={[styles.progressFill, { backgroundColor: balance < 0 ? colors.danger : colors.success, width: `${budgetUsed}%` }]} />
            </View>
          </AppCard>

          <AppCard>
            <SectionHeader title="Actions" />
            <View style={styles.quickGrid}>
              <QuickAction icon="arrow-up-right" label="Expense" onPress={() => navigation.navigate("ExpenseForm", { transactionType: "expense" })} />
              <QuickAction icon="arrow-down-left" label="Income" onPress={() => navigation.navigate("ExpenseForm", { transactionType: "income" })} />
              <QuickAction icon="target" label="Goals" onPress={() => navigation.navigate("Goals")} />
              <QuickAction icon="account-multiple-outline" label="People" onPress={() => navigation.navigate("People")} />
            </View>
          </AppCard>

          <SectionHeader action="View all" onAction={() => navigation.navigate("Expenses")} title="Recent" />
          {loading && !recentExpenses.length ? (
            <SkeletonList rows={3} />
          ) : recentExpenses.length ? (
            <AppCard style={styles.listCard}>
              {recentExpenses.slice(0, 5).map((expense) => {
                const visual = getCategoryVisual(expense.category_detail?.name, expense.category_detail?.icon, expense.category_detail?.color);
                return (
                  <ListRow
                    amount={`${expense.transaction_type === "income" ? "+" : "−"}${formatCurrencyCompact(expense.amount)}`}
                    amountColor={expense.transaction_type === "income" ? colors.success : colors.text}
                    description={`${expense.category_detail?.name ?? "Uncategorized"} | ${formatRelativeDateLabel(expense.expense_date)}`}
                    icon={visual.icon}
                    iconColor={visual.color}
                    key={expense.id}
                    onPress={() => navigation.navigate("ExpenseForm", { expenseId: expense.id })}
                    title={expense.title}
                  />
                );
              })}
            </AppCard>
          ) : (
            <EmptyState
              action="Add transaction"
              body="Income and expenses will appear here as soon as you add one."
              icon="swap-vertical"
              onAction={() => navigation.navigate("ExpenseForm")}
              title="No transactions yet"
            />
          )}
        </>
      )}

      <AccountTray
        avatarKey={avatarKey}
        email={user?.email}
        name={user?.first_name || displayName}
        navigation={navigation}
        onClose={() => setAccountTrayOpen(false)}
        visible={accountTrayOpen}
      />
    </AppScreen>
  );
}

function AccountTray({
  avatarKey,
  email,
  name,
  navigation,
  onClose,
  visible,
}: {
  avatarKey: AbstractAvatarKey;
  email?: string;
  name: string;
  navigation: Props["navigation"];
  onClose: () => void;
  visible: boolean;
}) {
  const { colors } = useDs();
  const { t } = useAppSettings();
  const open = (route: "Goals" | "Loans" | "Profile" | "Categories" | "People" | "Reports") => {
    onClose();
    navigation.navigate(route);
  };

  return (
    <AppBottomSheet maxHeight="78%" onClose={onClose} visible={visible}>
      <View style={styles.accountTrayContent}>
        <View style={styles.accountTrayCloseRow}>
          <View />
          <IconButton accessibilityLabel={t("Close account menu")} icon="close" onPress={onClose} />
        </View>

        <View style={styles.accountIdentity}>
          <AbstractAvatar size={88} variant={avatarKey} />
          <AppText numberOfLines={1} style={styles.accountName} variant="title">
            {name}
          </AppText>
          {email ? (
            <AppText color="textSubtle" numberOfLines={1} variant="body">
              {email}
            </AppText>
          ) : null}
        </View>

        <AppButton block icon="cog-outline" onPress={() => open("Profile")} style={styles.accountPrimaryAction} variant="secondary">
          Profile & settings
        </AppButton>

        <View style={[styles.accountLinks, { borderTopColor: colors.border }]}>
          <AccountLink icon="target" label="Goals" onPress={() => open("Goals")} />
          <AccountLink icon="hand-coin-outline" label="Loans" onPress={() => open("Loans")} />
          <AccountLink icon="tag-multiple-outline" label="Categories" onPress={() => open("Categories")} />
          <AccountLink icon="account-multiple-outline" label="People" onPress={() => open("People")} />
          <AccountLink icon="chart-bar" label="Reports" onPress={() => open("Reports")} />
        </View>
      </View>
    </AppBottomSheet>
  );
}

function AccountLink({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useDs();
  return (
    <Pressable accessibilityRole="button" android_ripple={{ color: colors.press }} onPress={onPress} style={styles.accountLink}>
      <View style={[styles.accountLinkIcon, { backgroundColor: colors.chipBg }]}>
        <MaterialCommunityIcons color={colors.text} name={icon} size={22} />
      </View>
      <AppText style={styles.accountLinkCopy} variant="bodyStrong">{label}</AppText>
      <MaterialCommunityIcons color={colors.textSubtle} name="chevron-right" size={22} />
    </Pressable>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <AppCard style={styles.primaryCard}>
        <SkeletonBlock height={16} width="26%" />
        <SkeletonBlock height={46} style={styles.skeletonGap} width="64%" />
        <SkeletonBlock height={16} style={styles.skeletonGap} width="48%" />
      </AppCard>
      <View style={styles.metricGrid}>
        <AppCard style={styles.metricCard}>
          <SkeletonBlock height={56} />
        </AppCard>
        <AppCard style={styles.metricCard}>
          <SkeletonBlock height={14} width="44%" />
          <SkeletonBlock height={24} style={styles.skeletonGap} width="66%" />
        </AppCard>
      </View>
      <SkeletonList rows={3} />
    </>
  );
}

function MetricCard({
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
      <AppText color="textSubtle" numberOfLines={2} variant="caption">{meta}</AppText>
    </AppCard>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useDs();
  return (
    <Pressable accessibilityRole="button" android_ripple={{ color: colors.press }} onPress={onPress} style={styles.quickAction}>
      <View style={[styles.quickIcon, { backgroundColor: colors.chipBg }]}>
        <MaterialCommunityIcons name={icon} size={23} color={colors.text} />
      </View>
      <AppText numberOfLines={1} variant="label">{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  accountIdentity: {
    alignItems: "center",
    marginBottom: dsSpace[2.5],
  },
  accountLink: {
    alignItems: "center",
    flexDirection: "row",
    gap: dsSpace[1.5],
    minHeight: 60,
  },
  accountLinkCopy: {
    flex: 1,
    minWidth: 0,
  },
  accountLinkIcon: {
    alignItems: "center",
    borderRadius: dsRadius.pill,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  accountLinks: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginHorizontal: -dsSpace[2],
    paddingHorizontal: dsSpace[2],
    paddingTop: dsSpace[1],
  },
  accountName: {
    marginTop: dsSpace[1.5],
  },
  accountPrimaryAction: {
    marginBottom: dsSpace[1.5],
  },
  accountTrayCloseRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: dsSpace[1],
  },
  accountTrayContent: {
    paddingHorizontal: dsSpace[2],
    paddingBottom: dsSpace[2],
  },
  avatarButton: {
    borderRadius: dsRadius.pill,
    overflow: "hidden",
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
  primaryCard: {
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
  progressFill: {
    borderRadius: dsRadius.pill,
    height: "100%",
  },
  progressTrack: {
    borderRadius: dsRadius.pill,
    height: 10,
    marginTop: dsSpace[1.5],
    overflow: "hidden",
  },
  quickAction: {
    alignItems: "center",
    flex: 1,
    gap: dsSpace[1],
    minWidth: 64,
  },
  quickGrid: {
    flexDirection: "row",
    gap: dsSpace[1],
    justifyContent: "space-between",
  },
  quickIcon: {
    alignItems: "center",
    borderRadius: dsRadius.pill,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  skeletonGap: {
    marginTop: dsSpace[1],
  },
});
