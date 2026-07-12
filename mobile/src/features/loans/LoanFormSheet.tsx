import { useEffect, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import {
  AmountInput,
  AppBottomSheet,
  AppButton,
  AppSegmentedControl,
  AppText,
  ErrorState,
  FormField,
  dsRadius,
  dsSpace,
  useDs,
} from "../../design-system";
import type { Loan, LoanDirection, SaveLoanPayload } from "../../types/api";
import { getTodayDate, isValidDate } from "../../utils/date";
import { formatDateLabel, parseAmount } from "../../utils/format";
import {
  fromDateInputValue,
  getLoanDirectionCopy,
  sanitizeLoanAmount,
  toDateInputValue,
} from "./loanUi";

type DateFieldKey = "disbursed" | "due";

const directionItems: Array<{ icon: "arrow-down-left" | "arrow-up-right"; label: string; value: LoanDirection }> = [
  { icon: "arrow-down-left", label: "I borrowed", value: "borrowed" },
  { icon: "arrow-up-right", label: "I lent", value: "lent" },
];

export function LoanFormSheet({
  error,
  loan,
  onClose,
  onDelete,
  onSave,
  saving,
  visible,
}: {
  error: string;
  loan?: Loan | null;
  onClose: () => void;
  onDelete?: () => void;
  onSave: (payload: SaveLoanPayload) => void;
  saving: boolean;
  visible: boolean;
}) {
  const [direction, setDirection] = useState<LoanDirection>("borrowed");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [principal, setPrincipal] = useState("");
  const [disbursedDate, setDisbursedDate] = useState(getTodayDate());
  const [nextDueDate, setNextDueDate] = useState("");
  const [showDueDate, setShowDueDate] = useState(false);
  const [datePicker, setDatePicker] = useState<DateFieldKey | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!visible) return;
    const existingDueDate = loan?.next_due_date ?? "";
    setDirection(loan?.direction ?? "borrowed");
    setCounterpartyName(loan?.counterparty_name ?? "");
    setPrincipal(loan ? String(parseAmount(loan.principal_amount)) : "");
    setDisbursedDate(loan?.disbursed_date ?? getTodayDate());
    setNextDueDate(existingDueDate);
    setShowDueDate(Boolean(existingDueDate));
    setDatePicker(null);
    setFieldErrors({});
  }, [loan, visible]);

  const directionCopy = getLoanDirectionCopy(direction);

  const setFieldError = (key: string) => {
    setFieldErrors((current) => ({ ...current, [key]: "" }));
  };

  const submit = () => {
    const nextErrors: Record<string, string> = {};
    if (!counterpartyName.trim()) nextErrors.counterparty = `Add the ${directionCopy.counterparty.toLowerCase()}.`;
    if (parseAmount(principal) <= 0) nextErrors.principal = "Enter an amount above ₹0.";
    if (!isValidDate(disbursedDate) || disbursedDate > getTodayDate()) nextErrors.disbursed = "Choose today or an earlier date.";
    if (showDueDate && (!isValidDate(nextDueDate) || nextDueDate < disbursedDate)) {
      nextErrors.due = "Due date must be on or after the start date.";
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const cleanCounterparty = counterpartyName.trim();
    const generatedName = direction === "borrowed" ? `Borrowed from ${cleanCounterparty}` : `Lent to ${cleanCounterparty}`;
    onSave({
      // Keep existing detailed contract values intact when this quick form edits a loan.
      account_reference: loan?.account_reference ?? "",
      annual_interest_rate: loan?.annual_interest_rate ?? "0.00",
      collateral_note: loan?.collateral_note ?? "",
      counterparty_name: cleanCounterparty,
      direction,
      disbursed_date: disbursedDate,
      interest_start_date: loan?.interest_start_date ?? null,
      interest_type: loan?.interest_type ?? "none",
      loan_type: loan?.loan_type ?? "personal",
      maturity_date: loan?.maturity_date ?? null,
      name: loan?.name || generatedName,
      next_due_date: showDueDate ? nextDueDate : null,
      note: loan?.note ?? "",
      planned_payment_amount: loan?.planned_payment_amount ?? "0.00",
      principal_amount: parseAmount(principal).toFixed(2),
      reference_number: loan?.reference_number ?? "",
      repayment_frequency: loan?.repayment_frequency ?? "monthly",
      terms_note: loan?.terms_note ?? "",
    });
  };

  const onDateChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") setDatePicker(null);
    if (event.type === "dismissed" || !selected || !datePicker) return;
    const value = toDateInputValue(selected);
    if (datePicker === "disbursed") {
      setDisbursedDate(value);
      setFieldError("disbursed");
    } else {
      setNextDueDate(value);
      setFieldError("due");
    }
  };

  return (
    <AppBottomSheet
      footer={
        <View style={styles.footerActions}>
          <AppButton block disabled={saving} loading={saving} onPress={submit}>
            {loan ? "Save changes" : "Add loan"}
          </AppButton>
          {loan && onDelete ? (
            <AppButton
              block
              disabled={saving}
              onPress={() => Alert.alert("Delete this loan?", "This cannot be undone. Loans with repayments are kept for a complete history.", [
                { style: "cancel", text: "Keep loan" },
                { onPress: onDelete, style: "destructive", text: "Delete" },
              ])}
              variant="tertiary"
            >
              Delete loan
            </AppButton>
          ) : null}
        </View>
      }
      maxHeight="82%"
      onClose={onClose}
      title={loan ? "Edit loan" : "Add loan"}
      visible={visible}
    >
      <ErrorState text={error} />
      <AppSegmentedControl accessibilityLabel="Loan direction" items={directionItems} onChange={setDirection} value={direction} />

      <FormField
        autoFocus={!loan}
        error={fieldErrors.counterparty}
        label={`${directionCopy.counterparty} name`}
        onChangeText={(value) => {
          setCounterpartyName(value);
          setFieldError("counterparty");
        }}
        placeholder={direction === "borrowed" ? "Priya, HDFC Bank…" : "Arjun, Meera…"}
        style={styles.field}
        value={counterpartyName}
      />
      <AmountInput
        error={fieldErrors.principal}
        onChangeText={(value) => {
          setPrincipal(sanitizeLoanAmount(value));
          setFieldError("principal");
        }}
        value={principal}
      />

      <DateField error={fieldErrors.disbursed} label="Start date" onPress={() => setDatePicker("disbursed")} value={disbursedDate} />
      {showDueDate ? (
        <DateField
          actionLabel="Remove"
          error={fieldErrors.due}
          label="Repayment due date"
          onAction={() => {
            setShowDueDate(false);
            setNextDueDate("");
            setFieldError("due");
          }}
          onPress={() => setDatePicker("due")}
          value={nextDueDate}
        />
      ) : (
        <AppButton icon="calendar-plus-outline" onPress={() => {
          setShowDueDate(true);
          setNextDueDate(nextDueDate || disbursedDate);
        }} style={styles.dueButton} variant="secondary">
          Add repayment due date
        </AppButton>
      )}

      {datePicker ? (
        <View style={styles.datePickerWrap}>
          <DateTimePicker
            display={Platform.OS === "ios" ? "spinner" : "default"}
            maximumDate={datePicker === "disbursed" ? new Date() : undefined}
            minimumDate={datePicker === "due" ? fromDateInputValue(disbursedDate) : undefined}
            mode="date"
            onChange={onDateChange}
            value={fromDateInputValue(datePicker === "due" ? nextDueDate || disbursedDate : disbursedDate)}
          />
          {Platform.OS === "ios" ? <AppButton compact onPress={() => setDatePicker(null)} variant="secondary">Done</AppButton> : null}
        </View>
      ) : null}
    </AppBottomSheet>
  );
}

