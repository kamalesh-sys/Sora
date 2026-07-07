import { useCallback, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import {
  AppButton,
  AppCard,
  AppScreen,
  AppSegmentedControl,
  AppText,
  CategoryChip,
  EmptyState,
  ErrorState,
  FormField,
  IconButton,
  ListRow,
  SkeletonBlock,
  SkeletonList,
  dsRadius,
  dsSpace,
  useDs,
} from "../design-system";
import type { RootStackParamList } from "../navigation/RootNavigator";
import {
  createBudget,
  createRecurringBill,
  getBillCalendar,
  getBudgets,
  getCategories,
  getMonthlySummary,
  getRecurringBills,
  markBillPaid,
  skipBillOccurrence,
  updateBudget,
} from "../services/expenseApi";
import { getCategoryVisual } from "../theme/soraTheme";
import type { BillOccurrence, ExpenseCategory, MonthlyBudget, MonthlySummary, PaymentMethod, RecurringBill } from "../types/api";
import { getCurrentMonth, getTodayDate, isValidDate, isValidMonth } from "../utils/date";
import { formatCurrencyCompact, formatDateLabel, formatMonthLabel, parseAmount } from "../utils/format";

type Props = NativeStackScreenProps<RootStackParamList, "Bills">;
type Tab = "upcoming" | "recurring" | "history";

const tabs: Array<{ label: string; value: Tab }> = [
  { label: "Upcoming", value: "upcoming" },
  { label: "Recurring", value: "recurring" },
  { label: "History", value: "history" },
];

const paymentModes: Array<{ icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: PaymentMethod }> = [
  { icon: "cellphone", label: "UPI", value: "upi" },
  { icon: "cash", label: "Cash", value: "cash" },
  { icon: "credit-card-outline", label: "Card", value: "card" },
  { icon: "bank-outline", label: "Bank", value: "bank" },
];

function daysUntil(value: string) {
  const date = new Date(`${value}T00:00:00`);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((dateStart.getTime() - todayStart.getTime()) / 86400000);
}

function getOccurrenceStatus(occurrence: BillOccurrence): BillOccurrence["status"] {
  if (occurrence.status === "upcoming" && daysUntil(occurrence.due_date) < 0) return "overdue";
  return occurrence.status;
}

function getDueText(occurrence: BillOccurrence) {
  const status = getOccurrenceStatus(occurrence);
  if (status === "paid") return occurrence.paid_at ? `Paid ${formatDateLabel(occurrence.paid_at.slice(0, 10))}` : "Paid";
  if (status === "skipped") return "Skipped";
  const days = daysUntil(occurrence.due_date);
  if (days < 0) return `Overdue by ${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"}`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days <= 7) return `In ${days} days`;
  return formatDateLabel(occurrence.due_date);
}

function toBudgetMonth(month: string) {
  return `${month}-01`;
}

function sanitizeAmount(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  const decimal = rest.join("").slice(0, 2);
  return rest.length ? `${whole}.${decimal}` : whole;
}

