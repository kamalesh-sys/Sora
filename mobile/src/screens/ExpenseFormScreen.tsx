import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, TextInput as NativeTextInput, View } from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Text, TextInput } from "react-native-paper";

import { AppButton } from "../components/AppLayout";
import { SoraCard, SoraChip, SoraError, SoraHeader, SoraScreen } from "../components/SoraUI";
import { useAppSettings } from "../context/AppSettingsContext";
import type { RootStackParamList } from "../navigation/RootNavigator";
import {
  createExpense,
  deleteExpense,
  getCategories,
  getExpense,
  getExpenses,
  getHouseholds,
  getPeople,
  seedDefaultCategories,
  updateExpense,
} from "../services/expenseApi";
import { getCategoryVisual, soraPalette } from "../theme/soraTheme";
import type {
  CreateExpensePayload,
  ExpenseCategory,
  ExpenseType,
  ExpenseVisibility,
  Household,
  PaymentMethod,
  Person,
  SplitType,
} from "../types/api";
import { getTodayDate, isValidDate } from "../utils/date";
import { formatPaymentMethod } from "../utils/format";
import { updateSoraExpenseWidget } from "../widgets/widgetStorage";

type Props = NativeStackScreenProps<RootStackParamList, "ExpenseForm">;

const paymentMethods: PaymentMethod[] = ["upi", "cash"];
const expenseTypes: Array<{ label: string; value: ExpenseType }> = [
  { label: "Personal", value: "personal" },
  { label: "Shared", value: "shared" },
  { label: "Household", value: "household" },
];
const splitTypes: Array<{ label: string; value: SplitType }> = [
  { label: "Equal", value: "equal" },
  { label: "Custom", value: "custom_amount" },
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

export function ExpenseFormScreen({ navigation, route }: Props) {
  const { colors } = useAppSettings();
  const expenseId = route.params?.expenseId;
  const isEditing = Boolean(expenseId);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("upi");
  const [expenseDate, setExpenseDate] = useState(getTodayDate());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [note, setNote] = useState("");
  const [expenseType, setExpenseType] = useState<ExpenseType>("personal");
  const [householdId, setHouseholdId] = useState<number | null>(null);
  const [splitType, setSplitType] = useState<SplitType>("equal");
  const [selectedPeople, setSelectedPeople] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [peopleRows, householdRows] = await Promise.all([getPeople(), getHouseholds()]);
      let categoryRows = await getCategories();
      if (!categoryRows.length) {
        categoryRows = await seedDefaultCategories();
      }

      setCategories(categoryRows);
      setPeople(peopleRows);
      setHouseholds(householdRows);

      if (expenseId) {
        const expense = await getExpense(expenseId);
        setTitle(expense.title);
        setAmount(expense.amount);
        setCategory(expense.category);
        setPaymentMethod(expense.payment_method === "cash" ? "cash" : "upi");
        setExpenseDate(expense.expense_date);
        setNote(expense.note ?? "");
        setExpenseType(expense.expense_type ?? "personal");
        setHouseholdId(expense.household);
        setSelectedPeople((expense.shares ?? []).map((share) => share.person).filter((id): id is number => Boolean(id)));
      }
    } catch {
      setError("Could not load expense form.");
    } finally {
      setLoading(false);
    }
  }, [expenseId]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedCategory = useMemo(
    () => categories.find((item) => item.id === category) ?? null,
    [categories, category]
  );
  const selectedHousehold = useMemo(
    () => households.find((item) => item.id === householdId) ?? null,
    [households, householdId]
  );

  const togglePerson = (personId: number) => {
    setSelectedPeople((current) =>
      current.includes(personId) ? current.filter((id) => id !== personId) : [...current, personId]
    );
  };

  const save = async () => {
    const cleanTitle = title.trim();
    const cleanAmount = Number(amount);

    if (!cleanTitle) {
      setError("Title is required.");
      return;
    }
    if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
      setError("Amount must be greater than 0.");
      return;
    }
    if (!isValidDate(expenseDate)) {
      setError("Choose a valid date.");
      return;
    }
    if (expenseType === "household" && !householdId) {
      setError("Choose a household for household expenses.");
      return;
    }
    if (expenseType !== "personal" && selectedPeople.length === 0) {
      setError("Choose at least one person for a shared split.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const visibility: ExpenseVisibility =
        expenseType === "personal" ? "private" : expenseType === "household" ? "household" : "shared";
      const payload: CreateExpensePayload = {
        amount: cleanAmount.toFixed(2),
        category,
        expense_date: expenseDate,
        expense_type: expenseType,
        household: expenseType === "household" ? householdId : null,
        note: note.trim(),
        paid_by_user: "me" as const,
        payment_method: paymentMethod,
        title: cleanTitle,
        visibility,
        ...(expenseType !== "personal"
          ? {
              participants: selectedPeople.map((person) => ({ person })),
              split_type: splitType,
            }
          : {}),
      };

      if (expenseId) {
        await updateExpense(expenseId, payload);
      } else {
        await createExpense(payload);
      }
      void refreshWidgetFromLatestExpense();
      navigation.navigate("Expenses");
    } catch {
      setError("Could not save expense. Check split/category access.");
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
    <SoraScreen>
      <SoraHeader
        backIcon="close"
        onBack={() => navigation.goBack()}
        title={isEditing ? "Edit Expense" : "Add Expense"}
        subtitle={selectedCategory ? selectedCategory.name : "Track quickly, split when needed"}
      />
      <SoraError text={error} />

      <SoraCard>
        <Text style={[styles.amountLabel, { color: colors.text }]}>Amount</Text>
        <View style={[styles.amountBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Text style={[styles.currencySymbol, { color: colors.text }]}>₹</Text>
          <NativeTextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            editable={!saving}
            placeholder="0"
            placeholderTextColor={colors.muted}
            selectionColor={colors.accent}
            style={[styles.amountInput, { color: colors.text }]}
          />
        </View>

        <TextInput label="Title" mode="outlined" value={title} onChangeText={setTitle} disabled={saving} style={styles.input} />

        <Text style={[styles.fieldLabel, { color: colors.text }]}>Payment Mode</Text>
        <View style={[styles.segment, { backgroundColor: colors.background }]}>
          {paymentMethods.map((method) => (
            <AppButton
              key={method}
              mode={paymentMethod === method ? "contained" : "text"}
              onPress={() => setPaymentMethod(method)}
              style={styles.segmentButton}
            >
              {formatPaymentMethod(method)}
            </AppButton>
          ))}
        </View>

        <Text style={[styles.fieldLabel, { color: colors.text }]}>Date</Text>
        <AppButton icon="calendar-month-outline" mode="outlined" onPress={() => setShowDatePicker(true)} style={styles.input}>
          {expenseDate}
        </AppButton>
        {showDatePicker ? (
          <View style={styles.datePickerWrap}>
            <DateTimePicker
              value={fromDateInputValue(expenseDate)}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={handleDateChange}
            />
            {Platform.OS === "ios" ? (
              <AppButton compact mode="text" onPress={() => setShowDatePicker(false)}>
                Done
              </AppButton>
            ) : null}
          </View>
        ) : null}
      </SoraCard>

      <SoraCard>
        <Text style={[styles.fieldLabel, { color: colors.text }]}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <SoraChip active={category === null} onPress={() => setCategory(null)}>
            None
          </SoraChip>
          {categories.map((item) => {
            const visual = getCategoryVisual(item.name, item.icon, item.color);
            return (
              <SoraChip active={category === item.id} key={item.id} onPress={() => setCategory(item.id)}>
                <MaterialCommunityIcons name={visual.icon} size={15} color={category === item.id ? "#FFFFFF" : visual.color} /> {item.name}
              </SoraChip>
            );
          })}
          <SoraChip onPress={() => navigation.navigate("Categories")}>+ Category</SoraChip>
        </ScrollView>

        <Text style={[styles.fieldLabel, { color: colors.text }]}>Expense Type</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {expenseTypes.map((item) => (
            <SoraChip active={expenseType === item.value} key={item.value} onPress={() => setExpenseType(item.value)}>
              {item.label}
            </SoraChip>
          ))}
        </ScrollView>

        {expenseType === "household" ? (
          <>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Household</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {households.map((item) => (
                <SoraChip active={householdId === item.id} key={item.id} onPress={() => setHouseholdId(item.id)}>
                  {item.name}
                </SoraChip>
              ))}
              <SoraChip onPress={() => navigation.navigate("Households")}>+ Home</SoraChip>
            </ScrollView>
          </>
        ) : null}

        {expenseType !== "personal" ? (
          <>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Split</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {splitTypes.map((item) => (
                <SoraChip active={splitType === item.value} key={item.value} onPress={() => setSplitType(item.value)}>
                  {item.label}
                </SoraChip>
              ))}
            </ScrollView>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>People</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {people.map((person) => (
                <SoraChip active={selectedPeople.includes(person.id)} key={person.id} onPress={() => togglePerson(person.id)}>
                  {person.name}
                </SoraChip>
              ))}
              <SoraChip onPress={() => navigation.navigate("People")}>+ Person</SoraChip>
            </ScrollView>
          </>
        ) : null}

        <TextInput
          label="Note"
          mode="outlined"
          value={note}
          onChangeText={setNote}
          multiline
          numberOfLines={3}
          disabled={saving}
          style={styles.input}
        />
      </SoraCard>

      <AppButton mode="contained" onPress={save} loading={saving} disabled={saving || loading} contentStyle={styles.primaryContent}>
        {isEditing ? "Save Changes" : "Save Expense"}
      </AppButton>

      {isEditing ? (
        <AppButton mode="outlined" textColor={colors.danger} onPress={confirmDelete} disabled={saving} style={styles.deleteButton}>
          Delete Expense
        </AppButton>
      ) : null}
    </SoraScreen>
  );
}

const styles = StyleSheet.create({
  amountLabel: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 12,
    textAlign: "center",
  },
  amountBox: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 18,
    minHeight: 118,
    paddingHorizontal: 22,
  },
  amountInput: {
    flex: 1,
    fontSize: 48,
    fontWeight: "800",
    minWidth: 0,
    textAlign: "center",
  },
  currencySymbol: {
    fontSize: 48,
    fontWeight: "900",
    width: 56,
  },
  input: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 17,
    fontWeight: "900",
    marginBottom: 10,
    marginTop: 4,
  },
  segment: {
    borderRadius: 16,
    flexDirection: "row",
    gap: 6,
    marginBottom: 16,
    padding: 5,
  },
  segmentButton: {
    flex: 1,
  },
  chipRow: {
    gap: 8,
    paddingBottom: 16,
    paddingRight: 18,
  },
  datePickerWrap: {
    marginBottom: 12,
  },
  primaryContent: {
    height: 52,
  },
  deleteButton: {
    marginTop: 10,
  },
});
