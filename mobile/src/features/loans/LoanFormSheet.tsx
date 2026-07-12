import { useEffect, useMemo, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import {
  AmountInput,
  AppBottomSheet,
  AppButton,
  AppSegmentedControl,
  AppText,
  CategoryChip,
  ErrorState,
  FormField,
  dsRadius,
  dsSpace,
  useDs,
} from "../../design-system";
import type {
  Loan,
  LoanDirection,
  LoanInterestType,
  LoanRepaymentFrequency,
  LoanType,
  SaveLoanPayload,
} from "../../types/api";
import { getTodayDate, isValidDate } from "../../utils/date";
import { formatDateLabel, parseAmount } from "../../utils/format";
import {
  fromDateInputValue,
  getLoanDirectionCopy,
  loanTypeOptions,
  repaymentFrequencyOptions,
  sanitizeLoanAmount,
  toDateInputValue,
} from "./loanUi";

type DateFieldKey = "disbursed" | "nextDue" | "maturity";

const directionItems: Array<{ icon: "arrow-down-left" | "arrow-up-right"; label: string; value: LoanDirection }> = [
  { icon: "arrow-down-left", label: "Borrowed", value: "borrowed" },
  { icon: "arrow-up-right", label: "Lent", value: "lent" },
];

const interestItems: Array<{ label: string; value: LoanInterestType }> = [
  { label: "No interest", value: "none" },
  { label: "Simple interest", value: "simple" },
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
  const { colors } = useDs();
  const [direction, setDirection] = useState<LoanDirection>("borrowed");
  const [name, setName] = useState("");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [loanType, setLoanType] = useState<LoanType>("personal");
  const [principal, setPrincipal] = useState("");
  const [interestType, setInterestType] = useState<LoanInterestType>("none");
  const [annualRate, setAnnualRate] = useState("");
  const [disbursedDate, setDisbursedDate] = useState(getTodayDate());
  const [repaymentFrequency, setRepaymentFrequency] = useState<LoanRepaymentFrequency>("monthly");
  const [plannedPayment, setPlannedPayment] = useState("");
  const [nextDueDate, setNextDueDate] = useState("");
  const [maturityDate, setMaturityDate] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [accountReference, setAccountReference] = useState("");
  const [collateralNote, setCollateralNote] = useState("");
  const [termsNote, setTermsNote] = useState("");
  const [note, setNote] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [datePicker, setDatePicker] = useState<DateFieldKey | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!visible) return;
    const hasAdvancedFields = Boolean(
      loan?.planned_payment_amount || loan?.next_due_date || loan?.maturity_date || loan?.reference_number ||
        loan?.account_reference || loan?.collateral_note || loan?.terms_note || loan?.note
    );
    setDirection(loan?.direction ?? "borrowed");
    setName(loan?.name ?? "");
    setCounterpartyName(loan?.counterparty_name ?? "");
    setLoanType(loan?.loan_type ?? "personal");
    setPrincipal(loan ? String(parseAmount(loan.principal_amount)) : "");
    setInterestType(loan?.interest_type ?? "none");
    setAnnualRate(loan && loan.interest_type === "simple" ? String(parseAmount(loan.annual_interest_rate)) : "");
    setDisbursedDate(loan?.disbursed_date ?? getTodayDate());
    setRepaymentFrequency(loan?.repayment_frequency ?? "monthly");
    setPlannedPayment(loan?.planned_payment_amount ? String(parseAmount(loan.planned_payment_amount)) : "");
    setNextDueDate(loan?.next_due_date ?? "");
    setMaturityDate(loan?.maturity_date ?? "");
    setReferenceNumber(loan?.reference_number ?? "");
    setAccountReference(loan?.account_reference ?? "");
    setCollateralNote(loan?.collateral_note ?? "");
    setTermsNote(loan?.terms_note ?? "");
    setNote(loan?.note ?? "");
    setAdvancedOpen(hasAdvancedFields);
    setDatePicker(null);
    setFieldErrors({});
  }, [loan, visible]);

  const directionCopy = getLoanDirectionCopy(direction);
  const selectedDate = useMemo(() => {
    if (datePicker === "nextDue") return nextDueDate;
    if (datePicker === "maturity") return maturityDate;
    return disbursedDate;
  }, [datePicker, disbursedDate, maturityDate, nextDueDate]);

  const setFieldError = (key: string, value = "") => {
    setFieldErrors((current) => ({ ...current, [key]: value }));
  };

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors.name = "Add a loan name.";
    if (!counterpartyName.trim()) nextErrors.counterparty = `Add the ${directionCopy.counterparty.toLowerCase()}.`;
    if (parseAmount(principal) <= 0) nextErrors.principal = "Enter an amount above ₹0.";
    if (!isValidDate(disbursedDate) || disbursedDate > getTodayDate()) nextErrors.disbursed = "Choose today or an earlier date.";
    if (interestType === "simple" && parseAmount(annualRate) <= 0) nextErrors.rate = "Enter an annual rate above 0%.";
    if (nextDueDate && (!isValidDate(nextDueDate) || nextDueDate < disbursedDate)) {
      nextErrors.nextDue = "Due date must be on or after the disbursed date.";
    }
    if (maturityDate && (!isValidDate(maturityDate) || maturityDate < disbursedDate)) {
      nextErrors.maturity = "Maturity date must be on or after the disbursed date.";
    }
    if (plannedPayment && parseAmount(plannedPayment) <= 0) nextErrors.plannedPayment = "Enter an amount above ₹0.";
    setFieldErrors(nextErrors);
    return !Object.keys(nextErrors).length;
  };

  const submit = () => {
    if (!validate()) return;
    onSave({
      account_reference: accountReference.trim(),
      annual_interest_rate: interestType === "simple" ? parseAmount(annualRate).toFixed(2) : "0.00",
      collateral_note: collateralNote.trim(),
      counterparty_name: counterpartyName.trim(),
      direction,
      disbursed_date: disbursedDate,
      interest_type: interestType,
      loan_type: loanType,
      maturity_date: maturityDate || null,
      name: name.trim(),
      next_due_date: nextDueDate || null,
      note: note.trim(),
      planned_payment_amount: plannedPayment ? parseAmount(plannedPayment).toFixed(2) : "0.00",
      principal_amount: parseAmount(principal).toFixed(2),
      reference_number: referenceNumber.trim(),
      repayment_frequency: repaymentFrequency,
      terms_note: termsNote.trim(),
    });
  };

  const onDateChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") setDatePicker(null);
    if (event.type === "dismissed" || !selected || !datePicker) return;
    const value = toDateInputValue(selected);
    if (datePicker === "disbursed") {
      setDisbursedDate(value);
      setFieldError("disbursed");
    } else if (datePicker === "nextDue") {
      setNextDueDate(value);
      setFieldError("nextDue");
    } else {
      setMaturityDate(value);
      setFieldError("maturity");
    }
  };

  return (
    <AppBottomSheet
      footer={
        <View style={styles.footerActions}>
          <AppButton block disabled={saving} loading={saving} onPress={submit}>
            {loan ? "Save changes" : "Create loan"}
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
      maxHeight="94%"
      onClose={onClose}
      title={loan ? "Edit loan" : "New loan"}
      visible={visible}
    >
      <ErrorState text={error} />
      <AppText color="textMuted" style={styles.sheetLabel} variant="label">
        Direction
      </AppText>
      <AppSegmentedControl accessibilityLabel="Loan direction" items={directionItems} onChange={setDirection} value={direction} />
      <AppText color="textSubtle" style={styles.directionHint} variant="caption">
        {direction === "borrowed" ? "Track what you owe, with due dates and repayments." : "Track money owed back to you, without mixing it into spending."}
      </AppText>

      <FormField
        error={fieldErrors.name}
        label="Loan name"
        onChangeText={(value) => {
          setName(value);
          setFieldError("name");
        }}
        placeholder="e.g. Family bridge loan"
        style={styles.field}
        value={name}
      />
      <FormField
        error={fieldErrors.counterparty}
        label={`${directionCopy.counterparty} name`}
        onChangeText={(value) => {
          setCounterpartyName(value);
          setFieldError("counterparty");
        }}
        placeholder={direction === "borrowed" ? "e.g. Priya or HDFC Bank" : "e.g. Arjun"}
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
      <AppText color="textMuted" style={styles.amountLabel} variant="caption">
        Original principal
      </AppText>

      <AppText color="textMuted" style={styles.sheetLabel} variant="label">
        Loan type
      </AppText>
      <View style={styles.chipWrap}>
        {loanTypeOptions.map((option) => (
          <CategoryChip active={loanType === option.value} key={option.value} label={option.label} onPress={() => setLoanType(option.value)} />
        ))}
      </View>

      <AppText color="textMuted" style={styles.sheetLabel} variant="label">
        Interest
      </AppText>
      <AppSegmentedControl accessibilityLabel="Interest type" items={interestItems} onChange={setInterestType} value={interestType} />
      {interestType === "simple" ? (
        <FormField
          error={fieldErrors.rate}
          keyboardType="decimal-pad"
          label="Annual interest rate (%)"
          onChangeText={(value) => {
            setAnnualRate(sanitizeLoanAmount(value));
            setFieldError("rate");
          }}
          placeholder="e.g. 12"
          style={styles.field}
          value={annualRate}
        />
      ) : null}

      <DateField error={fieldErrors.disbursed} label="Disbursed date" onPress={() => setDatePicker("disbursed")} value={disbursedDate} />

      <Pressable
        accessibilityRole="button"
        android_ripple={{ color: colors.press }}
        onPress={() => setAdvancedOpen((current) => !current)}
        style={[styles.advancedToggle, { backgroundColor: colors.chipBg }]}
      >
        <View style={[styles.advancedIcon, { backgroundColor: colors.surface }]}>
          <MaterialCommunityIcons color={colors.accent} name="calendar-clock-outline" size={21} />
        </View>
        <View style={styles.advancedCopy}>
          <AppText variant="bodyStrong">Repayment schedule & details</AppText>
          <AppText color="textSubtle" variant="caption">Due dates, references, terms and notes</AppText>
        </View>
        <MaterialCommunityIcons color={colors.textMuted} name={advancedOpen ? "chevron-up" : "chevron-down"} size={22} />
      </Pressable>

      {advancedOpen ? (
        <View style={styles.advancedContent}>
          <AppText color="textMuted" style={styles.sheetLabel} variant="label">
            Repayment frequency
          </AppText>
          <View style={styles.chipWrap}>
            {repaymentFrequencyOptions.map((option) => (
              <CategoryChip
                active={repaymentFrequency === option.value}
                key={option.value}
                label={option.label}
                onPress={() => setRepaymentFrequency(option.value)}
              />
            ))}
          </View>
          <FormField
            error={fieldErrors.plannedPayment}
            keyboardType="decimal-pad"
            label="Planned repayment (optional)"
            onChangeText={(value) => {
              setPlannedPayment(sanitizeLoanAmount(value));
              setFieldError("plannedPayment");
            }}
            placeholder="Amount per repayment"
            style={styles.field}
            value={plannedPayment}
          />
          <DateField error={fieldErrors.nextDue} label="Next repayment due (optional)" onPress={() => setDatePicker("nextDue")} value={nextDueDate} />
          <DateField error={fieldErrors.maturity} label="Maturity date (optional)" onPress={() => setDatePicker("maturity")} value={maturityDate} />
          <FormField label="Agreement or loan reference (optional)" onChangeText={setReferenceNumber} placeholder="Contract, loan or reference number" style={styles.field} value={referenceNumber} />
          <FormField label="Account or UPI reference (optional)" onChangeText={setAccountReference} placeholder="Masked account or UPI ID" style={styles.field} value={accountReference} />
          <FormField label="Collateral note (optional)" multiline onChangeText={setCollateralNote} placeholder="Only if relevant" style={styles.field} value={collateralNote} />
          <FormField label="Terms note (optional)" multiline onChangeText={setTermsNote} placeholder="Repayment terms or commitments" style={styles.field} value={termsNote} />
          <FormField label="Private note (optional)" multiline onChangeText={setNote} placeholder="Anything useful to remember" style={styles.field} value={note} />
        </View>
      ) : null}

      {datePicker ? (
        <View style={styles.datePickerWrap}>
          <DateTimePicker
            display={Platform.OS === "ios" ? "spinner" : "default"}
            maximumDate={datePicker === "disbursed" ? new Date() : undefined}
            mode="date"
            onChange={onDateChange}
            value={fromDateInputValue(selectedDate || getTodayDate())}
          />
          {Platform.OS === "ios" ? <AppButton compact onPress={() => setDatePicker(null)} variant="secondary">Done</AppButton> : null}
        </View>
      ) : null}
    </AppBottomSheet>
  );
}

