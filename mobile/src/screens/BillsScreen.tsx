import { type ComponentType, useCallback, useMemo, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Text, TextInput } from "react-native-paper";
import type { SvgProps } from "react-native-svg";

import { AppButton } from "../components/AppLayout";
import { SoraIllustratedEmpty } from "../components/SoraIllustratedEmpty";
import { SoraCard, SoraChip, SoraError, SoraScreen, SoraSectionHeader } from "../components/SoraUI";
import { useAppSettings } from "../context/AppSettingsContext";
import type { RootStackParamList } from "../navigation/RootNavigator";
import {
  createRecurringBill,
  getBillCalendar,
  getCategories,
  getRecurringBills,
  markBillPaid,
  skipBillOccurrence,
  updateRecurringBill,
} from "../services/expenseApi";
import { getCategoryVisual } from "../theme/soraTheme";
import type { BillOccurrence, ExpenseCategory, PaymentMethod, RecurringBill } from "../types/api";
import { getCurrentMonth, getTodayDate, isValidDate, isValidMonth } from "../utils/date";
import { formatCurrencyCompact, formatDateLabel, parseAmount } from "../utils/format";
import BillsEmptyIllustration from "../../illustrations/character-reading-newspaper-with-coffee.svg";
import BillsHistoryIllustration from "../../illustrations/person-using-smartphone-successfully.svg";

type Props = NativeStackScreenProps<RootStackParamList, "Bills">;
type Tab = "upcoming" | "recurring" | "history";
type StatusFilter = "all" | "upcoming" | "overdue" | "paid" | "skipped";
type ScopeFilter = "all" | "personal" | "household";
type ViewMode = "month" | "all";

function formatMonthShort(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  });
}

function daysUntil(value: string) {
  const date = new Date(`${value}T00:00:00`);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((dateStart.getTime() - todayStart.getTime()) / 86400000);
}

function getDueText(occurrence: BillOccurrence) {
  if (occurrence.status === "paid") {
    return occurrence.paid_at ? `Paid ${formatDateLabel(occurrence.paid_at.slice(0, 10))}` : "Paid";
  }
  if (occurrence.status === "skipped") {
    return "Skipped";
  }

  const days = daysUntil(occurrence.due_date);
  if (days < 0) {
    return `Overdue by ${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"}`;
  }
  if (days === 0) {
    return "Due today";
  }
  if (days === 1) {
    return "Due tomorrow";
  }
  if (days <= 7) {
    return `In ${days} days`;
  }
  return formatDateLabel(occurrence.due_date);
}

function getOccurrenceStatus(occurrence: BillOccurrence): BillOccurrence["status"] {
  if (occurrence.status === "upcoming" && daysUntil(occurrence.due_date) < 0) {
    return "overdue";
  }
  return occurrence.status;
}

function getScopeLabel(bill?: RecurringBill) {
  return bill?.household ? "Household" : "Personal";
}

function isSameMonth(dateValue: string, month: string) {
  return dateValue.startsWith(month);
}

