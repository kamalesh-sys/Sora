import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  LayoutAnimation,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  UIManager,
  View,
} from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

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
import type { RootStackParamList } from "../navigation/RootNavigator";
import {
  createExpense,
  deleteExpense,
  getCategories,
  getExpense,
  getExpenses,
  seedDefaultCategories,
  updateExpense,
} from "../services/expenseApi";
import { getCategoryVisual } from "../theme/soraTheme";
import type { CreateExpensePayload, ExpenseCategory, ExpenseVisibility, PaymentMethod } from "../types/api";
import { applySavedCategoryOrder, saveCategoryOrder } from "../utils/categoryOrder";
import { getTodayDate, isValidDate } from "../utils/date";
import { formatDateLabel } from "../utils/format";
import { updateSoraExpenseWidget } from "../widgets/widgetStorage";

type Props = NativeStackScreenProps<RootStackParamList, "ExpenseForm">;

const RECENT_PAYMENT_KEY = "sora_expense_recent_payment_mode";
const RECENT_CATEGORY_KEY = "sora_expense_recent_category_id";
const CATEGORY_DRAG_STEP = 112;

const paymentModes: Array<{ label: string; value: PaymentMethod }> = [
  { label: "UPI", value: "upi" },
  { label: "Cash", value: "cash" },
];

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