export function BillsScreen({}: Props) {
  const { colors } = useDs();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [month, setMonth] = useState(getCurrentMonth());
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [bills, setBills] = useState<RecurringBill[]>([]);
  const [occurrences, setOccurrences] = useState<BillOccurrence[]>([]);
  const [monthlyBudget, setMonthlyBudget] = useState<MonthlyBudget | null>(null);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [billName, setBillName] = useState("");
  const [billAmount, setBillAmount] = useState("");
  const [billDate, setBillDate] = useState(getTodayDate());
  const [billCategory, setBillCategory] = useState<number | null>(null);
  const [billMethod, setBillMethod] = useState<PaymentMethod>("upi");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [budgetNote, setBudgetNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!isValidMonth(month)) {
      setError("Month must use YYYY-MM format.");
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setError("");
    try {
      const [categoryRows, billRows, calendarRows, budgetRows, summary] = await Promise.all([
        getCategories(),
        getRecurringBills(),
        getBillCalendar(month),
        getBudgets(month),
        getMonthlySummary(month),
      ]);
      const budget = budgetRows[0] ?? null;
      setCategories(categoryRows);
      setBills(billRows);
      setOccurrences(calendarRows);
      setMonthlyBudget(budget);
      setMonthlySummary(summary);
      setBudgetAmount(budget?.amount ?? "");
      setBudgetNote(budget?.note ?? "");
      if (!billCategory && categoryRows[0]) setBillCategory(categoryRows[0].id);
    } catch {
      setError("Could not load bills and budget. Pull to retry.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [billCategory, month]);

  useFocusEffect(
    useCallback(() => {
      setLoading(!bills.length && !occurrences.length && !monthlySummary);
      load();
    }, [bills.length, load, monthlySummary, occurrences.length])
  );

  const openOccurrences = useMemo(
    () => occurrences.filter((item) => !["paid", "skipped"].includes(item.status)).sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [occurrences]
  );
  const historyOccurrences = useMemo(
    () => occurrences.filter((item) => ["paid", "skipped", "overdue"].includes(getOccurrenceStatus(item))).sort((a, b) => b.due_date.localeCompare(a.due_date)),
    [occurrences]
  );
  const activeBills = useMemo(() => bills.filter((bill) => bill.is_active), [bills]);
  const dueSoonCount = openOccurrences.filter((item) => daysUntil(item.due_date) <= 7).length;
  const upcomingTotal = openOccurrences.reduce((sum, item) => sum + parseAmount(item.amount), 0);
  const recurringTotal = activeBills.reduce((sum, bill) => sum + parseAmount(bill.amount), 0);
  const spent = parseAmount(monthlySummary?.total_expense);
  const budget = parseAmount(monthlyBudget?.amount ?? monthlySummary?.total_budget);
  const remaining = budget - spent;
  const budgetUsed = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  const rows = tab === "history" ? historyOccurrences : tab === "recurring" ? activeBills : openOccurrences;
  const initialLoading = loading && !occurrences.length && !bills.length && !monthlySummary;

  const refresh = () => {
    setRefreshing(true);
    load();
  };

  const saveBill = async () => {
    const amount = Number(billAmount);
    if (!billName.trim() || !Number.isFinite(amount) || amount <= 0 || !isValidDate(billDate)) {
      setError("Enter bill name, amount and due date.");
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
      setBillDate(getTodayDate());
      setShowAdd(false);
      setTab("recurring");
      await load();
    } catch {
      setError("Could not create recurring bill.");
    } finally {
      setSaving(false);
    }
  };

  const saveBudget = async () => {
    const amount = Number(budgetAmount);
    if (!isValidMonth(month)) {
      setError("Month must use YYYY-MM format.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Budget amount must be greater than 0.");
      return;
    }

    setBudgetSaving(true);
    setError("");
    try {
      const payload = {
        amount: amount.toFixed(2),
        month: toBudgetMonth(month),
        note: budgetNote.trim(),
      };
      if (monthlyBudget) {
        await updateBudget(monthlyBudget.id, payload);
      } else {
        await createBudget(payload);
      }
      setShowBudgetForm(false);
      await load();
    } catch {
      setError("Could not save budget.");
    } finally {
      setBudgetSaving(false);
    }
  };

  const confirmMarkPaid = (occurrence: BillOccurrence) => {
    Alert.alert("Mark bill paid", `Create an expense for ${formatCurrencyCompact(occurrence.amount)}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Mark paid",
        onPress: async () => {
          setSaving(true);
          setError("");
          try {
            await markBillPaid(occurrence.id, true);
            await load();
          } catch {
            setError("Could not mark bill paid.");
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const confirmSkip = (occurrence: BillOccurrence) => {
    Alert.alert("Skip bill", "This occurrence will be skipped.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Skip",
        style: "destructive",
        onPress: async () => {
          setSaving(true);
          setError("");
          try {
            await skipBillOccurrence(occurrence.id);
            await load();
          } catch {
            setError("Could not skip bill.");
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  return (
    <AppScreen bottomNavCurrent="Budget" onRefresh={refresh} refreshing={refreshing}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <AppText variant="title">Bills & Budget</AppText>
        </View>
        <IconButton accessibilityLabel="Add recurring bill" icon={showAdd ? "close" : "plus"} onPress={() => setShowAdd((current) => !current)} tone="primary" />
      </View>

      <ErrorState text={error} />

      {initialLoading ? (
        <BillsSkeleton />
      ) : (
        <>
          <AppCard elevated style={[styles.heroCard, { backgroundColor: colors.bgInverse, borderColor: colors.bgInverse }]}>
            <View style={styles.heroTop}>
              <View>
                <AppText style={{ color: colors.textInverse }} variant="caption">
                  Upcoming load
                </AppText>
                <AppText style={{ color: colors.textInverse }} variant="display">
                  {formatCurrencyCompact(upcomingTotal)}
                </AppText>
              </View>
              <View style={[styles.heroIcon, { backgroundColor: colors.accent }]}>
                <MaterialCommunityIcons name="calendar-clock" size={24} color="#FFFFFF" />
              </View>
            </View>
            <AppText style={{ color: colors.textInverse, opacity: 0.72 }} variant="body">
              {activeBills.length} active recurring bills for {formatMonthLabel(month)}
            </AppText>
          </AppCard>

          <View style={styles.metricGrid}>
            <MetricTile label="Recurring" value={formatCurrencyCompact(recurringTotal)} />
            <MetricTile label="Spent" value={formatCurrencyCompact(spent)} />
            <MetricTile label="Remaining" tone={remaining < 0 ? "danger" : "success"} value={budget > 0 ? formatCurrencyCompact(remaining) : "No budget"} />
          </View>

          <BudgetCard
            amount={budgetAmount}
            budget={budget}
            budgetUsed={budgetUsed}
            note={budgetNote}
            onAmountChange={(value) => setBudgetAmount(sanitizeAmount(value))}
            onEdit={() => setShowBudgetForm((current) => !current)}
            onNoteChange={setBudgetNote}
            onSave={saveBudget}
            remaining={remaining}
            saving={budgetSaving}
            showForm={showBudgetForm || !monthlyBudget}
            spent={spent}
          />

          <AppCard>
            <View style={styles.monthRow}>
              <FormField autoCapitalize="none" label="Month" onChangeText={setMonth} placeholder="YYYY-MM" style={styles.monthInput} value={month} />
              <AppButton compact icon="refresh" onPress={load} style={styles.monthLoadButton} variant="secondary">
                Load
              </AppButton>
            </View>
          </AppCard>

          <AppSegmentedControl accessibilityLabel="Bill view" items={tabs} onChange={setTab} style={styles.segmented} value={tab} />

          {tab === "recurring" ? (
            activeBills.length ? (
              <AppCard style={styles.listCard}>
                {activeBills.map((bill) => <RecurringBillRow bill={bill} key={bill.id} />)}
              </AppCard>
            ) : (
              <EmptyState action="Add bill" body="Rent, electricity, subscriptions and other recurring payments can be tracked here." icon="calendar-refresh-outline" onAction={() => setShowAdd(true)} title="No recurring bills" />
            )
          ) : rows.length ? (
            <AppCard style={styles.listCard}>
              {(rows as BillOccurrence[]).map((occurrence) => (
                <BillOccurrenceRow
                  key={occurrence.id}
                  occurrence={occurrence}
                  onMarkPaid={tab === "upcoming" ? () => confirmMarkPaid(occurrence) : undefined}
                  onSkip={tab === "upcoming" ? () => confirmSkip(occurrence) : undefined}
                />
              ))}
            </AppCard>
          ) : (
            <EmptyState
              action="Add recurring bill"
              body={tab === "history" ? "Paid and skipped bills will appear here." : "Your next recurring bill will appear here when it is due."}
              icon="calendar-check-outline"
              onAction={() => setShowAdd(true)}
              title={tab === "history" ? "No bill history" : "No upcoming bills"}
            />
          )}
        </>
      )}

      <AddBillSheet
        billAmount={billAmount}
        billCategory={billCategory}
        billDate={billDate}
        billMethod={billMethod}
        billName={billName}
        categories={categories}
        onAmountChange={(value) => setBillAmount(sanitizeAmount(value))}
        onCategoryChange={setBillCategory}
        onClose={() => setShowAdd(false)}
        onDateChange={setBillDate}
        onMethodChange={setBillMethod}
        onNameChange={setBillName}
        onSave={saveBill}
        saving={saving}
        visible={showAdd}
      />
    </AppScreen>
  );
}

function MetricTile({ label, tone, value }: { label: string; tone?: "danger" | "success"; value: string }) {
  const { colors } = useDs();
  const color = tone === "danger" ? colors.danger : tone === "success" ? colors.success : colors.text;
  return (
    <AppCard style={styles.metricTile}>
      <AppText color="textMuted" variant="caption">{label}</AppText>
      <AppText numberOfLines={1} style={{ color }} variant="bodyStrong">{value}</AppText>
    </AppCard>
  );
}

function BillsSkeleton() {
  return (
    <>
      <AppCard style={styles.heroCard}>
        <SkeletonBlock height={16} width="34%" />
        <SkeletonBlock height={44} style={styles.skeletonGap} width="58%" />
        <SkeletonBlock height={16} style={styles.skeletonGap} width="74%" />
      </AppCard>
      <View style={styles.metricGrid}>
        {[0, 1, 2].map((item) => (
          <AppCard key={item} style={styles.metricTile}>
            <SkeletonBlock height={14} width="70%" />
            <SkeletonBlock height={20} style={styles.skeletonGap} width="86%" />
          </AppCard>
        ))}
      </View>
      <AppCard>
        <SkeletonBlock height={22} width="48%" />
        <SkeletonBlock height={14} style={styles.skeletonGap} width="32%" />
        <SkeletonBlock height={10} style={styles.skeletonGapLarge} />
      </AppCard>
      <AppCard>
        <View style={styles.monthRow}>
          <View style={styles.monthInput}>
            <SkeletonBlock height={14} width="24%" />
            <SkeletonBlock height={56} style={styles.skeletonGap} />
          </View>
          <SkeletonBlock height={40} radius={20} style={styles.monthLoadButton} width={96} />
        </View>
      </AppCard>
      <SkeletonBlock height={44} radius={22} style={styles.segmented} />
      <SkeletonList rows={4} />
    </>
  );
}

function BudgetCard({
  amount,
  budget,
  budgetUsed,
  note,
  onAmountChange,
  onEdit,
  onNoteChange,
  onSave,
  remaining,
  saving,
  showForm,
  spent,
}: {
  amount: string;
  budget: number;
  budgetUsed: number;
  note: string;
  onAmountChange: (value: string) => void;
  onEdit: () => void;
  onNoteChange: (value: string) => void;
  onSave: () => void;
  remaining: number;
  saving: boolean;
  showForm: boolean;
  spent: number;
}) {
  const { colors } = useDs();
  const hasBudget = budget > 0;
  const tone = remaining < 0 ? colors.danger : colors.success;
  return (
    <AppCard>
      <View style={styles.cardHeader}>
        <View>
          <AppText variant="headline">Monthly budget</AppText>
          <AppText color="textSubtle" variant="caption">
            {hasBudget ? `${budgetUsed}% used` : "Set your spend limit"}
          </AppText>
        </View>
        <AppButton compact onPress={onEdit} variant="secondary">
          {hasBudget ? (showForm ? "Close" : "Edit") : "Set"}
        </AppButton>
      </View>

      {hasBudget ? (
        <>
          <View style={styles.budgetNumbers}>
            <View>
              <AppText color="textMuted" variant="caption">Budget</AppText>
              <AppText variant="headline">{formatCurrencyCompact(budget)}</AppText>
            </View>
            <View style={styles.budgetEnd}>
              <AppText color="textMuted" variant="caption">Remaining</AppText>
              <AppText style={{ color: tone }} variant="headline">{formatCurrencyCompact(remaining)}</AppText>
            </View>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: colors.chipBg }]}>
            <View style={[styles.progressFill, { backgroundColor: tone, width: `${budgetUsed}%` }]} />
          </View>
          <AppText color="textSubtle" style={styles.progressCopy} variant="caption">
            Spent {formatCurrencyCompact(spent)} of {formatCurrencyCompact(budget)}
          </AppText>
        </>
      ) : null}

      {showForm ? (
        <View style={hasBudget ? styles.budgetForm : undefined}>
          <FormField keyboardType="decimal-pad" label="Budget amount" onChangeText={onAmountChange} placeholder="0" style={styles.fieldGap} value={amount} />
          <FormField label="Note optional" onChangeText={onNoteChange} placeholder="Monthly spending target" style={styles.fieldGap} value={note} />
          <AppButton block disabled={saving} loading={saving} onPress={onSave}>
            Save budget
          </AppButton>
        </View>
      ) : null}
    </AppCard>
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
  onSave,
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
  onSave: () => void;
  saving: boolean;
  visible: boolean;
}) {
  const { colors } = useDs();
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.sheetRoot}>
        <Pressable accessibilityLabel="Close add bill" style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheetKeyboard}>
          <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.borderStrong }]} />
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.sheetHeader}>
                <AppText variant="headline">Add recurring bill</AppText>
                <IconButton accessibilityLabel="Close add recurring bill" icon="close" onPress={onClose} />
              </View>
              <FormField label="Bill name" onChangeText={onNameChange} placeholder="Electricity, rent, internet" style={styles.fieldGap} value={billName} />
              <FormField keyboardType="decimal-pad" label="Amount" onChangeText={onAmountChange} placeholder="0" style={styles.fieldGap} value={billAmount} />
              <FormField autoCapitalize="none" label="Next due date" onChangeText={onDateChange} placeholder="YYYY-MM-DD" style={styles.fieldGap} value={billDate} />

              <AppText color="textMuted" style={styles.filterLabel} variant="label">Category</AppText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
                <CategoryChip active={billCategory === null} label="None" onPress={() => onCategoryChange(null)} />
                {categories.map((item) => {
                  const visual = getCategoryVisual(item.name, item.icon, item.color);
                  return (
                    <CategoryChip
                      active={billCategory === item.id}
                      icon={visual.icon}
                      key={item.id}
                      label={item.name}
                      onPress={() => onCategoryChange(item.id)}
                    />
                  );
                })}
              </ScrollView>

              <AppText color="textMuted" style={styles.filterLabel} variant="label">Payment</AppText>
              <View style={styles.paymentGrid}>
                {paymentModes.map((item) => (
                  <CategoryChip active={billMethod === item.value} icon={item.icon} key={item.value} label={item.label} onPress={() => onMethodChange(item.value)} />
                ))}
              </View>

              <AppButton block disabled={saving} loading={saving} onPress={onSave}>Save bill</AppButton>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function BillOccurrenceRow({
  occurrence,
  onMarkPaid,
  onSkip,
}: {
  occurrence: BillOccurrence;
  onMarkPaid?: () => void;
  onSkip?: () => void;
}) {
  const { colors } = useDs();
  const bill = occurrence.recurring_bill_detail;
  const status = getOccurrenceStatus(occurrence);
  const visual = getCategoryVisual(bill?.category_detail?.name, bill?.category_detail?.icon, bill?.category_detail?.color);
  const tone = status === "overdue" ? colors.danger : status === "paid" ? colors.success : status === "skipped" ? colors.textSubtle : colors.accent;

  return (
    <View style={styles.billBlock}>
      <ListRow
        amount={formatCurrencyCompact(occurrence.amount)}
        description={`${getDueText(occurrence)} | ${bill?.payment_method?.toUpperCase() ?? "UPI"}`}
        icon={visual.icon}
        iconColor={tone}
        rightLabel={status}
        title={bill?.name ?? "Bill"}
      />
      {onMarkPaid ? (
        <View style={styles.rowActions}>
          <AppButton compact onPress={onMarkPaid} variant="secondary">Paid</AppButton>
          {onSkip ? <AppButton compact onPress={onSkip} variant="tertiary">Skip</AppButton> : null}
        </View>
      ) : null}
    </View>
  );
}

function RecurringBillRow({ bill }: { bill: RecurringBill }) {
  const visual = getCategoryVisual(bill.category_detail?.name, bill.category_detail?.icon, bill.category_detail?.color);
  return (
    <ListRow
      amount={formatCurrencyCompact(bill.amount)}
      description={`${bill.frequency} | Next ${formatDateLabel(bill.next_due_date)}`}
      icon={visual.icon}
      iconColor={visual.color}
      title={bill.name}
    />
  );
}

const styles = StyleSheet.create({
  billBlock: {
    marginBottom: dsSpace[1],
  },
  budgetEnd: {
    alignItems: "flex-end",
  },
  budgetForm: {
    marginTop: dsSpace[2],
  },
  budgetNumbers: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: dsSpace[2],
  },
  cardHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  fieldGap: {
    marginBottom: dsSpace[1.5],
  },
  filterLabel: {
    marginBottom: dsSpace[1],
    marginTop: dsSpace[1],
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
  heroCard: {
    paddingVertical: dsSpace[3],
  },
  heroIcon: {
    alignItems: "center",
    borderRadius: dsRadius.pill,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  heroTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: dsSpace[1],
  },
  listCard: {
    paddingVertical: 0,
  },
  metricGrid: {
    flexDirection: "row",
    gap: dsSpace[1],
    marginBottom: dsSpace[2],
  },
  metricTile: {
    flex: 1,
    marginBottom: 0,
    minHeight: 82,
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
  paymentGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: dsSpace[1],
    marginBottom: dsSpace[2],
  },
  progressCopy: {
    marginTop: dsSpace[1],
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
  rail: {
    gap: dsSpace[1],
    paddingBottom: dsSpace[1.5],
    paddingRight: dsSpace[3],
  },
  rowActions: {
    flexDirection: "row",
    gap: dsSpace[1],
    justifyContent: "flex-end",
    marginBottom: dsSpace[1],
    marginTop: dsSpace[0.5],
  },
  segmented: {
    marginBottom: dsSpace[2],
  },
  skeletonGap: {
    marginTop: dsSpace[1],
  },
  skeletonGapLarge: {
    marginTop: dsSpace[2],
  },
  sheet: {
    borderTopLeftRadius: dsRadius.xl,
    borderTopRightRadius: dsRadius.xl,
    maxHeight: "86%",
    padding: dsSpace[2],
    paddingBottom: dsSpace[3],
    width: "100%",
  },
  sheetHandle: {
    alignSelf: "center",
    borderRadius: dsRadius.pill,
    height: 4,
    marginBottom: dsSpace[2],
    width: 42,
  },
  sheetHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: dsSpace[2],
  },
  sheetKeyboard: {
    justifyContent: "flex-end",
    width: "100%",
  },
  sheetRoot: {
    backgroundColor: "rgba(10,11,13,0.42)",
    flex: 1,
    justifyContent: "flex-end",
  },
});