function DateField({
  actionLabel,
  error,
  label,
  onAction,
  onPress,
  value,
}: {
  actionLabel?: string;
  error?: string;
  label: string;
  onAction?: () => void;
  onPress: () => void;
  value: string;
}) {
  const { colors } = useDs();
  return (
    <View style={styles.dateFieldWrap}>
      <View style={styles.dateLabelRow}>
        <AppText color="textMuted" style={styles.sheetLabel} variant="label">{label}</AppText>
        {actionLabel && onAction ? <AppButton compact onPress={onAction} variant="tertiary">{actionLabel}</AppButton> : null}
      </View>
      <Pressable
        accessibilityRole="button"
        android_ripple={{ color: colors.press }}
        onPress={onPress}
        style={[styles.dateField, { borderColor: error ? colors.danger : colors.border }]}
      >
        <MaterialCommunityIcons color={colors.accent} name="calendar-month-outline" size={22} />
        <AppText style={styles.dateValue} variant="bodyStrong">{formatDateLabel(value)}</AppText>
        <MaterialCommunityIcons color={colors.textSubtle} name="chevron-right" size={22} />
      </Pressable>
      {error ? <AppText color="danger" style={styles.dateError} variant="caption">{error}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dateError: { marginTop: dsSpace[0.5] },
  dateField: { alignItems: "center", borderRadius: dsRadius.sm, borderWidth: 1, flexDirection: "row", gap: dsSpace[1], minHeight: 56, paddingHorizontal: dsSpace[1.5] },
  dateFieldWrap: { marginBottom: dsSpace[1.5] },
  dateLabelRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  datePickerWrap: { gap: dsSpace[1], marginBottom: dsSpace[2] },
  dateValue: { flex: 1 },
  dueButton: { alignSelf: "flex-start", marginBottom: dsSpace[2] },
  field: { marginBottom: dsSpace[1.5] },
  footerActions: { gap: dsSpace[0.5] },
  sheetLabel: { marginBottom: dsSpace[0.5] },
});