if (Platform.OS === "android") {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

function getSmartTitle(category: ExpenseCategory | null, paymentMethod: PaymentMethod) {
  if (category?.name) {
    return category.name;
  }
  return paymentMethod === "upi" ? "UPI expense" : "Expense";
}

function sanitizeAmount(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  const decimal = rest.join("").slice(0, 2);
  return rest.length ? `${whole}.${decimal}` : whole;
}

function normalizePaymentMethod(value?: string | null): PaymentMethod {
  return value === "cash" ? "cash" : "upi";
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function ExpenseFormScreen({ navigation, route }: Props) {
  const { colors } = useDs();
  const { success } = useFeedback();
  const amountRef = useRef<TextInput>(null);
  const expenseId = route.params?.expenseId;
  const isEditing = Boolean(expenseId);

  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("upi");
  const [expenseDate, setExpenseDate] = useState(getTodayDate());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);

  const selectedCategory = useMemo(
    () => categories.find((item) => item.id === category) ?? null,
    [categories, category]
  );
  const cleanAmount = Number(amount);
  const amountError = amountTouched && (!Number.isFinite(cleanAmount) || cleanAmount <= 0) ? "Enter an amount greater than 0." : "";

  const reorderCategories = useCallback((categoryId: number, targetIndex: number) => {
    setCategories((current) => {
      const fromIndex = current.findIndex((item) => item.id === categoryId);
      if (fromIndex < 0 || fromIndex === targetIndex) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(clamp(targetIndex, 0, next.length), 0, moved);
      LayoutAnimation.configureNext({
        duration: 180,
        update: { type: LayoutAnimation.Types.easeInEaseOut },
      });
      void saveCategoryOrder(next);
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    setError("");
    try {
      const [recentPayment, recentCategory] = await Promise.all([
        AsyncStorage.getItem(RECENT_PAYMENT_KEY),
        AsyncStorage.getItem(RECENT_CATEGORY_KEY),
      ]);
      let categoryRows = await getCategories();
      if (!categoryRows.length) {
        categoryRows = await seedDefaultCategories();
      }
      categoryRows = await applySavedCategoryOrder(categoryRows);
      setCategories(categoryRows);

      const recentCategoryId = recentCategory ? Number(recentCategory) : NaN;
      if (Number.isFinite(recentCategoryId) && categoryRows.some((item) => item.id === recentCategoryId)) {
        setCategory(recentCategoryId);
      } else {
        setCategory(categoryRows[0]?.id ?? null);
      }
      setPaymentMethod(normalizePaymentMethod(recentPayment));

      if (expenseId) {
        const expense = await getExpense(expenseId);
        setAmount(expense.amount);
        setCategory(expense.category);
        setPaymentMethod(normalizePaymentMethod(expense.payment_method));
        setExpenseDate(expense.expense_date);
        setTitle(expense.title);
        setNote(expense.note ?? "");
        setDetailsOpen(Boolean(expense.title || expense.note));
      }
    } catch {
      setError("Could not load expense form.");
    } finally {
      setLoading(false);
      setTimeout(() => amountRef.current?.focus(), 120);
    }
  }, [expenseId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setAmountTouched(true);
    if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
      return;
    }
    if (!isValidDate(expenseDate)) {
      setError("Choose a valid date.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const visibility: ExpenseVisibility = "private";
      const payload: CreateExpensePayload = {
        amount: cleanAmount.toFixed(2),
        category,
        expense_date: expenseDate,
        expense_type: "personal",
        household: null,
        note: note.trim(),
        paid_by_user: "me",
        payment_method: paymentMethod,
        title: title.trim() || getSmartTitle(selectedCategory, paymentMethod),
        visibility,
      };

      if (expenseId) {
        await updateExpense(expenseId, payload);
      } else {
        await createExpense(payload);
      }

      await Promise.all([
        AsyncStorage.setItem(RECENT_PAYMENT_KEY, paymentMethod),
        category ? AsyncStorage.setItem(RECENT_CATEGORY_KEY, String(category)) : AsyncStorage.removeItem(RECENT_CATEGORY_KEY),
      ]);
      success();
      void refreshWidgetFromLatestExpense();
      navigation.navigate("Expenses");
    } catch {
      setError("Could not save expense. Check connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    if (!expenseId) {
      return;
    }
    Alert.alert("Delete expense", "This expense will be removed.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setSaving(true);
          setError("");
          try {
            await deleteExpense(expenseId);
            void refreshWidgetFromLatestExpense();
            navigation.navigate("Expenses");
          } catch {
            setError("Could not delete expense.");
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
        <IconButton accessibilityLabel="Close add expense" icon="close" onPress={() => navigation.goBack()} />
        <View style={styles.headerText}>
          <AppText variant="headline">{isEditing ? "Edit expense" : "Add expense"}</AppText>
        </View>
        {isEditing ? <IconButton accessibilityLabel="Delete expense" icon="trash-can-outline" onPress={confirmDelete} tone="danger" /> : <View style={styles.headerSpacer} />}
      </View>

      <ErrorState text={error} />

      {loading ? (
        <ExpenseFormSkeleton />
      ) : (
        <>
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

          <SectionHeader action="Manage" onAction={() => navigation.navigate("Categories")} title="Category" />
          <ReorderableCategoryRail
            categories={categories}
            onManage={() => navigation.navigate("Categories")}
            onReorder={reorderCategories}
            onSelect={setCategory}
            selectedId={category}
          />

          <SectionHeader title="Payment" />
          <AppSegmentedControl accessibilityLabel="Payment method" items={paymentModes} onChange={setPaymentMethod} style={styles.paymentSwitch} value={paymentMethod} />

          <AppCard style={styles.quickDetailsCard}>
            <View style={styles.quickDetailsTop}>
              <View>
                <AppText color="textMuted" variant="caption">Date</AppText>
                <AppText variant="bodyStrong">{formatDateLabel(expenseDate)}</AppText>
              </View>
              <View style={styles.quickActions}>
                <IconButton accessibilityLabel="Pick date" icon="calendar-month-outline" onPress={() => setShowDatePicker(true)} tone="primary" />
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

          <Pressable android_ripple={{ color: colors.press }} onPress={() => setDetailsOpen((current) => !current)} style={styles.detailsToggle}>
            <AppText color="textMuted" variant="label">{detailsOpen ? "Hide details" : "Add label or note"}</AppText>
            <MaterialCommunityIcons name={detailsOpen ? "chevron-up" : "chevron-down"} size={22} color={colors.textMuted} />
          </Pressable>

          {detailsOpen ? (
            <AppCard>
              <FormField label="Label" onChangeText={setTitle} placeholder={getSmartTitle(selectedCategory, paymentMethod)} value={title} />
              <View style={{ height: dsSpace[1.5] }} />
              <FormField
                label="Note"
                inputStyle={styles.noteField}
                multiline
                numberOfLines={3}
                onChangeText={setNote}
                placeholder="Optional"
                value={note}
              />
            </AppCard>
          ) : null}
        </>
      )}

      <BottomActionBar>
        <AppButton block disabled={saving || loading} loading={saving} onPress={save}>
          {isEditing ? "Save changes" : "Save expense"}
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
  onReorder: (categoryId: number, targetIndex: number) => void;
  onSelect: (categoryId: number) => void;
  selectedId: number | null;
}) {
  const [draggingId, setDraggingId] = useState<number | null>(null);

  const startDrag = (categoryId: number) => {
    void Haptics.selectionAsync();
    setDraggingId(categoryId);
  };

  const endDrag = () => {
    setDraggingId(null);
  };

  return (
    <ScrollView
      horizontal
      scrollEnabled={!draggingId}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
    >
      {categories.map((item, index) => {
        const visual = getCategoryVisual(item.name, item.icon, item.color);
        return (
          <DraggableCategoryChip
            category={item}
            dragging={draggingId === item.id}
            icon={visual.icon}
            index={index}
            key={item.id}
            onActivate={() => startDrag(item.id)}
            onDragEnd={endDrag}
            onMoveIndex={(targetIndex) => onReorder(item.id, targetIndex)}
            onSelect={() => {
              if (!draggingId) onSelect(item.id);
            }}
            selected={selectedId === item.id}
            total={categories.length}
          />
        );
      })}
      <CategoryChip icon="plus" label="New" onPress={onManage} style={styles.categoryChip} />
    </ScrollView>
  );
}

function DraggableCategoryChip({
  category,
  dragging,
  icon,
  index,
  onActivate,
  onDragEnd,
  onMoveIndex,
  onSelect,
  selected,
  total,
}: {
  category: ExpenseCategory;
  dragging: boolean;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  index: number;
  onActivate: () => void;
  onDragEnd: () => void;
  onMoveIndex: (targetIndex: number) => void;
  onSelect: () => void;
  selected: boolean;
  total: number;
}) {
  const pan = useRef(new Animated.Value(0)).current;
  const startIndex = useRef(index);
  const lastTargetIndex = useRef(index);
  const wasDragging = useRef(false);

  useEffect(() => {
    if (dragging && !wasDragging.current) {
      startIndex.current = index;
      lastTargetIndex.current = index;
      wasDragging.current = true;
    }
    if (!dragging && wasDragging.current) {
      wasDragging.current = false;
      Animated.spring(pan, {
        friction: 8,
        tension: 160,
        toValue: 0,
        useNativeDriver: true,
      }).start();
    }
  }, [dragging, index, pan]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => dragging && Math.abs(gesture.dx) > 4,
        onPanResponderMove: (_, gesture) => {
          if (!dragging) return;
          pan.setValue(gesture.dx);
          const targetIndex = clamp(startIndex.current + Math.round(gesture.dx / CATEGORY_DRAG_STEP), 0, total - 1);
          if (targetIndex !== lastTargetIndex.current) {
            lastTargetIndex.current = targetIndex;
            onMoveIndex(targetIndex);
          }
        },
        onPanResponderRelease: () => {
          onDragEnd();
        },
        onPanResponderTerminate: () => {
          onDragEnd();
        },
        onShouldBlockNativeResponder: () => true,
      }),
    [dragging, onDragEnd, onMoveIndex, pan, total]
  );

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.draggableChip,
        dragging ? styles.draggingChip : null,
        {
          transform: [
            { translateX: dragging ? pan : 0 },
            { scale: dragging ? 1.04 : 1 },
          ],
        },
      ]}
    >
      <CategoryChip
        active={selected}
        icon={icon}
        label={category.name}
        onLongPress={onActivate}
        onPress={dragging ? undefined : onSelect}
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
  draggableChip: {
    zIndex: 1,
  },
  draggingChip: {
    elevation: 6,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    zIndex: 20,
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
    paddingBottom: dsSpace[1],
    paddingRight: dsSpace[3],
  },
  screenContent: {
    paddingBottom: 112,
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