export function BillsScreen({ navigation }: Props) {
  const [tab, setTab] = useState<Tab>("upcoming");
  const [month, setMonth] = useState(getCurrentMonth());
  const [monthInput, setMonthInput] = useState(getCurrentMonth());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [bills, setBills] = useState<RecurringBill[]>([]);
  const [occurrences, setOccurrences] = useState<BillOccurrence[]>([]);
  const [billName, setBillName] = useState("");
  const [billAmount, setBillAmount] = useState("");
  const [billDate, setBillDate] = useState(getTodayDate());
  const [billCategory, setBillCategory] = useState<number | null>(null);
  const [billMethod, setBillMethod] = useState<PaymentMethod>("upi");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [monthSheetVisible, setMonthSheetVisible] = useState(false);
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [addSheetVisible, setAddSheetVisible] = useState(false);
  const [markPaidSheet, setMarkPaidSheet] = useState<BillOccurrence | null>(null);
  const [markPaidAmount, setMarkPaidAmount] = useState("");
  const [markPaidDate, setMarkPaidDate] = useState(getTodayDate());
  const [markPaidMethod, setMarkPaidMethod] = useState<PaymentMethod>("upi");
  const [createExpenseAfterPay, setCreateExpenseAfterPay] = useState(true);

  const load = useCallback(async () => {
    if (!isValidMonth(month)) {
      setError("Month must use YYYY-MM format.");
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setError("");
    try {
      const [categoryRows, billRows, calendarRows] = await Promise.all([
        getCategories(),
        getRecurringBills(),
        getBillCalendar(month),
      ]);
      setCategories(categoryRows);
      setBills(billRows);
      setOccurrences(calendarRows);
      if (!billCategory && categoryRows[0]) {
        setBillCategory(categoryRows[0].id);
      }
    } catch {
      setError("Could not load bills. Check backend connection.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [billCategory, month]);

  useFocusEffect(
    useCallback(() => {
      setLoading(bills.length === 0 && occurrences.length === 0);
      load();
    }, [bills.length, load, occurrences.length])
  );

  const refresh = () => {
    setRefreshing(true);
    load();
  };

  const filteredOccurrences = useMemo(() => {
    return occurrences
      .filter((occurrence) => viewMode === "all" || isSameMonth(occurrence.due_date, month))
      .filter((occurrence) => {
        const scope = getScopeLabel(occurrence.recurring_bill_detail).toLowerCase() as ScopeFilter;
        return scopeFilter === "all" || scope === scopeFilter;
      })
      .filter((occurrence) => {
        const status = getOccurrenceStatus(occurrence);
        return statusFilter === "all" || status === statusFilter;
      })
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
  }, [month, occurrences, scopeFilter, statusFilter, viewMode]);

  const openOccurrences = useMemo(
    () => filteredOccurrences.filter((item) => !["paid", "skipped"].includes(item.status)),
    [filteredOccurrences]
  );
  const overdueOccurrences = useMemo(
    () => openOccurrences.filter((item) => getOccurrenceStatus(item) === "overdue"),
    [openOccurrences]
  );
  const dueSoonOccurrences = useMemo(
    () => openOccurrences.filter((item) => {
      const days = daysUntil(item.due_date);
      return days >= 0 && days <= 7;
    }),
    [openOccurrences]
  );
  const urgentOccurrences = useMemo(
    () => overdueOccurrences.concat(dueSoonOccurrences).slice(0, 3),
    [dueSoonOccurrences, overdueOccurrences]
  );
  const laterOccurrences = useMemo(
    () => openOccurrences.filter((item) => daysUntil(item.due_date) > 7),
    [openOccurrences]
  );
  const historyOccurrences = useMemo(
    () => filteredOccurrences.filter((item) => ["paid", "skipped", "overdue"].includes(getOccurrenceStatus(item))),
    [filteredOccurrences]
  );

  const totalUpcoming = useMemo(
    () => openOccurrences.reduce((sum, item) => sum + parseAmount(item.amount), 0),
    [openOccurrences]
  );
  const recurringTotal = useMemo(
    () => bills.filter((bill) => bill.is_active).reduce((sum, bill) => sum + parseAmount(bill.amount), 0),
    [bills]
  );
  const activeBillsCount = bills.filter((bill) => bill.is_active).length;
  const dueSoonCount = overdueOccurrences.length + dueSoonOccurrences.length;

  const applyMonthInput = (value = monthInput) => {
    const nextMonth = value.trim();
    if (!isValidMonth(nextMonth)) {
      setError("Month must use YYYY-MM format.");
      return;
    }
    setError("");
    setMonthInput(nextMonth);
    setMonth(nextMonth);
  };

  const saveRecurring = async () => {
    const amount = Number(billAmount);
    if (!billName.trim() || !Number.isFinite(amount) || amount <= 0 || !isValidDate(billDate)) {
      setError("Enter bill name, amount and date.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await createRecurringBill({
        amount: amount.toFixed(2),
        category: billCategory,
        frequency: "monthly",
        name: billName.trim(),
        next_due_date: billDate,
        payment_method: billMethod,
      });
      setBillName("");
      setBillAmount("");
      setAddSheetVisible(false);
      setTab("recurring");
      await load();
    } catch {
      setError("Could not create recurring bill.");
    } finally {
      setSaving(false);
    }
  };

  const openMarkPaid = (occurrence: BillOccurrence) => {
    setMarkPaidSheet(occurrence);
    setMarkPaidAmount(occurrence.amount);
    setMarkPaidDate(getTodayDate());
    setMarkPaidMethod(occurrence.recurring_bill_detail?.payment_method ?? "upi");
    setCreateExpenseAfterPay(true);
  };

  const confirmMarkPaid = async () => {
    if (!markPaidSheet) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      await markBillPaid(markPaidSheet.id, {
        amount: markPaidAmount,
        create_expense: createExpenseAfterPay,
        paid_date: markPaidDate,
        payment_method: markPaidMethod,
      });
      setMarkPaidSheet(null);
      await load();
    } catch {
      setError("Could not mark bill as paid.");
    } finally {
      setSaving(false);
    }
  };

  const skipOccurrence = async (occurrence: BillOccurrence) => {
    setError("");
    try {
      await skipBillOccurrence(occurrence.id);
      await load();
    } catch {
      setError("Could not skip bill occurrence.");
    }
  };

  const toggleRecurring = async (bill: RecurringBill) => {
    setError("");
    try {
      await updateRecurringBill(bill.id, { is_active: !bill.is_active });
      await load();
    } catch {
      setError("Could not update recurring bill.");
    }
  };

  return (
    <>
      <SoraScreen bottomNavCurrent="Budget" onRefresh={refresh} refreshing={refreshing}>
        <BillsHeader
          dueSoonCount={dueSoonCount}
          month={month}
          onBack={() => navigation.navigate("Home")}
          onFilter={() => setFilterSheetVisible(true)}
          onMonth={() => setMonthSheetVisible(true)}
          totalUpcoming={totalUpcoming}
        />
        <SoraError text={error} />

        <BillsSummaryCard
          activeBillsCount={activeBillsCount}
          dueSoonCount={dueSoonCount}
          overdueCount={overdueOccurrences.length}
          recurringTotal={recurringTotal}
          totalUpcoming={totalUpcoming}
        />

        <MonthFilterRow
          monthInput={monthInput}
          onMonth={() => {
            setMonthInput(month);
            setMonthSheetVisible(true);
          }}
          onMonthChange={setMonthInput}
          onMonthSubmit={() => applyMonthInput()}
          onViewModeChange={setViewMode}
          viewMode={viewMode}
        />

        {urgentOccurrences.length ? (
          <>
            <SoraSectionHeader title="Due soon" action="View all" onAction={() => setTab("upcoming")} />
            {urgentOccurrences.map((occurrence) => (
              <BillOccurrenceRow
                compact
                key={`urgent-${occurrence.id}`}
                occurrence={occurrence}
                onMarkPaid={() => openMarkPaid(occurrence)}
                onSkip={() => skipOccurrence(occurrence)}
              />
            ))}
          </>
        ) : null}

        <SegmentedTabs active={tab} onChange={setTab} />

        {tab === "upcoming" ? (
          <UpcomingTab
            later={laterOccurrences}
            loading={loading}
            onAdd={() => setAddSheetVisible(true)}
            onMarkPaid={openMarkPaid}
            onSkip={skipOccurrence}
            overdue={overdueOccurrences}
            thisWeek={dueSoonOccurrences}
          />
        ) : null}

        {tab === "recurring" ? (
          <RecurringTab
            activeCount={activeBillsCount}
            bills={bills}
            loading={loading}
            monthlyExpected={recurringTotal}
            onAdd={() => setAddSheetVisible(true)}
            onToggle={toggleRecurring}
          />
        ) : null}

        {tab === "history" ? (
          <HistoryTab
            loading={loading}
            occurrences={historyOccurrences}
            statusFilter={statusFilter}
            onFilterChange={setStatusFilter}
          />
        ) : null}
      </SoraScreen>

      <MonthInputSheet
        monthInput={monthInput}
        onApply={() => {
          applyMonthInput();
          if (isValidMonth(monthInput.trim())) {
            setMonthSheetVisible(false);
          }
        }}
        onChange={setMonthInput}
        onClose={() => setMonthSheetVisible(false)}
        visible={monthSheetVisible}
      />
      <FilterSheet
        onClose={() => setFilterSheetVisible(false)}
        onScopeChange={setScopeFilter}
        onStatusChange={setStatusFilter}
        scopeFilter={scopeFilter}
        statusFilter={statusFilter}
        visible={filterSheetVisible}
      />
      <MarkPaidBottomSheet
        amount={markPaidAmount}
        createExpense={createExpenseAfterPay}
        method={markPaidMethod}
        occurrence={markPaidSheet}
        onAmountChange={setMarkPaidAmount}
        onClose={() => setMarkPaidSheet(null)}
        onCreateExpenseChange={setCreateExpenseAfterPay}
        onDateChange={setMarkPaidDate}
        onMethodChange={setMarkPaidMethod}
        onSubmit={confirmMarkPaid}
        paidDate={markPaidDate}
        saving={saving}
      />
      <AddBillSheet
        billAmount={billAmount}
        billCategory={billCategory}
        billDate={billDate}
        billMethod={billMethod}
        billName={billName}
        categories={categories}
        onAmountChange={setBillAmount}
        onCategoryChange={setBillCategory}
        onClose={() => setAddSheetVisible(false)}
        onDateChange={setBillDate}
        onMethodChange={setBillMethod}
        onNameChange={setBillName}
        onSaveRecurring={saveRecurring}
        saving={saving}
        visible={addSheetVisible}
      />
    </>
  );
}

function BillsHeader({
  dueSoonCount,
  month,
  onBack,
  onFilter,
  onMonth,
  totalUpcoming,
}: {
  dueSoonCount: number;
  month: string;
  onBack: () => void;
  onFilter: () => void;
  onMonth: () => void;
  totalUpcoming: number;
}) {
  const { colors } = useAppSettings();
  const subtitle = dueSoonCount ? `${formatMonthShort(month)} - ${dueSoonCount} due soon` : `${formatMonthShort(month)} - Upcoming ${formatCurrencyCompact(totalUpcoming)}`;

  return (
    <View style={styles.header}>
      <Pressable android_ripple={{ color: `${colors.accent}18`, borderless: true }} hitSlop={8} onPress={onBack} style={styles.headerIcon}>
        <MaterialCommunityIcons name="arrow-left" size={26} color={colors.text} />
      </Pressable>
      <View style={styles.headerTitleWrap}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Bills</Text>
        <Text style={[styles.headerSubtitle, { color: colors.muted }]}>{subtitle}</Text>
      </View>
      <Pressable android_ripple={{ color: `${colors.accent}18`, borderless: true }} hitSlop={8} onPress={onMonth} style={styles.headerIcon}>
        <MaterialCommunityIcons name="calendar-month" size={25} color={colors.text} />
      </Pressable>
      <Pressable android_ripple={{ color: `${colors.accent}18`, borderless: true }} hitSlop={8} onPress={onFilter} style={styles.headerIcon}>
        <MaterialCommunityIcons name="filter-variant" size={25} color={colors.text} />
      </Pressable>
    </View>
  );
}

function BillsSummaryCard({
  activeBillsCount,
  dueSoonCount,
  overdueCount,
  recurringTotal,
  totalUpcoming,
}: {
  activeBillsCount: number;
  dueSoonCount: number;
  overdueCount: number;
  recurringTotal: number;
  totalUpcoming: number;
}) {
  const { colors } = useAppSettings();
  const pillText = overdueCount ? `${overdueCount} overdue` : dueSoonCount ? `${dueSoonCount} due soon` : totalUpcoming ? "All clear" : "No upcoming bills";
  const pillColor = overdueCount ? colors.danger : totalUpcoming ? colors.success : "rgba(255,255,255,0.22)";

  return (
    <SoraCard tone="purple" style={styles.summaryCard}>
      <View style={styles.summaryTop}>
        <View>
          <Text style={styles.summaryLabel}>Bills this month</Text>
          <Text style={styles.summaryAmount}>{formatCurrencyCompact(totalUpcoming)}</Text>
        </View>
        <View style={[styles.summaryPill, { backgroundColor: pillColor }]}>
          <Text style={styles.summaryPillText}>{pillText}</Text>
        </View>
      </View>
      <View style={styles.metricRow}>
        <SummaryMetric label="Recurring" value={formatCurrencyCompact(recurringTotal)} />
        <SummaryMetric label="Active bills" value={String(activeBillsCount)} />
        <SummaryMetric label="Overdue" value={String(overdueCount)} />
      </View>
    </SoraCard>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text numberOfLines={1} style={styles.metricLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function MonthFilterRow({
  monthInput,
  onMonth,
  onMonthChange,
  onMonthSubmit,
  onViewModeChange,
  viewMode,
}: {
  monthInput: string;
  onMonth: () => void;
  onMonthChange: (value: string) => void;
  onMonthSubmit: () => void;
  onViewModeChange: (mode: ViewMode) => void;
  viewMode: ViewMode;
}) {
  const { colors } = useAppSettings();
  return (
    <View style={styles.monthFilterRow}>
      <TextInput
        dense
        keyboardType="numbers-and-punctuation"
        label="Month"
        mode="outlined"
        onBlur={onMonthSubmit}
        onChangeText={onMonthChange}
        onSubmitEditing={onMonthSubmit}
        placeholder="YYYY-MM"
        right={<TextInput.Icon icon="calendar-month" onPress={onMonth} />}
        style={styles.monthInput}
        value={monthInput}
      />
      <View style={[styles.viewToggle, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <ToggleButton active={viewMode === "month"} label="This month" onPress={() => onViewModeChange("month")} />
        <ToggleButton active={viewMode === "all"} label="All bills" onPress={() => onViewModeChange("all")} />
      </View>
    </View>
  );
}

function ToggleButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  const { colors } = useAppSettings();
  return (
    <Pressable onPress={onPress} style={[styles.toggleButton, active && { backgroundColor: colors.accent }]}>
      <Text style={[styles.toggleText, { color: active ? "#FFFFFF" : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

function SegmentedTabs({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  const { colors } = useAppSettings();
  const tabs: Array<{ label: string; value: Tab }> = [
    { label: "Upcoming", value: "upcoming" },
    { label: "Recurring", value: "recurring" },
    { label: "History", value: "history" },
  ];

  return (
    <View style={styles.tabs}>
      {tabs.map((tab) => (
        <Pressable
          android_ripple={{ color: `${colors.accent}22` }}
          key={tab.value}
          onPress={() => onChange(tab.value)}
          style={[
            styles.tabButton,
            { backgroundColor: colors.card, borderColor: colors.border },
            active === tab.value && { backgroundColor: colors.accent, borderColor: colors.accent },
          ]}
        >
          <Text style={[styles.tabText, { color: active === tab.value ? "#FFFFFF" : colors.text }]}>{tab.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function UpcomingTab({
  later,
  loading,
  onAdd,
  onMarkPaid,
  onSkip,
  overdue,
  thisWeek,
}: {
  later: BillOccurrence[];
  loading: boolean;
  onAdd: () => void;
  onMarkPaid: (occurrence: BillOccurrence) => void;
  onSkip: (occurrence: BillOccurrence) => void;
  overdue: BillOccurrence[];
  thisWeek: BillOccurrence[];
}) {
  if (!overdue.length && !thisWeek.length && !later.length) {
    return (
      <EmptyBillsState
        cta="Add recurring bill"
        illustration={BillsEmptyIllustration}
        onCta={onAdd}
        text={loading ? "Loading bills..." : "Recurring bills will appear here when they are due."}
        title={loading ? "Loading upcoming bills" : "No upcoming bills"}
      />
    );
  }

  return (
    <>
      <OccurrenceGroup title="Overdue" rows={overdue} onMarkPaid={onMarkPaid} onSkip={onSkip} />
      <OccurrenceGroup title="Due this week" rows={thisWeek} onMarkPaid={onMarkPaid} onSkip={onSkip} />
      <OccurrenceGroup title="Later this month" rows={later} onMarkPaid={onMarkPaid} onSkip={onSkip} />
    </>
  );
}

function OccurrenceGroup({
  onMarkPaid,
  onSkip,
  rows,
  title,
}: {
  onMarkPaid: (occurrence: BillOccurrence) => void;
  onSkip: (occurrence: BillOccurrence) => void;
  rows: BillOccurrence[];
  title: string;
}) {
  if (!rows.length) {
    return null;
  }
  return (
    <>
      <SoraSectionHeader title={title} />
      {rows.map((occurrence) => (
        <BillOccurrenceRow
          key={`${title}-${occurrence.id}`}
          occurrence={occurrence}
          onMarkPaid={() => onMarkPaid(occurrence)}
          onSkip={() => onSkip(occurrence)}
        />
      ))}
    </>
  );
}

function RecurringTab({
  activeCount,
  bills,
  loading,
  monthlyExpected,
  onAdd,
  onToggle,
}: {
  activeCount: number;
  bills: RecurringBill[];
  loading: boolean;
  monthlyExpected: number;
  onAdd: () => void;
  onToggle: (bill: RecurringBill) => void;
}) {
  const { colors } = useAppSettings();
  return (
    <>
      <SoraCard style={styles.recurringSummary}>
        <Text style={[styles.recurringSummaryTitle, { color: colors.text }]}>{activeCount} active recurring bills</Text>
        <Text style={[styles.recurringSummaryMeta, { color: colors.muted }]}>Monthly expected: {formatCurrencyCompact(monthlyExpected)}</Text>
      </SoraCard>
      {bills.length ? (
        bills.map((bill) => <RecurringBillRow bill={bill} key={bill.id} onToggle={() => onToggle(bill)} />)
      ) : (
        <EmptyBillsState
          cta="Add your first bill"
          illustration={BillsEmptyIllustration}
          onCta={onAdd}
          text={loading ? "Loading recurring bills..." : "Track rent, electricity, Wi-Fi, LPG, school fees, and subscriptions."}
          title={loading ? "Loading recurring bills" : "No recurring bills"}
        />
      )}
    </>
  );
}

function HistoryTab({
  loading,
  occurrences,
  onFilterChange,
  statusFilter,
}: {
  loading: boolean;
  occurrences: BillOccurrence[];
  onFilterChange: (filter: StatusFilter) => void;
  statusFilter: StatusFilter;
}) {
  const filters: StatusFilter[] = ["all", "paid", "skipped", "overdue"];
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {filters.map((filter) => (
          <SoraChip active={statusFilter === filter} key={filter} onPress={() => onFilterChange(filter)}>
            {filter === "all" ? "All" : filter}
          </SoraChip>
        ))}
      </ScrollView>
      {occurrences.length ? (
        occurrences.map((occurrence) => <BillOccurrenceRow key={`history-${occurrence.id}`} occurrence={occurrence} />)
      ) : (
        <EmptyBillsState
          illustration={BillsHistoryIllustration}
          text={loading ? "Loading bill history..." : "Paid bills will appear here."}
          title={loading ? "Loading history" : "No bill history yet"}
        />
      )}
    </>
  );
}

function BillOccurrenceRow({
  compact,
  occurrence,
  onMarkPaid,
  onSkip,
}: {
  compact?: boolean;
  occurrence: BillOccurrence;
  onMarkPaid?: () => void;
  onSkip?: () => void;
}) {
  const { colors } = useAppSettings();
  const bill = occurrence.recurring_bill_detail;
  const status = getOccurrenceStatus(occurrence);
  const isClosed = status === "paid" || status === "skipped";
  const visual = getCategoryVisual(bill?.category_detail?.name, bill?.category_detail?.icon, bill?.category_detail?.color);

  return (
    <SoraCard style={[styles.billRowCard, compact && styles.compactBillRow]}>
      <View style={styles.billRow}>
        <View style={[styles.billIcon, { backgroundColor: visual.background }]}>
          <MaterialCommunityIcons name={visual.icon} size={24} color={visual.color} />
        </View>
        <View style={styles.billText}>
          <Text numberOfLines={1} style={[styles.billTitle, { color: colors.text }]}>{bill?.name ?? "Bill"}</Text>
          <Text numberOfLines={1} style={[styles.billMeta, { color: colors.muted }]}>
            {getScopeLabel(bill)} - {getDueText(occurrence)}
          </Text>
          {occurrence.paid_expense ? (
            <Text style={[styles.expenseTag, { color: colors.success }]}>Expense created</Text>
          ) : null}
        </View>
        <View style={styles.billRight}>
          <Text numberOfLines={1} style={[styles.billAmount, { color: colors.text }]}>{formatCurrencyCompact(occurrence.amount)}</Text>
          <BillStatusPill status={status} />
        </View>
      </View>
      {!isClosed && onMarkPaid ? (
        <View style={styles.quickActions}>
          <AppButton compact mode="contained" onPress={onMarkPaid}>Mark paid</AppButton>
          {onSkip ? <AppButton compact mode="text" onPress={onSkip}>Skip</AppButton> : null}
        </View>
      ) : null}
    </SoraCard>
  );
}

function RecurringBillRow({ bill, onToggle }: { bill: RecurringBill; onToggle: () => void }) {
  const { colors } = useAppSettings();
  const visual = getCategoryVisual(bill.category_detail?.name, bill.category_detail?.icon, bill.category_detail?.color);

  return (
    <SoraCard style={styles.billRowCard}>
      <View style={styles.billRow}>
        <View style={[styles.billIcon, { backgroundColor: visual.background }]}>
          <MaterialCommunityIcons name={visual.icon} size={24} color={visual.color} />
        </View>
        <View style={styles.billText}>
          <Text numberOfLines={1} style={[styles.billTitle, { color: colors.text }]}>{bill.name}</Text>
          <Text numberOfLines={1} style={[styles.billMeta, { color: colors.muted }]}>
            {bill.frequency} - Next: {formatDateLabel(bill.next_due_date)}
          </Text>
          <View style={styles.rulePills}>
            <BillStatusPill label={bill.is_active ? "Active" : "Paused"} status={bill.is_active ? "paid" : "skipped"} />
            {bill.auto_create_expense ? <BillStatusPill label="Auto expense" status="upcoming" /> : null}
          </View>
        </View>
        <View style={styles.billRight}>
          <Text numberOfLines={1} style={[styles.billAmount, { color: colors.text }]}>{formatCurrencyCompact(bill.amount)}</Text>
          <Switch value={bill.is_active} onValueChange={onToggle} thumbColor={bill.is_active ? colors.accent : colors.muted} />
        </View>
      </View>
    </SoraCard>
  );
}

function BillStatusPill({ label, status }: { label?: string; status: BillOccurrence["status"] }) {
  const { colors } = useAppSettings();
  const tone =
    status === "overdue"
      ? { backgroundColor: `${colors.danger}18`, color: colors.danger }
      : status === "paid"
        ? { backgroundColor: `${colors.success}18`, color: colors.success }
        : status === "skipped"
          ? { backgroundColor: `${colors.muted}18`, color: colors.muted }
          : { backgroundColor: `${colors.accent}18`, color: colors.accent };

  return (
    <View style={[styles.statusPill, { backgroundColor: tone.backgroundColor }]}>
      <Text style={[styles.statusText, { color: tone.color }]}>{label ?? status}</Text>
    </View>
  );
}

function EmptyBillsState({
  compact,
  cta,
  illustration,
  onCta,
  text,
  title,
}: {
  compact?: boolean;
  cta?: string;
  illustration: ComponentType<SvgProps>;
  onCta?: () => void;
  text: string;
  title: string;
}) {
  return (
    <SoraIllustratedEmpty
      action={cta && onCta ? <AppButton compact mode="contained" onPress={onCta}>{cta}</AppButton> : null}
      compact={compact}
      illustration={illustration}
      text={text}
      title={title}
    />
  );
}

function MonthInputSheet({
  monthInput,
  onApply,
  onChange,
  onClose,
  visible,
}: {
  monthInput: string;
  onApply: () => void;
  onChange: (value: string) => void;
  onClose: () => void;
  visible: boolean;
}) {
  return (
    <BottomSheet onClose={onClose} title="Set month" visible={visible}>
      <TextInput
        autoCapitalize="none"
        keyboardType="numbers-and-punctuation"
        label="Month"
        mode="outlined"
        onChangeText={onChange}
        onSubmitEditing={onApply}
        placeholder="2026-07"
        style={styles.input}
        value={monthInput}
      />
      <View style={styles.sheetActions}>
        <AppButton mode="outlined" onPress={onClose}>Cancel</AppButton>
        <AppButton mode="contained" onPress={onApply}>Apply</AppButton>
      </View>
    </BottomSheet>
  );
}

function FilterSheet({
  onClose,
  onScopeChange,
  onStatusChange,
  scopeFilter,
  statusFilter,
  visible,
}: {
  onClose: () => void;
  onScopeChange: (filter: ScopeFilter) => void;
  onStatusChange: (filter: StatusFilter) => void;
  scopeFilter: ScopeFilter;
  statusFilter: StatusFilter;
  visible: boolean;
}) {
  const statuses: StatusFilter[] = ["all", "upcoming", "overdue", "paid", "skipped"];
  const scopes: ScopeFilter[] = ["all", "personal", "household"];
  return (
    <BottomSheet onClose={onClose} title="Filter bills" visible={visible}>
      <Text style={styles.sheetLabel}>Status</Text>
      <View style={styles.sheetGrid}>
        {statuses.map((status) => (
          <SoraChip active={statusFilter === status} key={status} onPress={() => onStatusChange(status)}>
            {status === "all" ? "All" : status}
          </SoraChip>
        ))}
      </View>
      <Text style={styles.sheetLabel}>Scope</Text>
      <View style={styles.sheetGrid}>
        {scopes.map((scope) => (
          <SoraChip active={scopeFilter === scope} key={scope} onPress={() => onScopeChange(scope)}>
            {scope === "all" ? "All" : scope}
          </SoraChip>
        ))}
      </View>
      <AppButton mode="contained" onPress={onClose}>Apply</AppButton>
    </BottomSheet>
  );
}

function MarkPaidBottomSheet({
  amount,
  createExpense,
  method,
  occurrence,
  onAmountChange,
  onClose,
  onCreateExpenseChange,
  onDateChange,
  onMethodChange,
  onSubmit,
  paidDate,
  saving,
}: {
  amount: string;
  createExpense: boolean;
  method: PaymentMethod;
  occurrence: BillOccurrence | null;
  onAmountChange: (value: string) => void;
  onClose: () => void;
  onCreateExpenseChange: (value: boolean) => void;
  onDateChange: (value: string) => void;
  onMethodChange: (value: PaymentMethod) => void;
  onSubmit: () => void;
  paidDate: string;
  saving: boolean;
}) {
  const { colors } = useAppSettings();
  return (
    <BottomSheet onClose={onClose} title={`Mark ${occurrence?.recurring_bill_detail?.name ?? "bill"} as paid?`} visible={Boolean(occurrence)}>
      <TextInput keyboardType="decimal-pad" label="Amount" mode="outlined" value={amount} onChangeText={onAmountChange} style={styles.input} />
      <TextInput label="Paid date" mode="outlined" value={paidDate} onChangeText={onDateChange} style={styles.input} />
      <Text style={styles.sheetLabel}>Payment method</Text>
      <View style={styles.sheetGrid}>
        <SoraChip active={method === "upi"} onPress={() => onMethodChange("upi")}>UPI</SoraChip>
        <SoraChip active={method === "cash"} onPress={() => onMethodChange("cash")}>Cash</SoraChip>
      </View>
      <View style={styles.switchRow}>
        <View style={styles.switchText}>
          <Text style={[styles.switchTitle, { color: colors.text }]}>Create expense after payment</Text>
          <Text style={[styles.switchMeta, { color: colors.muted }]}>The backend will link this bill to an expense.</Text>
        </View>
        <Switch value={createExpense} onValueChange={onCreateExpenseChange} thumbColor={createExpense ? colors.accent : colors.muted} />
      </View>
      <View style={styles.sheetActions}>
        <AppButton mode="outlined" onPress={onClose}>Cancel</AppButton>
        <AppButton mode="contained" loading={saving} onPress={onSubmit}>Mark paid</AppButton>
      </View>
    </BottomSheet>
  );
}

function AddBillSheet({
  billAmount,
  billCategory,
  billDate,
  billMethod,
  billName,
  categories,
  onAmountChange,
  onCategoryChange,
  onClose,
  onDateChange,
  onMethodChange,
  onNameChange,
  onSaveRecurring,
  saving,
  visible,
}: {
  billAmount: string;
  billCategory: number | null;
  billDate: string;
  billMethod: PaymentMethod;
  billName: string;
  categories: ExpenseCategory[];
  onAmountChange: (value: string) => void;
  onCategoryChange: (value: number | null) => void;
  onClose: () => void;
  onDateChange: (value: string) => void;
  onMethodChange: (value: PaymentMethod) => void;
  onNameChange: (value: string) => void;
  onSaveRecurring: () => void;
  saving: boolean;
  visible: boolean;
}) {
  return (
    <BottomSheet onClose={onClose} title="Add recurring bill" visible={visible}>
      <TextInput label="Bill name" mode="outlined" value={billName} onChangeText={onNameChange} style={styles.input} />
      <TextInput label="Amount" mode="outlined" value={billAmount} onChangeText={onAmountChange} keyboardType="decimal-pad" style={styles.input} />
      <TextInput label="Next due date" mode="outlined" value={billDate} onChangeText={onDateChange} style={styles.input} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {categories.map((category) => (
          <SoraChip active={billCategory === category.id} key={category.id} onPress={() => onCategoryChange(category.id)}>
            {category.name}
          </SoraChip>
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        <SoraChip active={billMethod === "upi"} onPress={() => onMethodChange("upi")}>UPI</SoraChip>
        <SoraChip active={billMethod === "cash"} onPress={() => onMethodChange("cash")}>Cash</SoraChip>
      </ScrollView>
      <AppButton mode="contained" loading={saving} onPress={onSaveRecurring}>Save recurring bill</AppButton>
    </BottomSheet>
  );
}

function BottomSheet({
  children,
  onClose,
  title,
  visible,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
  visible: boolean;
}) {
  const { colors } = useAppSettings();
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 18}
        style={styles.sheetKeyboard}
      >
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>{title}</Text>
            <Pressable android_ripple={{ color: `${colors.accent}18`, borderless: true }} hitSlop={8} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: 14,
    minHeight: 62,
  },
  headerIcon: {
    alignItems: "center",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 4,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "900",
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  summaryCard: {
    minHeight: 168,
    paddingVertical: 18,
  },
  summaryTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryLabel: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 15,
    fontWeight: "800",
  },
  summaryAmount: {
    color: "#FFFFFF",
    fontSize: 40,
    fontWeight: "900",
    marginTop: 4,
  },
  summaryPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  summaryPillText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  metricRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
  },
  metric: {
    flex: 1,
  },
  metricLabel: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontWeight: "800",
  },
  metricValue: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
    marginTop: 2,
  },
  monthFilterRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  monthInput: {
    flexBasis: 132,
    minWidth: 124,
  },
  viewToggle: {
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    minHeight: 50,
    padding: 4,
  },
  toggleButton: {
    alignItems: "center",
    borderRadius: 999,
    flex: 1,
    justifyContent: "center",
  },
  toggleText: {
    fontSize: 13,
    fontWeight: "900",
  },
  tabs: {
    gap: 8,
    flexDirection: "row",
    marginBottom: 16,
  },
  tabButton: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    minHeight: 44,
    justifyContent: "center",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "900",
  },
  billRowCard: {
    borderRadius: 18,
    marginBottom: 10,
    padding: 12,
  },
  compactBillRow: {
    paddingVertical: 10,
  },
  billRow: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 62,
  },
  billIcon: {
    alignItems: "center",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    marginRight: 12,
    width: 44,
  },
  billText: {
    flex: 1,
    minWidth: 0,
  },
  billTitle: {
    fontSize: 16,
    fontWeight: "900",
  },
  billMeta: {
    fontSize: 13,
    marginTop: 3,
  },
  billRight: {
    alignItems: "flex-end",
    marginLeft: 8,
    maxWidth: 112,
  },
  billAmount: {
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 5,
  },
  expenseTag: {
    fontSize: 12,
    fontWeight: "900",
    marginTop: 4,
  },
  quickActions: {
    flexDirection: "row",
    gap: 6,
    justifyContent: "flex-end",
    marginTop: 8,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "900",
    textTransform: "capitalize",
  },
  rulePills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 6,
  },
  recurringSummary: {
    borderRadius: 18,
    paddingVertical: 12,
  },
  recurringSummaryTitle: {
    fontSize: 17,
    fontWeight: "900",
  },
  recurringSummaryMeta: {
    fontSize: 14,
    marginTop: 3,
  },
  chipRow: {
    gap: 8,
    paddingBottom: 14,
    paddingRight: 18,
  },
  input: {
    marginBottom: 12,
  },
  sheetLabel: {
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 8,
    marginTop: 6,
  },
  sheetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  switchRow: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: 16,
  },
  switchText: {
    flex: 1,
    marginRight: 12,
  },
  switchTitle: {
    fontSize: 15,
    fontWeight: "900",
  },
  switchMeta: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  sheetActions: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    backgroundColor: "rgba(0,0,0,0.42)",
    flex: 1,
  },
  sheetKeyboard: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    maxHeight: "88%",
    padding: 18,
  },
  sheetHandle: {
    alignSelf: "center",
    backgroundColor: "#C7CEDA",
    borderRadius: 999,
    height: 4,
    marginBottom: 14,
    width: 46,
  },
  sheetHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sheetTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: "900",
    marginRight: 12,
  },
});
