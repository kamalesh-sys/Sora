import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import DragList, { type DragListRenderItemInfo } from "react-native-draglist";

import {
  AmountInput,
  AppButton,
  AppCard,
  AppScreen,
  AppSegmentedControl,
  AppText,
  BottomActionBar,
  CategoryChip,
  ErrorState,
  FormField,
  IconButton,
  SectionHeader,
  SkeletonBlock,
  dsSpace,
  useDs,
} from "../design-system";
import { useFeedback } from "../context/FeedbackContext";
import { Translate, useI18n } from "../i18n";
import type { RootStackParamList } from "../navigation/RootNavigator";
import {
  createTransaction,
  deleteTransaction,
  getCategories,
  getExpenses,
  getTransaction,
  seedDefaultCategories,
  updateTransaction,
} from "../services/expenseApi";
import { getCategoryVisual } from "../theme/soraTheme";
import type { CreateTransactionPayload, ExpenseCategory, ExpenseVisibility, PaymentMethod, TransactionType } from "../types/api";
import { applySavedCategoryOrder, saveCategoryOrder } from "../utils/categoryOrder";
import { getTodayDate, isValidDate } from "../utils/date";
import { formatDateLabel } from "../utils/format";
import { updateSoraExpenseWidget } from "../widgets/widgetStorage";

type Props = NativeStackScreenProps<RootStackParamList, "ExpenseForm">;

const RECENT_PAYMENT_KEY = "sora_expense_recent_payment_mode";
const RECENT_CATEGORY_KEY = "sora_expense_recent_category_id";
const CATEGORY_DRAG_DELAY_MS = 220;

const paymentModes: Array<{ label: string; value: PaymentMethod }> = [
  { label: "UPI", value: "upi" },
  { label: "Cash", value: "cash" },
  { label: "Card", value: "card" },
  { label: "Bank", value: "bank" },
];

const transactionTypes: Array<{ icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: TransactionType }> = [
  { icon: "arrow-up-right", label: "Expense", value: "expense" },
  { icon: "arrow-down-left", label: "Income", value: "income" },
];

