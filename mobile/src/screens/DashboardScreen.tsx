import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";

import { BottomNav } from "../components/BottomNav";
import { SoraIllustratedEmpty } from "../components/SoraIllustratedEmpty";
import { useAppSettings } from "../context/AppSettingsContext";
import { useAuth } from "../context/AuthContext";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { getExpenses, getMonthlySummary } from "../services/expenseApi";
import {
  getCategoryVisual,
  soraPalette,
  soraRadius,
  soraShadow,
} from "../theme/soraTheme";
import { useSoraResponsive } from "../theme/responsive";
import type { Expense, MonthlySummary } from "../types/api";
import { getCurrentMonth } from "../utils/date";
import {
  formatCurrencyCompact,
  formatRelativeDateLabel,
  parseAmount,
} from "../utils/format";
import DashboardEmptyIllustration from "../../illustrations/person-using-smartphone-successfully.svg";
import { updateSoraExpenseWidget } from "../widgets/widgetStorage";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;
type ResponsiveMetrics = ReturnType<typeof useSoraResponsive>;

const BAR_COUNT = 10;

type Greeting = {
  emoji: string;
  text: string;
};

type BalanceSnapshot = {
  owedAmount: number;
  owedCount: number;
  oweAmount: number;
  oweCount: number;
};

function sortExpenses(expenses: Expense[]) {
  return [...expenses].sort((a, b) => {
    const byDate = b.expense_date.localeCompare(a.expense_date);
    return byDate || b.created_at.localeCompare(a.created_at);
  });
}

function getPreviousMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(year, month - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(value: string, offset: number) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(value: string) {
  return new Date(`${value}-01T00:00:00`).toLocaleDateString("en-IN", {
    month: "long",
  });
}

function getGreeting(): Greeting {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) {
    return { text: "Good morning", emoji: "\u{1F44B}" };
  }
  if (hour >= 12 && hour < 16) {
    return { text: "Good afternoon", emoji: "\u2600\uFE0F" };
  }
  if (hour >= 16 && hour < 21) {
    return { text: "Good evening", emoji: "\u{1F319}" };
  }
  return { text: "Good night", emoji: "Zz" };
}

function getDisplayName(userName?: string, email?: string) {
  const cleanName = userName?.trim();
  if (cleanName) {
    return cleanName.split(/\s+/)[0];
  }
  return email?.split("@")[0] || "there";
}

function getMonthlyComparison(current?: MonthlySummary | null, previous?: MonthlySummary | null) {
  const currentTotal = parseAmount(current?.total_expense);
  const previousTotal = parseAmount(previous?.total_expense);
  if (!previousTotal) {
    return null;
  }
  const change = ((currentTotal - previousTotal) / previousTotal) * 100;
  return {
    direction: change >= 0 ? "up" : "down",
    percent: Math.abs(change),
  };
}

function buildChartBars(expenses: Expense[], month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const bucketSize = Math.ceil(daysInMonth / BAR_COUNT);
  const buckets = Array.from({ length: BAR_COUNT }, () => 0);

  for (const expense of expenses) {
    const date = new Date(`${expense.expense_date}T00:00:00`);
    const bucketIndex = Math.min(BAR_COUNT - 1, Math.floor((date.getDate() - 1) / bucketSize));
    buckets[bucketIndex] += parseAmount(expense.amount);
  }

  const max = Math.max(...buckets, 1);
  return buckets.map((value) => Math.max(10, Math.round((value / max) * 100)));
}

function getBalanceSnapshot(expenses: Expense[], userId?: number): BalanceSnapshot {
  const peopleOwingMe = new Set<string>();
  const peopleIOwe = new Set<string>();
  let owedAmount = 0;
  let oweAmount = 0;

  if (!userId) {
    return { owedAmount, owedCount: 0, oweAmount, oweCount: 0 };
  }

  for (const expense of expenses) {
    for (const share of expense.shares ?? []) {
      const pending = parseAmount(share.pending_amount);
      if (pending <= 0) {
        continue;
      }

      if (share.user === userId) {
        oweAmount += pending;
        peopleIOwe.add(String(expense.paid_by_user ?? expense.paid_by_person ?? expense.id));
      } else if (expense.paid_by_user === userId) {
        owedAmount += pending;
        peopleOwingMe.add(String(share.user ?? share.person ?? share.id));
      }
    }
  }

  return {
    owedAmount,
    owedCount: peopleOwingMe.size,
    oweAmount,
    oweCount: peopleIOwe.size,
  };
}

