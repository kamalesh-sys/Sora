import { useCallback, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import {
  AppBottomSheet,
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
import { useAppSettings } from "../context/AppSettingsContext";
import { Translate, useI18n } from "../i18n";
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
  updateRecurringBill,
  updateBudget,
} from "../services/expenseApi";
import { getCategoryVisual } from "../theme/soraTheme";
import type { BillOccurrence, ExpenseCategory, MonthlyBudget, MonthlySummary, PaymentMethod, RecurringBill } from "../types/api";
import { getCurrentMonth, getTodayDate, isValidDate, isValidMonth } from "../utils/date";
import { formatCurrencyCompact, formatDateLabel, formatMonthLabel, formatPaymentMethod, parseAmount } from "../utils/format";

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

function getDueText(occurrence: BillOccurrence, t: Translate) {
  const status = getOccurrenceStatus(occurrence);
  if (status === "paid") return occurrence.paid_at ? t("Paid {date}", { date: formatDateLabel(occurrence.paid_at.slice(0, 10)) }) : t("Paid");
  if (status === "skipped") return t("Skipped");
  const days = daysUntil(occurrence.due_date);
  if (days < 0) return t(Math.abs(days) === 1 ? "Overdue by {count} day" : "Overdue by {count} days", { count: Math.abs(days) });
  if (days === 0) return t("Due today");
  if (days === 1) return t("Due tomorrow");
  if (days <= 7) return t("In {count} days", { count: days });
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
  const { themeMode } = useAppSettings();
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [month, setMonth] = useState(getCurrentMonth());
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [bills, setBills] = useState<RecurringBill[]>([]);
  const [occurrences, setOccurrences] = useState<BillOccurrence[]>([]);
  const [monthlyBudget, setMonthlyBudget] = useState<MonthlyBudget | null>(null);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [editingBill, setEditingBill] = useState<RecurringBill | null>(null);
  const [selectedOccurrence, setSelectedOccurrence] = useState<BillOccurrence | null>(null);
  const [billName, setBillName] = useState("");
  const [billAmount, setBillAmount] = useState("");
  const [billDate, setBillDate] = useState(getTodayDate());
  const [billCategory, setBillCategory] = useState<number | null>(null);
  const [billMethod, setBillMethod] = useState<PaymentMethod>("upi");
  const [billNote, setBillNote] = useState("");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [budgetNote, setBudgetNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!isValidMonth(month)) {
      setError(t("Month must use YYYY-MM format."));
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
      setError(t("Could not load bills and budget. Pull to retry."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [billCategory, month, t]);

  useFocusEffect(
    useCallback(() => {
      setLoading(!bills.length && !occurrences.length && !monthlySummary);
      load();
    }, [bills.length, load, monthlySummary, occurrences.length])
  );

  const openOccurrences = useMemo(
    () =>
      occurrences
        .filter((item) => item.recurring_bill_detail?.is_active !== false && !["paid", "skipped"].includes(item.status))
        .sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [occurrences]
  );
  const historyOccurrences = useMemo(
    () =>
      occurrences
        .filter((item) => {
          const status = getOccurrenceStatus(item);
          if (["paid", "skipped"].includes(status)) return true;
          return status === "overdue" && item.recurring_bill_detail?.is_active !== false;
        })
        .sort((a, b) => b.due_date.localeCompare(a.due_date)),
    [occurrences]
  );
  const activeBills = useMemo(() => bills.filter((bill) => bill.is_active), [bills]);
  const upcomingTotal = openOccurrences.reduce((sum, item) => sum + parseAmount(item.amount), 0);
  const recurringTotal = activeBills.reduce((sum, bill) => sum + parseAmount(bill.amount), 0);
  const spent = parseAmount(monthlySummary?.total_expense);
  const budget = parseAmount(monthlyBudget?.amount ?? monthlySummary?.total_budget);
  const remaining = budget - spent;
  const budgetUsed = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  const rows = tab === "history" ? historyOccurrences : tab === "recurring" ? activeBills : openOccurrences;
  const initialLoading = loading && !occurrences.length && !bills.length && !monthlySummary;
  const heroBackground = themeMode === "dark" ? colors.accent : colors.bgInverse;
  const heroTextColor = "#FFFFFF";
  const heroMutedColor = "rgba(255,255,255,0.72)";
  const heroIconBackground = themeMode === "dark" ? "#0A0B0D" : colors.accent;
  const localizedTabs = useMemo(() => tabs.map((item) => ({ ...item, label: t(item.label) })), [t]);

  const resetBillForm = useCallback(() => {
    setEditingBill(null);
    setBillName("");
    setBillAmount("");
    setBillDate(getTodayDate());
    setBillCategory(categories[0]?.id ?? null);
    setBillMethod("upi");
    setBillNote("");
    setError("");
  }, [categories]);

  const openAddBill = () => {
    resetBillForm();
    setShowAdd(true);
  };

  const openEditBill = (bill: RecurringBill) => {
    setSelectedOccurrence(null);
    setEditingBill(bill);
    setBillName(bill.name);
    setBillAmount(bill.amount);
    setBillDate(bill.next_due_date);
    setBillCategory(bill.category);
    setBillMethod(bill.payment_method);
    setBillNote(bill.note ?? "");
    setError("");
    setShowAdd(true);
  };

  const refresh = () => {
    setRefreshing(true);
    load();
  };

  const saveBill = async () => {
    const amount = Number(billAmount);
    if (!billName.trim() || !Number.isFinite(amount) || amount <= 0 || !isValidDate(billDate)) {
      setError(t("Enter bill name, amount and due date."));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        amount: amount.toFixed(2),
        category: billCategory,
        frequency: "monthly",
        name: billName.trim(),
        next_due_date: billDate,
        note: billNote.trim(),
        payment_method: billMethod,
      } as const;
      if (editingBill) {
        await updateRecurringBill(editingBill.id, payload);
      } else {
        await createRecurringBill(payload);
      }
      resetBillForm();
      setShowAdd(false);
      setTab("recurring");
      await load();
    } catch {
      setError(t(editingBill ? "Could not update recurring bill." : "Could not create recurring bill."));
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteRecurring = (bill: RecurringBill) => {
    Alert.alert(t("Remove recurring bill"), t("{name} will be removed from recurring payments.", { name: bill.name }), [
      { text: t("Cancel"), style: "cancel" },
      {
        text: t("Remove"),
        style: "destructive",
        onPress: async () => {
          setSaving(true);
          setError("");
          try {
            await updateRecurringBill(bill.id, { is_active: false });
            if (editingBill?.id === bill.id) {
              setShowAdd(false);
              setEditingBill(null);
            }
            if (selectedOccurrence?.recurring_bill === bill.id) {
              setSelectedOccurrence(null);
            }
            await load();
          } catch {
            setError(t("Could not remove recurring bill."));
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const saveBudget = async () => {
    const amount = Number(budgetAmount);
    if (!isValidMonth(month)) {
      setError(t("Month must use YYYY-MM format."));
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError(t("Budget amount must be greater than 0."));
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
      setError(t("Could not save budget."));
    } finally {
      setBudgetSaving(false);
    }
  };

  const confirmMarkPaid = (occurrence: BillOccurrence) => {
    Alert.alert(t("Mark bill paid"), t("Create an expense for {amount}?", { amount: formatCurrencyCompact(occurrence.amount) }), [
      { text: t("Cancel"), style: "cancel" },
      {
        text: t("Mark paid"),
        onPress: async () => {
          setSaving(true);
          setError("");
          try {
            await markBillPaid(occurrence.id, true);
            await load();
          } catch {
            setError(t("Could not mark bill paid."));
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const confirmSkip = (occurrence: BillOccurrence) => {
    Alert.alert(t("Skip bill"), t("This occurrence will be skipped."), [
      { text: t("Cancel"), style: "cancel" },
      {
        text: t("Skip"),
        style: "destructive",
        onPress: async () => {
          setSaving(true);
          setError("");
          try {
            await skipBillOccurrence(occurrence.id);
            await load();
          } catch {
            setError(t("Could not skip bill."));
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
          <AppText variant="title">{t("Bills & Budget")}</AppText>
        </View>
        <IconButton accessibilityLabel={t("Add recurring bill")} icon="plus" onPress={openAddBill} tone="primary" />
      </View>

      <ErrorState text={error} />

      {initialLoading ? (
        <BillsSkeleton />
      ) : (
        <>
          <AppCard elevated style={[styles.heroCard, { backgroundColor: heroBackground, borderColor: heroBackground }]}>
            <View style={styles.heroTop}>
              <View>
                <AppText style={{ color: heroMutedColor }} variant="caption">
                  {t("Upcoming load")}
                </AppText>
                <AppText style={{ color: heroTextColor }} variant="display">
                  {formatCurrencyCompact(upcomingTotal)}
                </AppText>
              </View>
              <View style={[styles.heroIcon, { backgroundColor: heroIconBackground }]}>
                <MaterialCommunityIcons name="calendar-clock" size={24} color="#FFFFFF" />
              </View>
            </View>
            <AppText style={{ color: heroMutedColor }} variant="body">
              {t(activeBills.length === 1 ? "{count} active recurring bill for {month}" : "{count} active recurring bills for {month}", {
                count: activeBills.length,
                month: formatMonthLabel(month),
              })}
            </AppText>
          </AppCard>

          <View style={styles.metricGrid}>
            <MetricTile label={t("Recurring")} value={formatCurrencyCompact(recurringTotal)} />
            <MetricTile label={t("Spent")} value={formatCurrencyCompact(spent)} />
            <MetricTile label={t("Remaining")} tone={remaining < 0 ? "danger" : "success"} value={budget > 0 ? formatCurrencyCompact(remaining) : t("No budget")} />
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
              <FormField autoCapitalize="none" label={t("Month")} onChangeText={setMonth} placeholder="YYYY-MM" style={styles.monthInput} value={month} />
              <AppButton compact icon="refresh" onPress={load} style={styles.monthLoadButton} variant="secondary">
                {t("Load")}
              </AppButton>
            </View>
          </AppCard>

          <AppSegmentedControl accessibilityLabel={t("Bill view")} items={localizedTabs} onChange={setTab} style={styles.segmented} value={tab} />

          {tab === "recurring" ? (
            activeBills.length ? (
              <AppCard style={styles.listCard}>
                {activeBills.map((bill) => <RecurringBillRow bill={bill} key={bill.id} onPress={() => openEditBill(bill)} />)}
              </AppCard>
            ) : (
              <EmptyState action={t("Add bill")} body={t("Rent, electricity, subscriptions and other recurring payments can be tracked here.")} icon="calendar-refresh-outline" onAction={openAddBill} title={t("No recurring bills")} />
            )
          ) : rows.length ? (
            <AppCard style={styles.listCard}>
              {(rows as BillOccurrence[]).map((occurrence) => (
                <BillOccurrenceRow
                  key={occurrence.id}
                  occurrence={occurrence}
                  onMarkPaid={tab === "upcoming" ? () => confirmMarkPaid(occurrence) : undefined}
                  onOpen={() => setSelectedOccurrence(occurrence)}
                  onSkip={tab === "upcoming" ? () => confirmSkip(occurrence) : undefined}
                />
              ))}
            </AppCard>
          ) : (
            <EmptyState
              action={t("Add recurring bill")}
              body={t(tab === "history" ? "Paid and skipped bills will appear here." : "Your next recurring bill will appear here when it is due.")}
              icon="calendar-check-outline"
              onAction={openAddBill}
              title={t(tab === "history" ? "No bill history" : "No upcoming bills")}
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
        billNote={billNote}
        categories={categories}
        editingBill={editingBill}
        onAmountChange={(value) => setBillAmount(sanitizeAmount(value))}
        onCategoryChange={setBillCategory}
        onClose={() => {
          setShowAdd(false);
          setEditingBill(null);
        }}
        onDateChange={setBillDate}
        onMethodChange={setBillMethod}
        onNameChange={setBillName}
        onNoteChange={setBillNote}
        onRemove={editingBill ? () => confirmDeleteRecurring(editingBill) : undefined}
        onSave={saveBill}
        saving={saving}
        visible={showAdd}
      />
      <OccurrenceDetailSheet
        occurrence={selectedOccurrence}
        onClose={() => setSelectedOccurrence(null)}
        onEditRecurring={(bill) => openEditBill(bill)}
        onMarkPaid={confirmMarkPaid}
        onRemoveRecurring={confirmDeleteRecurring}
        onSkip={confirmSkip}
        saving={saving}
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
  const { t } = useI18n();
  const hasBudget = budget > 0;
  const tone = remaining < 0 ? colors.danger : colors.success;
  return (
    <AppCard>
      <View style={styles.cardHeader}>
        <View>
          <AppText variant="headline">{t("Monthly budget")}</AppText>
          <AppText color="textSubtle" variant="caption">
            {hasBudget ? t("{percent}% used", { percent: budgetUsed }) : t("Set your spend limit")}
          </AppText>
        </View>
        <AppButton compact onPress={onEdit} variant="secondary">
          {t(hasBudget ? (showForm ? "Close" : "Edit") : "Set")}
        </AppButton>
      </View>

      {hasBudget ? (
        <>
          <View style={styles.budgetNumbers}>
            <View>
              <AppText color="textMuted" variant="caption">{t("Budget")}</AppText>
              <AppText variant="headline">{formatCurrencyCompact(budget)}</AppText>
            </View>
            <View style={styles.budgetEnd}>
              <AppText color="textMuted" variant="caption">{t("Remaining")}</AppText>
              <AppText style={{ color: tone }} variant="headline">{formatCurrencyCompact(remaining)}</AppText>
            </View>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: colors.chipBg }]}>
            <View style={[styles.progressFill, { backgroundColor: tone, width: `${budgetUsed}%` }]} />
          </View>
          <AppText color="textSubtle" style={styles.progressCopy} variant="caption">
            {t("Spent {spent} of {budget}", { budget: formatCurrencyCompact(budget), spent: formatCurrencyCompact(spent) })}
          </AppText>
        </>
      ) : null}

      {showForm ? (
        <View style={hasBudget ? styles.budgetForm : undefined}>
          <FormField keyboardType="decimal-pad" label={t("Budget amount")} onChangeText={onAmountChange} placeholder="0" style={styles.fieldGap} value={amount} />
          <FormField label={t("Note optional")} onChangeText={onNoteChange} placeholder={t("Monthly spending target")} style={styles.fieldGap} value={note} />
          <AppButton block disabled={saving} loading={saving} onPress={onSave}>
            {t("Save budget")}
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
  billNote,
  categories,
  editingBill,
  onAmountChange,
  onCategoryChange,
  onClose,
  onDateChange,
  onMethodChange,
  onNameChange,
  onNoteChange,
  onRemove,
  onSave,
  saving,
  visible,
}: {
  billAmount: string;
  billCategory: number | null;
  billDate: string;
  billMethod: PaymentMethod;
  billName: string;
  billNote: string;
  categories: ExpenseCategory[];
  editingBill: RecurringBill | null;
  onAmountChange: (value: string) => void;
  onCategoryChange: (value: number | null) => void;
  onClose: () => void;
  onDateChange: (value: string) => void;
  onMethodChange: (value: PaymentMethod) => void;
  onNameChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onRemove?: () => void;
  onSave: () => void;
  saving: boolean;
  visible: boolean;
}) {
  const { colors } = useDs();
  const { t } = useI18n();
  return (
    <AppBottomSheet
      footer={
        <View style={styles.sheetFooterActions}>
          <AppButton block disabled={saving} loading={saving} onPress={onSave}>
            {t(editingBill ? "Save changes" : "Save bill")}
          </AppButton>
          {editingBill && onRemove ? (
            <AppButton block disabled={saving} icon="trash-can-outline" onPress={onRemove} variant="danger">
              {t("Remove recurring bill")}
            </AppButton>
          ) : null}
        </View>
      }
      maxHeight="92%"
      onClose={onClose}
      title={t(editingBill ? "Edit recurring bill" : "Add recurring bill")}
      visible={visible}
    >
      <View style={styles.billEditorHero}>
        <View style={[styles.billEditorIcon, { backgroundColor: colors.accent }]}>
          <MaterialCommunityIcons name="calendar-refresh-outline" size={24} color="#FFFFFF" />
        </View>
        <View style={styles.billEditorText}>
          <AppText variant="bodyStrong">{billName || t("Recurring payment")}</AppText>
          <AppText color="textMuted" numberOfLines={1} variant="caption">
            {t(editingBill ? "Update amount, category or next due date." : "Monthly bills, subscriptions and repeat payments.")}
          </AppText>
        </View>
      </View>

      <FormField label={t("Bill name")} onChangeText={onNameChange} placeholder={t("Electricity, rent, internet")} style={styles.fieldGap} value={billName} />
      <FormField keyboardType="decimal-pad" label={t("Amount")} onChangeText={onAmountChange} placeholder="0" style={styles.fieldGap} value={billAmount} />
      <FormField autoCapitalize="none" label={t("Next due date")} onChangeText={onDateChange} placeholder="YYYY-MM-DD" style={styles.fieldGap} value={billDate} />

      <AppText color="textMuted" style={styles.filterLabel} variant="label">{t("Category")}</AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
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

      <AppText color="textMuted" style={styles.filterLabel} variant="label">{t("Payment")}</AppText>
      <View style={styles.paymentGrid}>
        {paymentModes.map((item) => (
          <CategoryChip active={billMethod === item.value} icon={item.icon} key={item.value} label={t(item.label)} onPress={() => onMethodChange(item.value)} />
        ))}
      </View>

      <FormField label={t("Note optional")} onChangeText={onNoteChange} placeholder={t("Plan, account or reminder")} style={styles.fieldGap} value={billNote} />
    </AppBottomSheet>
  );
}

function BillOccurrenceRow({
  occurrence,
  onMarkPaid,
  onOpen,
  onSkip,
}: {
  occurrence: BillOccurrence;
  onMarkPaid?: () => void;
  onOpen: () => void;
  onSkip?: () => void;
}) {
  const { colors } = useDs();
  const { t } = useI18n();
  const bill = occurrence.recurring_bill_detail;
  const status = getOccurrenceStatus(occurrence);
  const visual = getCategoryVisual(bill?.category_detail?.name, bill?.category_detail?.icon, bill?.category_detail?.color);
  const tone = status === "overdue" ? colors.danger : status === "paid" ? colors.success : status === "skipped" ? colors.textSubtle : colors.accent;

  return (
    <View style={styles.billBlock}>
      <ListRow
        amount={formatCurrencyCompact(occurrence.amount)}
        description={`${getDueText(occurrence, t)} | ${bill?.payment_method ? formatPaymentMethod(bill.payment_method) : "UPI"}`}
        icon={visual.icon}
        iconColor={tone}
        onPress={onOpen}
        rightLabel={t(status)}
        title={bill?.name ?? t("Bill")}
      />
      {onMarkPaid ? (
        <View style={styles.rowActions}>
          <AppButton compact onPress={onMarkPaid} variant="secondary">{t("Paid")}</AppButton>
          {onSkip ? <AppButton compact onPress={onSkip} variant="tertiary">{t("Skip")}</AppButton> : null}
        </View>
      ) : null}
    </View>
  );
}

function RecurringBillRow({ bill, onPress }: { bill: RecurringBill; onPress: () => void }) {
  const visual = getCategoryVisual(bill.category_detail?.name, bill.category_detail?.icon, bill.category_detail?.color);
  const { t } = useI18n();
  return (
    <ListRow
      amount={formatCurrencyCompact(bill.amount)}
      description={`${t(bill.frequency)} | ${t("Next {date}", { date: formatDateLabel(bill.next_due_date) })}`}
      icon={visual.icon}
      iconColor={visual.color}
      onPress={onPress}
      rightLabel={t("Edit")}
      title={bill.name}
    />
  );
}

function OccurrenceDetailSheet({
  occurrence,
  onClose,
  onEditRecurring,
  onMarkPaid,
  onRemoveRecurring,
  onSkip,
  saving,
}: {
  occurrence: BillOccurrence | null;
  onClose: () => void;
  onEditRecurring: (bill: RecurringBill) => void;
  onMarkPaid: (occurrence: BillOccurrence) => void;
  onRemoveRecurring: (bill: RecurringBill) => void;
  onSkip: (occurrence: BillOccurrence) => void;
  saving: boolean;
}) {
  const { colors } = useDs();
  const { t } = useI18n();
  if (!occurrence) return null;

  const bill = occurrence.recurring_bill_detail;
  const status = getOccurrenceStatus(occurrence);
  const visual = getCategoryVisual(bill?.category_detail?.name, bill?.category_detail?.icon, bill?.category_detail?.color);
  const tone = status === "overdue" ? colors.danger : status === "paid" ? colors.success : status === "skipped" ? colors.textSubtle : colors.accent;
  const canResolve = status === "upcoming" || status === "overdue";

  return (
    <AppBottomSheet maxHeight="86%" onClose={onClose} title={t("Bill details")} visible={Boolean(occurrence)}>
      <View style={styles.occurrenceHero}>
        <View style={[styles.occurrenceIcon, { backgroundColor: `${tone}18` }]}>
          <MaterialCommunityIcons name={visual.icon} size={28} color={tone} />
        </View>
        <View style={styles.occurrenceHeroText}>
          <AppText variant="headline">{bill?.name ?? t("Recurring bill")}</AppText>
          <AppText color="textMuted" variant="caption">
            {getDueText(occurrence, t)}
          </AppText>
        </View>
      </View>

      <View style={styles.detailGrid}>
        <DetailTile label={t("Amount")} value={formatCurrencyCompact(occurrence.amount)} />
        <DetailTile label={t("Payment")} value={bill?.payment_method ? formatPaymentMethod(bill.payment_method) : "UPI"} />
        <DetailTile label={t("Due date")} value={formatDateLabel(occurrence.due_date)} />
        <DetailTile label={t("Status")} tone={tone} value={t(status)} />
      </View>

      {canResolve ? (
        <View style={styles.sheetActionRow}>
          <AppButton disabled={saving} icon="check-circle-outline" onPress={() => onMarkPaid(occurrence)} style={styles.sheetActionButton} variant="secondary">
            {t("Mark paid")}
          </AppButton>
          <AppButton disabled={saving} icon="calendar-remove-outline" onPress={() => onSkip(occurrence)} style={styles.sheetActionButton} variant="tertiary">
            {t("Skip")}
          </AppButton>
        </View>
      ) : null}

      {bill ? (
        <View style={styles.sheetFooterActions}>
          <AppButton block icon="pencil-outline" onPress={() => onEditRecurring(bill)} variant="secondary">
            {t("Edit recurring payment")}
          </AppButton>
          <AppButton block disabled={saving} icon="trash-can-outline" onPress={() => onRemoveRecurring(bill)} variant="danger">
            {t("Remove recurring payment")}
          </AppButton>
        </View>
      ) : null}
    </AppBottomSheet>
  );
}

function DetailTile({ label, tone, value }: { label: string; tone?: string; value: string }) {
  return (
    <AppCard style={styles.detailTile}>
      <AppText color="textMuted" variant="caption">{label}</AppText>
      <AppText numberOfLines={1} style={tone ? { color: tone, textTransform: "capitalize" } : undefined} variant="bodyStrong">
        {value}
      </AppText>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  billBlock: {
    marginBottom: dsSpace[1],
  },
  billEditorHero: {
    alignItems: "center",
    flexDirection: "row",
    gap: dsSpace[1.5],
    marginBottom: dsSpace[2],
  },
  billEditorIcon: {
    alignItems: "center",
    borderRadius: dsRadius.pill,
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  billEditorText: {
    flex: 1,
    minWidth: 0,
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
  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: dsSpace[1],
    marginBottom: dsSpace[1],
  },
  detailTile: {
    flexBasis: "47%",
    flexGrow: 1,
    marginBottom: 0,
    minHeight: 74,
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
  occurrenceHero: {
    alignItems: "center",
    flexDirection: "row",
    gap: dsSpace[1.5],
    marginBottom: dsSpace[2],
  },
  occurrenceHeroText: {
    flex: 1,
    minWidth: 0,
  },
  occurrenceIcon: {
    alignItems: "center",
    borderRadius: dsRadius.pill,
    height: 60,
    justifyContent: "center",
    width: 60,
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
  sheetActionButton: {
    flex: 1,
  },
  sheetActionRow: {
    flexDirection: "row",
    gap: dsSpace[1],
    marginBottom: dsSpace[1.5],
  },
  sheetFooterActions: {
    gap: dsSpace[1],
  },
  skeletonGap: {
    marginTop: dsSpace[1],
  },
  skeletonGapLarge: {
    marginTop: dsSpace[2],
  },
});