function recentCategoryKey(transactionType: TransactionType) {
  return transactionType === "expense" ? RECENT_CATEGORY_KEY : `${RECENT_CATEGORY_KEY}_income`;
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromDateInputValue(value: string) {
  if (!isValidDate(value)) {
    return new Date();
  }
  return new Date(`${value}T00:00:00`);
}

function getSmartTitle(category: ExpenseCategory | null, paymentMethod: PaymentMethod, transactionType: TransactionType, t: Translate) {
  if (category?.name) {
    return category.name;
  }
  if (transactionType === "income") return t("Income");
  return t(paymentMethod === "upi" ? "UPI expense" : "Expense");
}

function sanitizeAmount(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  const decimal = rest.join("").slice(0, 2);
  return rest.length ? `${whole}.${decimal}` : whole;
}

function normalizePaymentMethod(value?: string | null): PaymentMethod {
  return value === "cash" || value === "card" || value === "bank" ? value : "upi";
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function ExpenseFormScreen({ navigation, route }: Props) {
  const { colors } = useDs();
  const { success } = useFeedback();
  const { t } = useI18n();
  const amountRef = useRef<TextInput>(null);
  const expenseId = route.params?.expenseId;
  const isEditing = Boolean(expenseId);
  const initialTransactionType = route.params?.transactionType ?? "expense";

  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [transactionType, setTransactionType] = useState<TransactionType>(initialTransactionType);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("upi");
  const [expenseDate, setExpenseDate] = useState(getTodayDate());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);

  const selectedCategory = useMemo(
    () => categories.find((item) => item.id === category) ?? null,
    [categories, category]
  );
  const cleanAmount = Number(amount);
  const amountError = amountTouched && (!Number.isFinite(cleanAmount) || cleanAmount <= 0) ? t("Enter an amount greater than 0.") : "";
  const localizedPaymentModes = useMemo(() => paymentModes.map((item) => ({ ...item, label: t(item.label) })), [t]);

  const reorderCategories = useCallback((fromIndex: number, toIndex: number) => {
    setCategories((current) => {
      if (fromIndex < 0 || fromIndex >= current.length || fromIndex === toIndex) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(clamp(toIndex, 0, next.length), 0, moved);
      void saveCategoryOrder(next, transactionType);
      return next;
    });
  }, [transactionType]);

  const fetchCategories = useCallback(async (type: TransactionType, preferredCategory?: number | null) => {
    let categoryRows = await getCategories(type);
    if (!categoryRows.length) {
      categoryRows = await seedDefaultCategories(type);
    }
    categoryRows = await applySavedCategoryOrder(categoryRows, type);
    setCategories(categoryRows);

    const storedCategory = await AsyncStorage.getItem(recentCategoryKey(type));
    const recentCategoryId = storedCategory ? Number(storedCategory) : NaN;
    const preferred = preferredCategory ?? (Number.isFinite(recentCategoryId) ? recentCategoryId : null);
    setCategory(
      preferred && categoryRows.some((item) => item.id === preferred)
        ? preferred
        : categoryRows[0]?.id ?? null
    );
  }, []);

  const load = useCallback(async () => {
    setError("");
    try {
      const recentPayment = await AsyncStorage.getItem(RECENT_PAYMENT_KEY);
      setPaymentMethod(normalizePaymentMethod(recentPayment));

      if (expenseId) {
        const transaction = await getTransaction(expenseId);
        const type = transaction.transaction_type ?? "expense";
        setTransactionType(type);
        await fetchCategories(type, transaction.category);
        setAmount(transaction.amount);
        setPaymentMethod(normalizePaymentMethod(transaction.payment_method));
        setExpenseDate(transaction.expense_date);
        setTitle(transaction.title);
        setNote(transaction.note ?? "");
        setDetailsOpen(Boolean(transaction.title || transaction.note));
      } else {
        await fetchCategories(initialTransactionType);
      }
    } catch {
      setError(t("Could not load transaction form."));
    } finally {
      setLoading(false);
      setTimeout(() => amountRef.current?.focus(), 120);
    }
  }, [expenseId, fetchCategories, initialTransactionType, t]);

  useEffect(() => {
    load();
  }, [load]);

  const refreshCategories = useCallback(async () => {
    try {
      await fetchCategories(transactionType, category);
    } catch {
      // Keep the current category rail usable when a background refresh fails.
    }
  }, [category, fetchCategories, transactionType]);

  useFocusEffect(
    useCallback(() => {
      if (!loading) {
        void refreshCategories();
      }
    }, [loading, refreshCategories])
  );

  const changeTransactionType = async (nextType: TransactionType) => {
    if (nextType === transactionType || categoryLoading) return;
    setTransactionType(nextType);
    setCategoryLoading(true);
    setError("");
    try {
      await fetchCategories(nextType);
      void Haptics.selectionAsync();
    } catch {
      setError(t("Could not load categories for this transaction type."));
    } finally {
      setCategoryLoading(false);
    }
  };

  const save = async () => {
    setAmountTouched(true);
    if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
      return;
    }
    if (!isValidDate(expenseDate)) {
      setError(t("Choose a valid date."));
      return;
    }

    setSaving(true);
    setError("");
    try {
      const visibility: ExpenseVisibility = "private";
      const payload: CreateTransactionPayload = {
        amount: cleanAmount.toFixed(2),
        category,
        expense_date: expenseDate,
        expense_type: "personal",
        household: null,
        note: note.trim(),
        paid_by_user: "me",
        payment_method: paymentMethod,
        title: title.trim() || getSmartTitle(selectedCategory, paymentMethod, transactionType, t),
        transaction_type: transactionType,
        visibility,
      };

      if (expenseId) {
        await updateTransaction(expenseId, payload);
      } else {
        await createTransaction(payload);
      }

      await Promise.all([
        AsyncStorage.setItem(RECENT_PAYMENT_KEY, paymentMethod),
        category ? AsyncStorage.setItem(recentCategoryKey(transactionType), String(category)) : AsyncStorage.removeItem(recentCategoryKey(transactionType)),
      ]);
      success();
      void refreshWidgetFromLatestExpense();
      navigation.navigate("Expenses");
    } catch {
      setError(t("Could not save transaction. Check connection and try again."));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    if (!expenseId) {
      return;
    }
    Alert.alert(t("Delete transaction"), t("This transaction will be removed."), [
      { text: t("Cancel"), style: "cancel" },
      {
        text: t("Delete"),
        style: "destructive",
        onPress: async () => {
          setSaving(true);
          setError("");
          try {
            await deleteTransaction(expenseId);
            void refreshWidgetFromLatestExpense();
            navigation.navigate("Expenses");
          } catch {
            setError(t("Could not delete transaction."));
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
    }
    if (event.type === "dismissed" || !selectedDate) {
      return;
    }
    setExpenseDate(toDateInputValue(selectedDate));
  };

  const refreshWidgetFromLatestExpense = async () => {
    try {
      const [latestExpense] = await getExpenses({ ordering: "recent", limit: 1 });
      await updateSoraExpenseWidget(latestExpense ?? null);
    } catch {
      await updateSoraExpenseWidget(null);
    }
  };

  return (
    <AppScreen contentStyle={styles.screenContent}>
      <View style={styles.header}>
        <IconButton accessibilityLabel={t("Close add transaction")} icon="close" onPress={() => navigation.goBack()} />
        <View style={styles.headerText}>
          <AppText variant="headline">{t(isEditing ? "Edit transaction" : "Add transaction")}</AppText>
        </View>
        {isEditing ? <IconButton accessibilityLabel={t("Delete transaction")} icon="trash-can-outline" onPress={confirmDelete} tone="danger" /> : <View style={styles.headerSpacer} />}
      </View>

      <ErrorState text={error} />

      {loading ? (
        <ExpenseFormSkeleton />
      ) : (
        <>
          <AppSegmentedControl
            accessibilityLabel={t("Transaction type")}
            items={transactionTypes}
            onChange={(value) => void changeTransactionType(value)}
            style={styles.typeSwitch}
            value={transactionType}
          />

          <AmountInput
            autoFocus
            error={amountError}
            onChangeText={(value) => {
              setAmount(sanitizeAmount(value));
              if (error) setError("");
            }}
            ref={amountRef}
            returnKeyType="done"
            value={amount}
          />

          <SectionHeader action={t("Manage")} onAction={() => navigation.navigate("Categories", { transactionType })} title={t("Category")} />
          {categoryLoading ? (
            <View style={styles.skeletonChipRow}>
              <SkeletonBlock height={44} radius={22} width={112} />
              <SkeletonBlock height={44} radius={22} width={92} />
            </View>
          ) : (
            <ReorderableCategoryRail
              categories={categories}
              onManage={() => navigation.navigate("Categories", { transactionType })}
              onReorder={reorderCategories}
              onSelect={setCategory}
              selectedId={category}
            />
          )}

          <SectionHeader title={t(transactionType === "income" ? "Received via" : "Paid via")} />
          <AppSegmentedControl accessibilityLabel={t("Payment method")} items={localizedPaymentModes} onChange={setPaymentMethod} style={styles.paymentSwitch} value={paymentMethod} />

          <AppCard style={styles.quickDetailsCard}>
            <View style={styles.quickDetailsTop}>
              <View>
                <AppText color="textMuted" variant="caption">{t("Date")}</AppText>
                <AppText variant="bodyStrong">{formatDateLabel(expenseDate)}</AppText>
              </View>
              <View style={styles.quickActions}>
                <IconButton accessibilityLabel={t("Pick date")} icon="calendar-month-outline" onPress={() => setShowDatePicker(true)} tone="primary" />
              </View>
            </View>
            {showDatePicker ? (
              <DateTimePicker
                display={Platform.OS === "ios" ? "spinner" : "default"}
                mode="date"
                onChange={handleDateChange}
                value={fromDateInputValue(expenseDate)}
              />
            ) : null}
          </AppCard>

          <Pressable accessibilityLabel={t(detailsOpen ? "Hide details" : "Add label or note")} accessibilityRole="button" android_ripple={{ color: colors.press }} onPress={() => setDetailsOpen((current) => !current)} style={styles.detailsToggle}>
            <AppText color="textMuted" variant="label">{t(detailsOpen ? "Hide details" : "Add label or note")}</AppText>
            <MaterialCommunityIcons name={detailsOpen ? "chevron-up" : "chevron-down"} size={22} color={colors.textMuted} />
          </Pressable>

          {detailsOpen ? (
            <AppCard>
              <FormField label={t("Label")} onChangeText={setTitle} placeholder={getSmartTitle(selectedCategory, paymentMethod, transactionType, t)} value={title} />
              <View style={{ height: dsSpace[1.5] }} />
              <FormField
                label={t("Note")}
                inputStyle={styles.noteField}
                multiline
                numberOfLines={3}
                onChangeText={setNote}
                placeholder={t("Optional")}
                value={note}
              />
            </AppCard>
          ) : null}
        </>
      )}

      <BottomActionBar>
        <AppButton block disabled={saving || loading || categoryLoading} loading={saving} onPress={save}>
          {t(isEditing ? "Save changes" : transactionType === "income" ? "Add income" : "Add expense")}
        </AppButton>
      </BottomActionBar>
    </AppScreen>
  );
}

function ReorderableCategoryRail({
  categories,
  onManage,
  onReorder,
  onSelect,
  selectedId,
}: {
  categories: ExpenseCategory[];
  onManage: () => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onSelect: (categoryId: number) => void;
  selectedId: number | null;
}) {
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);

  const beginDrag = useCallback(() => {
    if (!draggingRef.current) {
      void Haptics.selectionAsync();
    }
    draggingRef.current = true;
    setDragging(true);
  }, []);

  const endDrag = useCallback(() => {
    if (draggingRef.current) {
      void Haptics.selectionAsync();
    }
    draggingRef.current = false;
    setDragging(false);
  }, []);

  const renderItem = useCallback(
    (info: DragListRenderItemInfo<ExpenseCategory>) => {
      const visual = getCategoryVisual(info.item.name, info.item.icon, info.item.color);
      return (
        <SortableCategoryChip
          category={info.item}
          icon={visual.icon}
          isActive={info.isActive}
          onDragEnd={() => {
            info.onDragEnd();
            endDrag();
          }}
          onDragStart={() => {
            beginDrag();
            info.onDragStart();
          }}
          onSelect={() => {
            if (!dragging) onSelect(info.item.id);
          }}
          selected={selectedId === info.item.id}
        />
      );
    },
    [beginDrag, dragging, endDrag, onSelect, selectedId]
  );

  return (
    <View style={styles.railWrap}>
      <DragList
        bounces={false}
        containerStyle={styles.dragListContainer}
        contentContainerStyle={styles.rail}
        data={categories}
        horizontal
        keyExtractor={(item) => String(item.id)}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={<AddCategoryRailButton disabled={dragging} onPress={onManage} />}
        nestedScrollEnabled
        onDragBegin={beginDrag}
        onDragEnd={endDrag}
        onReordered={onReorder}
        renderItem={renderItem}
        scrollEnabled={!dragging || categories.length > 3}
        showsHorizontalScrollIndicator={false}
      />
    </View>
  );
}

function AddCategoryRailButton({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  const { colors } = useDs();
  const { t } = useI18n();
  return (
    <Pressable
      accessibilityLabel={t("Add category")}
      accessibilityRole="button"
      android_ripple={{ color: colors.press, borderless: true }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={[
        styles.addCategoryButton,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: disabled ? 0.56 : 1,
        },
      ]}
    >
      <MaterialCommunityIcons name="plus" size={22} color={colors.accent} />
    </Pressable>
  );
}

function SortableCategoryChip({
  category,
  icon,
  isActive,
  onDragEnd,
  onDragStart,
  onSelect,
  selected,
}: {
  category: ExpenseCategory;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  isActive: boolean;
  onDragEnd: () => void;
  onDragStart: () => void;
  onSelect: () => void;
  selected: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(scale, {
      friction: 7,
      tension: 180,
      toValue: isActive ? 1.06 : 1,
      useNativeDriver: true,
    }).start();
  }, [isActive, scale]);

  return (
    <Animated.View
      style={[
        styles.draggableChip,
        isActive ? styles.draggingChip : null,
        {
          transform: [{ scale }],
        },
      ]}
    >
      <CategoryChip
        active={selected || isActive}
        delayLongPress={CATEGORY_DRAG_DELAY_MS}
        icon={icon}
        label={category.name}
        onLongPress={onDragStart}
        onPress={isActive ? undefined : onSelect}
        onPressOut={onDragEnd}
        style={styles.categoryChip}
      />
    </Animated.View>
  );
}

function ExpenseFormSkeleton() {
  return (
    <View>
      <SkeletonBlock height={116} />
      <SkeletonBlock height={20} style={styles.skeletonTitle} width="32%" />
      <View style={styles.skeletonChipRow}>
        <SkeletonBlock height={44} radius={22} width={112} />
        <SkeletonBlock height={44} radius={22} width={92} />
        <SkeletonBlock height={44} radius={22} width={104} />
      </View>
      <SkeletonBlock height={20} style={styles.skeletonTitle} width="28%" />
      <SkeletonBlock height={44} radius={22} />
      <SkeletonBlock height={78} style={styles.skeletonTitle} />
    </View>
  );
}

const styles = StyleSheet.create({
  detailsToggle: {
    alignItems: "center",
    flexDirection: "row",
    gap: dsSpace[0.5],
    justifyContent: "center",
    marginBottom: dsSpace[2],
    minHeight: 48,
  },
  dragListContainer: {
    flex: 1,
    minWidth: 0,
  },
  draggableChip: {
    zIndex: 1,
  },
  draggingChip: {
    elevation: 7,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    zIndex: 20,
  },
  addCategoryButton: {
    alignItems: "center",
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    height: 44,
    justifyContent: "center",
    marginLeft: dsSpace[1],
    width: 44,
  },
  categoryChip: {
    justifyContent: "center",
    maxWidth: 128,
    minWidth: 104,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: dsSpace[1],
    marginBottom: dsSpace[2],
  },
  headerSpacer: {
    width: 48,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  noteField: {
    minHeight: 104,
    textAlignVertical: "top",
  },
  paymentSwitch: {
    marginBottom: dsSpace[2],
  },
  quickActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: dsSpace[1],
    justifyContent: "flex-end",
  },
  quickDetailsCard: {
    marginTop: dsSpace[1],
  },
  quickDetailsTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: dsSpace[1],
    justifyContent: "space-between",
  },
  rail: {
    alignItems: "center",
    gap: dsSpace[1],
    paddingRight: dsSpace[1],
  },
  railWrap: {
    alignItems: "center",
    flexDirection: "row",
    gap: dsSpace[1],
    marginBottom: dsSpace[1],
  },
  screenContent: {
    paddingBottom: 112,
  },
  typeSwitch: {
    marginBottom: dsSpace[2],
  },
  skeletonChipRow: {
    flexDirection: "row",
    gap: dsSpace[1],
    marginBottom: dsSpace[2],
  },
  skeletonTitle: {
    marginTop: dsSpace[2],
    marginBottom: dsSpace[1],
  },
});