export function DashboardScreen({ navigation }: Props) {
  const { colors } = useAppSettings();
  const { user } = useAuth();
  const responsive = useSoraResponsive();
  const [month, setMonth] = useState(getCurrentMonth());
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [previousSummary, setPreviousSummary] = useState<MonthlySummary | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [menuVisible, setMenuVisible] = useState(false);
  const entrance = useRef(new Animated.Value(0)).current;

  const greeting = useMemo(() => getGreeting(), []);
  const displayName = getDisplayName(user?.first_name, user?.email);
  const previousMonth = useMemo(() => getPreviousMonth(month), [month]);
  const screenHorizontalPadding = responsive.dashboard.contentPaddingX;
  const maxContentWidth = responsive.maxContentWidth;

  const load = useCallback(async () => {
    setError("");
    try {
      const [summaryData, previousData, expensesData] = await Promise.all([
        getMonthlySummary(month),
        getMonthlySummary(previousMonth),
        getExpenses({ month, ordering: "recent", limit: 30 }),
      ]);
      const sortedExpenses = sortExpenses(expensesData);
      setSummary(summaryData);
      setPreviousSummary(previousData);
      setExpenses(sortedExpenses);
      void updateSoraExpenseWidget(sortedExpenses[0] ?? null);
    } catch {
      setError("Could not load dashboard. Check backend connection.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [month, previousMonth]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  useEffect(() => {
    entrance.setValue(0);
    Animated.timing(entrance, {
      toValue: 1,
      duration: 360,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  const currentTotal = parseAmount(summary?.total_expense);
  const comparison = getMonthlyComparison(summary, previousSummary);
  const recentExpenses = expenses.slice(0, 3);
  const bars = buildChartBars(expenses, month);
  const balanceSnapshot = getBalanceSnapshot(expenses, user?.id);
  const entranceStyle = {
    opacity: entrance,
    transform: [
      {
        translateY: entrance.interpolate({
          inputRange: [0, 1],
          outputRange: [18, 0],
        }),
      },
    ],
  };

  const refresh = () => {
    setRefreshing(true);
    load();
  };
  const navigateFromMenu = (route: keyof RootStackParamList) => {
    setMenuVisible(false);
    navigation.navigate(route as never);
  };
  const readableComparisonText = comparison
    ? `vs last month ${comparison.direction === "up" ? "up " : "down "}${comparison.percent.toFixed(0)}%`
    : "No last month data";

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            maxWidth: maxContentWidth,
            paddingBottom: responsive.screen.bottomNavPadding + 18,
            paddingHorizontal: screenHorizontalPadding,
            paddingTop: responsive.compact ? 12 : 18,
          },
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />
        }
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={entranceStyle}>
          <DashboardHeader
            greeting={`${greeting.text}, ${displayName}`}
            greetingSuffix={greeting.emoji}
            onMenu={() => setMenuVisible(true)}
            onNotifications={() => navigation.navigate("People")}
            responsive={responsive}
          />

          {error ? <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text> : null}

          <SpendingCard
            bars={bars}
            comparison={comparison}
            comparisonLabel={readableComparisonText}
            loading={loading}
            month={month}
            onNextMonth={() => setMonth((current) => shiftMonth(current, 1))}
            onPreviousMonth={() => setMonth((current) => shiftMonth(current, -1))}
            responsive={responsive}
            total={currentTotal}
          />

          {balanceSnapshot.owedAmount > 0 || balanceSnapshot.oweAmount > 0 ? (
            <View
              style={[
                styles.balanceGrid,
                {
                  gap: responsive.compact ? 12 : 18,
                  marginBottom: responsive.dashboard.sectionGap,
                },
              ]}
            >
              {balanceSnapshot.owedAmount > 0 ? (
                <BalanceCard
                  amount={balanceSnapshot.owedAmount}
                  count={balanceSnapshot.owedCount}
                  icon="arrow-top-right"
                  label="You are owed"
                  personTextPrefix="From"
                  responsive={responsive}
                  tone="positive"
                  onPress={() => navigation.navigate("Expenses")}
                />
              ) : null}
              {balanceSnapshot.oweAmount > 0 ? (
                <BalanceCard
                  amount={balanceSnapshot.oweAmount}
                  count={balanceSnapshot.oweCount}
                  icon="arrow-bottom-right"
                  label="You owe"
                  personTextPrefix="To"
                  responsive={responsive}
                  tone="negative"
                  onPress={() => navigation.navigate("Expenses")}
                />
              ) : null}
            </View>
          ) : null}

          <QuickActions
            onAddExpense={() => navigation.navigate("ExpenseForm")}
            onAddBill={() => navigation.navigate("Bills")}
            onCategories={() => navigation.navigate("Categories")}
            onPeople={() => navigation.navigate("People")}
            responsive={responsive}
          />

          <RecentExpenses
            expenses={recentExpenses}
            loading={loading}
            onExpensePress={(expenseId) => navigation.navigate("ExpenseForm", { expenseId })}
            onViewAll={() => navigation.navigate("Expenses")}
            responsive={responsive}
          />
        </Animated.View>
      </ScrollView>
      <DashboardSideMenu
        onClose={() => setMenuVisible(false)}
        onNavigate={navigateFromMenu}
        visible={menuVisible}
      />
      <BottomNav current="Home" />
    </SafeAreaView>
  );
}

function DashboardHeader({
  greeting,
  greetingSuffix,
  onMenu,
  onNotifications,
  responsive,
}: {
  greeting: string;
  greetingSuffix: string;
  onMenu: () => void;
  onNotifications: () => void;
  responsive: ResponsiveMetrics;
}) {
  const { colors } = useAppSettings();
  const rippleColor = `${colors.accent}22`;
  return (
    <View
      style={[
        styles.header,
        {
          gap: responsive.compact ? 10 : 14,
          marginBottom: responsive.dashboard.headerMarginBottom,
        },
      ]}
    >
      <Pressable android_ripple={{ color: rippleColor, borderless: true }} hitSlop={8} onPress={onMenu}>
        <MaterialCommunityIcons name="menu" size={responsive.dashboard.headerIcon} color={colors.text} />
      </Pressable>
      <Text
        adjustsFontSizeToFit
        maxFontSizeMultiplier={responsive.maxFontScale}
        minimumFontScale={0.72}
        numberOfLines={1}
        style={[styles.greeting, { color: colors.text, fontSize: responsive.dashboard.greeting }]}
      >
        {greeting} <Text style={styles.greetingEmoji}>{greetingSuffix}</Text>
      </Text>
      <Pressable
        android_ripple={{ color: rippleColor, borderless: true }}
        hitSlop={8}
        onPress={onNotifications}
        style={styles.bellButton}
      >
        <MaterialCommunityIcons name="bell-outline" size={responsive.dashboard.headerIcon} color={colors.text} />
        <View style={styles.notificationDot} />
      </Pressable>
    </View>
  );
}

const sideMenuItems: Array<{
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  route: keyof RootStackParamList;
}> = [
  { icon: "home", label: "Home", route: "Home" },
  { icon: "receipt-text", label: "Expenses", route: "Expenses" },
  { icon: "plus-circle", label: "Add Expense", route: "ExpenseForm" },
  { icon: "file-document", label: "Bills", route: "Bills" },
  { icon: "chart-pie", label: "Reports", route: "Reports" },
  { icon: "account-group", label: "People", route: "People" },
  { icon: "shape", label: "Categories", route: "Categories" },
  { icon: "home-city", label: "Households", route: "Households" },
  { icon: "swap-horizontal", label: "Settlements", route: "Settlements" },
];

function DashboardSideMenu({
  onClose,
  onNavigate,
  visible,
}: {
  onClose: () => void;
  onNavigate: (route: keyof RootStackParamList) => void;
  visible: boolean;
}) {
  const { colors } = useAppSettings();
  const rippleColor = `${colors.accent}18`;

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.menuOverlay}>
        <Pressable accessibilityLabel="Close menu" onPress={onClose} style={styles.menuScrim} />
        <View
          style={[
            styles.menuPanel,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.menuHeader}>
            <View>
              <Text style={[styles.menuEyebrow, { color: colors.muted }]}>Sora Expense</Text>
              <Text style={[styles.menuTitle, { color: colors.text }]}>Menu</Text>
            </View>
            <Pressable
              android_ripple={{ color: rippleColor, borderless: true }}
              hitSlop={8}
              onPress={() => onNavigate("Settings")}
              style={styles.menuSettingsButton}
            >
              <MaterialCommunityIcons name="cog-outline" size={25} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.menuList}>
            {sideMenuItems.map((item) => (
              <Pressable
                android_ripple={{ color: rippleColor }}
                key={item.route}
                onPress={() => onNavigate(item.route)}
                style={styles.menuItem}
              >
                <View style={[styles.menuItemIcon, { backgroundColor: `${colors.accent}12` }]}>
                  <MaterialCommunityIcons name={item.icon} size={22} color={colors.accent} />
                </View>
                <Text numberOfLines={1} style={[styles.menuItemText, { color: colors.text }]}>
                  {item.label}
                </Text>
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} />
              </Pressable>
            ))}
          </View>

          <Pressable
            android_ripple={{ color: rippleColor }}
            onPress={() => onNavigate("Settings")}
            style={[styles.menuFooter, { borderColor: colors.border }]}
          >
            <MaterialCommunityIcons name="cog" size={22} color={colors.accent} />
            <Text style={[styles.menuFooterText, { color: colors.text }]}>Settings</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function SpendingCard({
  bars,
  comparison,
  comparisonLabel,
  loading,
  month,
  onNextMonth,
  onPreviousMonth,
  responsive,
  total,
}: {
  bars: number[];
  comparison: ReturnType<typeof getMonthlyComparison>;
  comparisonLabel: string;
  loading: boolean;
  month: string;
  onNextMonth: () => void;
  onPreviousMonth: () => void;
  responsive: ResponsiveMetrics;
  total: number;
}) {
  const { colors } = useAppSettings();
  const comparisonText = comparison
    ? `vs last month ${comparison.direction === "up" ? "↑" : "↓"}${comparison.percent.toFixed(0)}%`
    : "No last month data";

  return (
    <View
      style={[
        styles.spendingCard,
        {
          backgroundColor: colors.accent,
          minHeight: responsive.dashboard.spendingMinHeight,
          padding: responsive.dashboard.cardPadding,
        },
      ]}
    >
      <View
        style={[
          styles.monthPill,
          {
            marginBottom: responsive.tiny ? 24 : responsive.compact ? 30 : 42,
            paddingHorizontal: responsive.compact ? 14 : 18,
            paddingVertical: responsive.compact ? 8 : 10,
          },
        ]}
      >
        <Pressable android_ripple={{ color: "rgba(255,255,255,0.18)", borderless: true }} hitSlop={8} onPress={onPreviousMonth}>
          <MaterialCommunityIcons name="chevron-left" size={22} color="#FFFFFF" />
        </Pressable>
        <Text
          maxFontSizeMultiplier={responsive.maxFontScale}
          numberOfLines={1}
          style={[styles.monthPillText, { fontSize: responsive.dashboard.monthPillFont }]}
        >
          {month === getCurrentMonth() ? "This Month" : "Month"}
        </Text>
        <View style={styles.monthDot} />
        <Text
          maxFontSizeMultiplier={responsive.maxFontScale}
          numberOfLines={1}
          style={[styles.monthPillText, { fontSize: responsive.dashboard.monthPillFont }]}
        >
          {getMonthLabel(month)}
        </Text>
        <Pressable android_ripple={{ color: "rgba(255,255,255,0.18)", borderless: true }} hitSlop={8} onPress={onNextMonth}>
          <MaterialCommunityIcons name="chevron-right" size={22} color="#FFFFFF" />
        </Pressable>
      </View>

      <Text
        maxFontSizeMultiplier={responsive.maxFontScale}
        style={[styles.spendingLabel, { fontSize: responsive.dashboard.spendingLabel }]}
      >
        Total Spent
      </Text>
      <Text
        adjustsFontSizeToFit
        maxFontSizeMultiplier={responsive.maxFontScale}
        minimumFontScale={0.72}
        numberOfLines={1}
        style={[
          styles.spendingAmount,
          {
            fontSize: responsive.dashboard.spendingAmount,
            maxWidth: responsive.tiny ? "62%" : responsive.compact ? "64%" : "70%",
          },
        ]}
      >
        {loading ? "Loading" : formatCurrencyCompact(total)}
      </Text>
      <Text
        maxFontSizeMultiplier={responsive.maxFontScale}
        numberOfLines={1}
        style={[styles.comparisonText, { fontSize: responsive.dashboard.spendingComparison }]}
      >
        {comparisonLabel}
      </Text>

      <View
        pointerEvents="none"
        style={[
          styles.chartBars,
          {
            gap: responsive.dashboard.chartBarGap,
            height: responsive.dashboard.chartHeight,
            right: responsive.dashboard.cardPadding,
            width: responsive.dashboard.chartWidth,
          },
        ]}
      >
        {bars.map((height, index) => (
          <View
            key={`${height}-${index}`}
            style={[
              styles.chartBar,
              {
                height: `${height}%`,
                width: responsive.dashboard.chartBarWidth,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

function BalanceCard({
  amount,
  count,
  icon,
  label,
  onPress,
  personTextPrefix,
  responsive,
  tone,
}: {
  amount: number;
  count: number;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
  personTextPrefix: "From" | "To";
  responsive: ResponsiveMetrics;
  tone: "positive" | "negative";
}) {
  const isPositive = tone === "positive";
  const tint = isPositive ? soraPalette.green : soraPalette.red;
  const noun = count === 1 ? "person" : "people";
  const subtitle = count
    ? `${personTextPrefix} ${count} ${noun}`
    : isPositive
      ? "No pending"
      : "Nothing due";

  return (
    <Pressable
      android_ripple={{ color: isPositive ? "#DDF7E6" : "#F7DDDB" }}
      onPress={onPress}
      style={[
        styles.balanceCard,
        {
          backgroundColor: isPositive ? soraPalette.greenSurface : soraPalette.redSurface,
          borderColor: isPositive ? soraPalette.greenBorder : soraPalette.redBorder,
          minHeight: responsive.dashboard.balanceMinHeight,
          padding: responsive.tiny ? 13 : responsive.compact ? 14 : 16,
        },
      ]}
    >
      <View style={[styles.balanceHeader, { marginBottom: responsive.compact ? 14 : 22 }]}>
        <Text
          maxFontSizeMultiplier={responsive.maxFontScale}
          numberOfLines={2}
          style={[styles.balanceLabel, { fontSize: responsive.dashboard.balanceLabel }]}
        >
          {label}
        </Text>
        <View
          style={[
            styles.balanceIcon,
            {
              backgroundColor: isPositive ? "#E0F7E8" : "#FBE1DF",
              borderRadius: responsive.dashboard.balanceIcon / 2,
              height: responsive.dashboard.balanceIcon,
              width: responsive.dashboard.balanceIcon,
            },
          ]}
        >
          <MaterialCommunityIcons
            name={icon}
            size={Math.round(responsive.dashboard.balanceIcon * 0.52)}
            color={tint}
          />
        </View>
      </View>
      <Text
        adjustsFontSizeToFit
        maxFontSizeMultiplier={responsive.maxFontScale}
        minimumFontScale={0.78}
        numberOfLines={1}
        style={[
          styles.balanceAmount,
          {
            fontSize: responsive.dashboard.balanceAmount,
            marginBottom: responsive.compact ? 14 : 20,
          },
        ]}
      >
        {formatCurrencyCompact(amount)}
      </Text>
      <View style={styles.balanceFooter}>
        <Text
          maxFontSizeMultiplier={responsive.maxFontScale}
          numberOfLines={1}
          style={[styles.balanceSubtitle, { fontSize: responsive.dashboard.balanceFooter }]}
        >
          {subtitle}
        </Text>
        <Text
          maxFontSizeMultiplier={responsive.maxFontScale}
          numberOfLines={1}
          style={[styles.balanceLink, { color: tint, fontSize: responsive.dashboard.balanceFooter }]}
        >
          View
        </Text>
      </View>
    </Pressable>
  );
}

function QuickActions({
  onAddBill,
  onAddExpense,
  onCategories,
  onPeople,
  responsive,
}: {
  onAddBill: () => void;
  onAddExpense: () => void;
  onCategories: () => void;
  onPeople: () => void;
  responsive: ResponsiveMetrics;
}) {
  const { colors } = useAppSettings();
  const actions: Array<{
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    label: string;
    onPress: () => void;
  }> = [
    { icon: "receipt-text", label: "Add Expense", onPress: onAddExpense },
    { icon: "file-document-outline", label: "Add Bill", onPress: onAddBill },
    { icon: "account-group", label: "People", onPress: onPeople },
    { icon: "shape", label: "Categories", onPress: onCategories },
  ];

  return (
    <View style={[styles.section, { marginBottom: responsive.dashboard.sectionGap }]}>
      <Text
        maxFontSizeMultiplier={responsive.maxFontScale}
        style={[styles.sectionTitle, { fontSize: responsive.dashboard.sectionTitle }]}
      >
        Quick Actions
      </Text>
      <View style={[styles.actionRow, { marginTop: responsive.compact ? 14 : 18 }]}>
        {actions.map((action) => (
          <Pressable
            android_ripple={{ color: "#E9E5FF", borderless: false }}
            key={action.label}
            onPress={action.onPress}
            style={[styles.actionButton, { minHeight: responsive.compact ? 92 : 108 }]}
          >
            <View
              style={[
                styles.actionIconCircle,
                soraShadow.soft,
                {
                  borderRadius: responsive.dashboard.actionIcon / 2,
                  height: responsive.dashboard.actionIcon,
                  marginBottom: responsive.compact ? 8 : 12,
                  width: responsive.dashboard.actionIcon,
                },
              ]}
            >
              <MaterialCommunityIcons
                name={action.icon}
                size={responsive.dashboard.actionIconSize}
                color={colors.accent}
              />
            </View>
            <Text
              maxFontSizeMultiplier={responsive.maxFontScale}
              numberOfLines={2}
              style={[
                styles.actionLabel,
                {
                  fontSize: responsive.dashboard.actionLabel,
                  lineHeight: responsive.dashboard.actionLabel + 4,
                },
              ]}
            >
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function RecentExpenses({
  expenses,
  loading,
  onExpensePress,
  onViewAll,
  responsive,
}: {
  expenses: Expense[];
  loading: boolean;
  onExpensePress: (expenseId: number) => void;
  onViewAll: () => void;
  responsive: ResponsiveMetrics;
}) {
  return (
    <View style={[styles.section, { marginBottom: responsive.dashboard.sectionGap }]}>
      <View style={styles.sectionHeader}>
        <Text
          maxFontSizeMultiplier={responsive.maxFontScale}
          style={[styles.sectionTitle, { fontSize: responsive.dashboard.sectionTitle }]}
        >
          Recent Expenses
        </Text>
        <Pressable android_ripple={{ color: "#E9E5FF", borderless: true }} onPress={onViewAll}>
          <Text
            maxFontSizeMultiplier={responsive.maxFontScale}
            style={[styles.viewAllText, { fontSize: responsive.compact ? 18 : 21 }]}
          >
            View All
          </Text>
        </Pressable>
      </View>

      {expenses.length ? (
        expenses.map((expense) => (
          <ExpenseRow
            expense={expense}
            key={expense.id}
            onPress={() => onExpensePress(expense.id)}
            responsive={responsive}
          />
        ))
      ) : (
        <SoraIllustratedEmpty
          compact
          illustration={DashboardEmptyIllustration}
          text={loading ? "Loading your latest expenses." : "Add your first expense to see recent spending here."}
          title={loading ? "Loading expenses" : "No expenses this month"}
        />
      )}
    </View>
  );
}

function ExpenseRow({
  expense,
  onPress,
  responsive,
}: {
  expense: Expense;
  onPress: () => void;
  responsive: ResponsiveMetrics;
}) {
  const categoryName = expense.household_detail?.name ?? expense.category_detail?.name ?? "Uncategorized";
  const visual = getCategoryVisual(expense.category_detail?.name, expense.category_detail?.icon, expense.category_detail?.color);

  return (
    <Pressable android_ripple={{ color: "#F3F0FF" }} onPress={onPress} style={styles.expenseRow}>
      <View
        style={[
          styles.expenseIcon,
          {
            backgroundColor: visual.background,
            borderRadius: responsive.compact ? 26 : 32,
            height: responsive.compact ? 52 : 64,
            width: responsive.compact ? 52 : 64,
          },
        ]}
      >
        <MaterialCommunityIcons name={visual.icon} size={responsive.compact ? 24 : 30} color={visual.color} />
      </View>
      <View style={styles.expenseTextBlock}>
        <Text
          maxFontSizeMultiplier={responsive.maxFontScale}
          numberOfLines={1}
          style={[styles.expenseTitle, { fontSize: responsive.compact ? 17 : 20 }]}
        >
          {expense.title}
        </Text>
        <Text
          maxFontSizeMultiplier={responsive.maxFontScale}
          numberOfLines={1}
          style={[styles.expenseSubtitle, { fontSize: responsive.compact ? 14 : 17 }]}
        >
          {categoryName}
        </Text>
      </View>
      <View style={styles.expenseAmountBlock}>
        <Text
          adjustsFontSizeToFit
          maxFontSizeMultiplier={responsive.maxFontScale}
          minimumFontScale={0.78}
          numberOfLines={1}
          style={[styles.expenseAmount, { fontSize: responsive.compact ? 17 : 20 }]}
        >
          {formatCurrencyCompact(expense.amount)}
        </Text>
        <Text
          maxFontSizeMultiplier={responsive.maxFontScale}
          numberOfLines={1}
          style={[styles.expenseDate, { fontSize: responsive.compact ? 14 : 17 }]}
        >
          {formatRelativeDateLabel(expense.expense_date)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    alignSelf: "center",
    width: "100%",
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  greeting: {
    color: soraPalette.black,
    flex: 1,
    fontSize: 27,
    fontWeight: "900",
    letterSpacing: 0,
  },
  greetingEmoji: {
    fontSize: 22,
  },
  bellButton: {
    position: "relative",
  },
  notificationDot: {
    backgroundColor: "#D94841",
    borderColor: "#FFFFFF",
    borderRadius: 5,
    borderWidth: 2,
    height: 10,
    position: "absolute",
    right: 3,
    top: 1,
    width: 10,
  },
  menuEyebrow: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.2,
    marginBottom: 2,
    textTransform: "uppercase",
  },
  menuFooter: {
    alignItems: "center",
    borderRadius: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    marginTop: "auto",
    minHeight: 56,
    overflow: "hidden",
    paddingHorizontal: 14,
  },
  menuFooterText: {
    fontSize: 16,
    fontWeight: "900",
  },
  menuHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  menuItem: {
    alignItems: "center",
    borderRadius: 18,
    flexDirection: "row",
    minHeight: 54,
    overflow: "hidden",
    paddingHorizontal: 8,
  },
  menuItemIcon: {
    alignItems: "center",
    borderRadius: 18,
    height: 38,
    justifyContent: "center",
    marginRight: 12,
    width: 38,
  },
  menuItemText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
  },
  menuList: {
    gap: 4,
  },
  menuOverlay: {
    flex: 1,
    flexDirection: "row",
  },
  menuPanel: {
    borderRightWidth: 1,
    elevation: 18,
    maxWidth: 330,
    padding: 18,
    paddingTop: 52,
    shadowColor: "#071226",
    shadowOffset: { width: 12, height: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    width: "82%",
  },
  menuScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(7,18,38,0.34)",
  },
  menuSettingsButton: {
    alignItems: "center",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  menuTitle: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 0,
  },
  errorText: {
    fontSize: 14,
    marginBottom: 12,
  },
  spendingCard: {
    borderRadius: soraRadius.card,
    marginBottom: 24,
    minHeight: 190,
    overflow: "hidden",
    padding: 22,
    position: "relative",
  },
  monthPill: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: soraRadius.pill,
    flexDirection: "row",
    gap: 8,
    zIndex: 2,
  },
  monthPillText: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "700",
  },
  monthDot: {
    backgroundColor: "#FFFFFF",
    borderRadius: 3,
    height: 6,
    opacity: 0.9,
    width: 6,
  },
  spendingLabel: {
    color: "rgba(255,255,255,0.72)",
    fontWeight: "500",
    marginBottom: 8,
    zIndex: 2,
  },
  spendingAmount: {
    color: "#FFFFFF",
    fontWeight: "900",
    includeFontPadding: false,
    letterSpacing: 0,
    zIndex: 2,
  },
  comparisonText: {
    color: "#D8FFE0",
    fontWeight: "800",
    marginTop: 12,
    zIndex: 2,
  },
  chartBars: {
    alignItems: "flex-end",
    bottom: 0,
    flexDirection: "row",
    justifyContent: "flex-end",
    opacity: 0.32,
    position: "absolute",
    zIndex: 0,
  },
  chartBar: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
  },
  balanceGrid: {
    flexDirection: "row",
  },
  balanceCard: {
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
  },
  balanceHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  balanceLabel: {
    color: soraPalette.muted,
    flex: 1,
    fontWeight: "500",
  },
  balanceIcon: {
    alignItems: "center",
    justifyContent: "center",
  },
  balanceAmount: {
    color: soraPalette.black,
    fontWeight: "900",
    letterSpacing: 0,
  },
  balanceFooter: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  balanceSubtitle: {
    color: soraPalette.muted,
    flex: 1,
    marginRight: 6,
  },
  balanceLink: {
    fontWeight: "900",
  },
  section: {
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  sectionTitle: {
    color: soraPalette.black,
    fontSize: 27,
    fontWeight: "900",
    letterSpacing: 0,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  actionButton: {
    alignItems: "center",
    flex: 1,
    minHeight: 116,
  },
  actionIconCircle: {
    alignItems: "center",
    backgroundColor: soraPalette.appBackground,
    borderColor: soraPalette.border,
    borderWidth: 1,
    justifyContent: "center",
    position: "relative",
  },
  actionLabel: {
    color: "#3F4A5D",
    fontWeight: "500",
    textAlign: "center",
  },
  newBadge: {
    backgroundColor: soraPalette.blue,
    borderColor: "#FFFFFF",
    borderRadius: 3,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 5,
    position: "absolute",
    right: -8,
    top: 1,
  },
  newBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  viewAllText: {
    color: soraPalette.purple,
    fontSize: 22,
    fontWeight: "900",
  },
  expenseRow: {
    alignItems: "center",
    borderRadius: 16,
    flexDirection: "row",
    marginBottom: 20,
    minHeight: 72,
  },
  expenseIcon: {
    alignItems: "center",
    borderRadius: 32,
    height: 64,
    justifyContent: "center",
    marginRight: 16,
    width: 64,
  },
  expenseTextBlock: {
    flex: 1,
    marginRight: 10,
  },
  expenseTitle: {
    color: soraPalette.black,
    fontSize: 21,
    fontWeight: "900",
    letterSpacing: 0,
  },
  expenseSubtitle: {
    color: soraPalette.muted,
    fontSize: 18,
    marginTop: 4,
  },
  expenseAmountBlock: {
    alignItems: "flex-end",
    maxWidth: 120,
  },
  expenseAmount: {
    color: soraPalette.black,
    fontSize: 21,
    fontWeight: "900",
  },
  expenseDate: {
    color: soraPalette.muted,
    fontSize: 18,
    marginTop: 5,
  },
});