function DateField({ error, label, onPress, value }: { error?: string; label: string; onPress: () => void; value: string }) {
  const { colors } = useDs();
  return (
    <View style={styles.dateFieldWrap}>
      <AppText color="textMuted" style={styles.sheetLabel} variant="label">{label}</AppText>
      <Pressable
        accessibilityRole="button"
        android_ripple={{ color: colors.press }}
        onPress={onPress}
        style={[styles.dateField, { borderColor: error ? colors.danger : colors.border }]}
      >
        <MaterialCommunityIcons color={colors.accent} name="calendar-month-outline" size={22} />
        <AppText style={styles.dateValue} variant="bodyStrong">{value ? formatDateLabel(value) : "Choose a date"}</AppText>
        <MaterialCommunityIcons color={colors.textSubtle} name="chevron-right" size={22} />
      </Pressable>
      {error ? <AppText color="danger" style={styles.dateError} variant="caption">{error}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  advancedContent: { marginTop: dsSpace[2] },
  advancedCopy: { flex: 1, minWidth: 0 },
  advancedIcon: { alignItems: "center", borderRadius: dsRadius.pill, height: 38, justifyContent: "center", width: 38 },
  advancedToggle: { alignItems: "center", borderRadius: dsRadius.md, flexDirection: "row", gap: dsSpace[1], marginTop: dsSpace[2], minHeight: 64, paddingHorizontal: dsSpace[1.5] },
  amountLabel: { marginBottom: dsSpace[2], marginTop: dsSpace[0.5], textAlign: "center" },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: dsSpace[1], marginBottom: dsSpace[2] },
  dateError: { marginTop: dsSpace[0.5] },
  dateField: { alignItems: "center", borderRadius: dsRadius.sm, borderWidth: 1, flexDirection: "row", gap: dsSpace[1], minHeight: 56, paddingHorizontal: dsSpace[1.5] },
  dateFieldWrap: { marginBottom: dsSpace[1.5] },
  datePickerWrap: { gap: dsSpace[1], marginBottom: dsSpace[2] },
  dateValue: { flex: 1 },
  directionHint: { marginBottom: dsSpace[2], marginTop: dsSpace[1] },
  field: { marginBottom: dsSpace[1.5] },
  footerActions: { gap: dsSpace[0.5] },
  sheetLabel: { marginBottom: dsSpace[0.5] },
});
