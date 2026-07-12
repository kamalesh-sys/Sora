import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import {
  AmountInput,
  AppBottomSheet,
  AppButton,
  AppCard,
  AppScreen,
  AppSegmentedControl,
  AppText,
  BottomActionBar,
  EmptyState,
  ErrorState,
  FormField,
  IconButton,
  ProgressBar,
  SectionHeader,
  SkeletonBlock,
  StatusTag,
  dsRadius,
  dsSpace,
  useDs,
} from "../design-system";
import { useFeedback } from "../context/FeedbackContext";
import { LoanFormSheet } from "../features/loans/LoanFormSheet";
import {
  fromDateInputValue,
  getLoanDirectionCopy,
  getLoanDueCopy,
  getLoanIcon,
  getLoanProgress,
  getLoanStatusMeta,
  isLoanPaymentDateValid,
  sanitizeLoanAmount,
  toDateInputValue,
} from "../features/loans/loanUi";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { getApiErrorMessage } from "../services/apiClient";
import { createLoanPayment, deleteLoan, deleteLoanPayment, getLoan, updateLoan } from "../services/expenseApi";
import type { Loan, LoanPayment, PaymentMethod, SaveLoanPayload, SaveLoanPaymentPayload } from "../types/api";
import { getTodayDate, isValidDate } from "../utils/date";
import { formatCurrencyCompact, formatDateLabel, formatPaymentMethod, parseAmount } from "../utils/format";

type Props = NativeStackScreenProps<RootStackParamList, "LoanDetail">;

const paymentMethodItems: Array<{ icon: "cellphone" | "cash" | "credit-card-outline" | "bank-outline"; label: string; value: PaymentMethod }> = [
  { icon: "cellphone", label: "UPI", value: "upi" },
  { icon: "cash", label: "Cash", value: "cash" },
  { icon: "credit-card-outline", label: "Card", value: "card" },
  { icon: "bank-outline", label: "Bank", value: "bank" },
];

export function LoanDetailScreen({ navigation, route }: Props) {
  const { colors } = useDs();
  const { success } = useFeedback();
  const [loan, setLoan] = useState<Loan | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [repaymentOpen, setRepaymentOpen] = useState(false);
  const [repaymentError, setRepaymentError] = useState("");
  const [paying, setPaying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [saving, setSaving] = useState(false);
  const loadRequestRef = useRef(0);

  const load = useCallback(async ({ reset = false }: { reset?: boolean } = {}) => {
    const requestId = ++loadRequestRef.current;
    if (reset) {
      setLoading(true);
      setLoan(null);
      setRepaymentOpen(false);
      setEditing(false);
      setRepaymentError("");
      setEditorError("");
    }
    setError("");
    try {
      const nextLoan = await getLoan(route.params.loanId);
      if (requestId !== loadRequestRef.current) return;
      setLoan(nextLoan);
    } catch (loadError) {
      if (requestId !== loadRequestRef.current) return;
      setLoan(null);
      setError(getApiErrorMessage(loadError, "Could not load this loan. Try again."));
    } finally {
      if (requestId !== loadRequestRef.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, [route.params.loanId]);

  useFocusEffect(
    useCallback(() => {
      void load({ reset: true });
      return () => {
        loadRequestRef.current += 1;
      };
    }, [load])
  );

  const saveLoan = async (payload: SaveLoanPayload) => {
    if (!loan) return;
    setSaving(true);
    setEditorError("");
    try {
      const updated = await updateLoan(loan.id, payload);
      setLoan(updated);
      setEditing(false);
      success();
    } catch (saveError) {
      setEditorError(getApiErrorMessage(saveError, "Could not save this loan. Try again."));
    } finally {
      setSaving(false);
    }
  };

  const removeLoan = async () => {
    if (!loan) return;
    setSaving(true);
    setEditorError("");
    try {
      await deleteLoan(loan.id);
      success();
      navigation.goBack();
    } catch (deleteError) {
      setEditorError(getApiErrorMessage(deleteError, "This loan could not be deleted."));
    } finally {
      setSaving(false);
    }
  };

  const addRepayment = async (payload: SaveLoanPaymentPayload) => {
    if (!loan) return;
    setPaying(true);
    setRepaymentError("");
    try {
      const result = await createLoanPayment(loan.id, payload);
      setLoan(result.loan);
      setRepaymentOpen(false);
      success();
    } catch (paymentError) {
      setRepaymentError(getApiErrorMessage(paymentError, "Could not record this repayment. Try again."));
    } finally {
      setPaying(false);
    }
  };

  const removePayment = (payment: LoanPayment) => {
    if (!loan) return;
    Alert.alert(
      "Remove this repayment?",
      "The outstanding balance will be recalculated. This cannot be undone.",
      [
        { style: "cancel", text: "Keep repayment" },
        {
          onPress: () => {
            void (async () => {
              setError("");
              try {
                const result = await deleteLoanPayment(loan.id, payment.id);
                setLoan(result.loan);
                success();
              } catch (deleteError) {
                setError(getApiErrorMessage(deleteError, "This repayment could not be removed."));
              }
            })();
          },
          style: "destructive",
          text: "Remove",
        },
      ]
    );
  };

  if (loading && !loan) {
    return <AppScreen><LoanDetailSkeleton /></AppScreen>;
  }
  if (error && !loan) {
    return (
      <AppScreen>
        <EmptyState action="Try again" body={error} icon="cloud-alert-outline" onAction={() => void load({ reset: true })} title="Loan is unavailable" />
      </AppScreen>
    );
  }
  if (!loan) return null;

  const direction = getLoanDirectionCopy(loan.direction);
  const status = getLoanStatusMeta(loan.display_status);
  const interestLabel = loan.interest_type === "simple" ? `${parseAmount(loan.annual_interest_rate)}% simple annual interest` : "No interest";
  const frequencyLabel = loan.repayment_frequency === "one_time" ? "One-time repayment" : `${loan.repayment_frequency[0].toUpperCase()}${loan.repayment_frequency.slice(1)} repayments`;

  return (
    <AppScreen
      contentStyle={styles.screenWithAction}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
      refreshing={refreshing}
    >
      <View style={styles.header}>
        <IconButton accessibilityLabel="Back to loans" icon="arrow-left" onPress={() => navigation.goBack()} />
        <View style={styles.headerCopy}>
          <AppText numberOfLines={1} variant="title">{loan.name}</AppText>
          <AppText color="textSubtle" numberOfLines={1} variant="caption">{direction.label} · {loan.counterparty_name}</AppText>
        </View>
        <IconButton accessibilityLabel="Edit loan" icon="pencil-outline" onPress={() => setEditing(true)} />
      </View>

      {error ? <ErrorState text={error} /> : null}
      <AppCard elevated style={[styles.heroCard, { backgroundColor: colors.bgInverse, borderColor: colors.bgInverse }]}>
        <View style={styles.heroTop}>
          <View style={[styles.heroIcon, { backgroundColor: "rgba(255,255,255,0.16)" }]}>
            <MaterialCommunityIcons color="#FFFFFF" name={getLoanIcon(loan.direction)} size={26} />
          </View>
          <StatusTag icon={status.icon} label={status.label} tone={status.tone} />
        </View>
        <AppText style={styles.heroLabel} variant="caption">{direction.action}</AppText>
        <AppText numberOfLines={1} style={styles.heroAmount} variant="title">{formatCurrencyCompact(loan.total_outstanding)}</AppText>
        <ProgressBar accessibilityLabel={`${Math.round(getLoanProgress(loan) * 100)}% principal repaid`} color="#FFFFFF" progress={getLoanProgress(loan)} style={styles.heroProgress} />
        <View style={styles.heroFooter}>
          <AppText style={styles.heroMuted} variant="caption">{formatCurrencyCompact(loan.principal_paid)} principal repaid</AppText>
          <AppText style={styles.heroMuted} variant="caption">{getLoanDueCopy(loan)}</AppText>
        </View>
      </AppCard>

      <AppCard style={styles.scheduleCard}>
        <View style={styles.scheduleTop}>
          <View style={[styles.scheduleIcon, { backgroundColor: colors.accentWash }]}>
            <MaterialCommunityIcons color={colors.accent} name="calendar-clock-outline" size={23} />
          </View>
          <View style={styles.scheduleCopy}>
            <AppText variant="bodyStrong">Repayment plan</AppText>
            <AppText color="textSubtle" variant="caption">{frequencyLabel} · {interestLabel}</AppText>
          </View>
        </View>
        <View style={styles.planLine}>
          <DetailValue label="Next due" value={loan.next_due_date ? formatDateLabel(loan.next_due_date) : "Not set"} />
          <DetailValue label="Planned payment" value={parseAmount(loan.planned_payment_amount) ? formatCurrencyCompact(loan.planned_payment_amount) : "Not set"} align="right" />
        </View>
        {loan.maturity_date ? <AppText color="textMuted" variant="caption">Maturity: {formatDateLabel(loan.maturity_date)}</AppText> : null}
      </AppCard>

      <View style={styles.metricGrid}>
        <MetricTile icon="currency-inr" label="Principal left" value={formatCurrencyCompact(loan.outstanding_principal)} />
        <MetricTile icon="percent-outline" label="Interest due" value={formatCurrencyCompact(loan.outstanding_interest)} />
      </View>

      {(loan.reference_number || loan.account_reference || loan.collateral_note || loan.terms_note || loan.note) ? (
        <LoanDetailsCard loan={loan} />
      ) : null}

      <SectionHeader title="Repayment history" />
      {loan.payments.length ? (
        <AppCard style={styles.historyCard}>
          {loan.payments.map((payment) => <PaymentRow key={payment.id} loan={loan} onPress={() => removePayment(payment)} payment={payment} />)}
        </AppCard>
      ) : (
        <EmptyState body="Every repayment will keep its date, payment method and allocation here." icon="receipt-text-clock-outline" title="No repayments yet" />
      )}

      <LoanFormSheet
        error={editorError}
        loan={loan}
        onClose={() => {
          setEditing(false);
          setEditorError("");
        }}
        onDelete={() => void removeLoan()}
        onSave={(payload) => void saveLoan(payload)}
        saving={saving}
        visible={editing}
      />
      <RepaymentSheet
        error={repaymentError}
        loan={loan}
        onClose={() => {
          setRepaymentOpen(false);
          setRepaymentError("");
        }}
        onSave={(payload) => void addRepayment(payload)}
        saving={paying}
        visible={repaymentOpen}
      />
      {loan.status === "active" ? (
        <BottomActionBar>
          <AppButton block icon="plus" onPress={() => setRepaymentOpen(true)}>Record repayment</AppButton>
        </BottomActionBar>
      ) : null}
    </AppScreen>
  );
}

function DetailValue({ align, label, value }: { align?: "right"; label: string; value: string }) {
  return (
    <View style={[styles.detailValue, align === "right" ? styles.alignRight : null]}>
      <AppText color="textMuted" variant="caption">{label}</AppText>
      <AppText numberOfLines={1} variant="bodyStrong">{value}</AppText>
    </View>
  );
}

function MetricTile({ icon, label, value }: { icon: "currency-inr" | "percent-outline"; label: string; value: string }) {
  const { colors } = useDs();
  return (
    <AppCard style={styles.metricTile}>
      <View style={[styles.metricIcon, { backgroundColor: colors.chipBg }]}>
        <MaterialCommunityIcons color={colors.accent} name={icon} size={19} />
      </View>
      <AppText color="textMuted" numberOfLines={1} variant="caption">{label}</AppText>
      <AppText numberOfLines={1} variant="bodyStrong">{value}</AppText>
    </AppCard>
  );
}

function LoanDetailsCard({ loan }: { loan: Loan }) {
  const values = [
    { label: "Reference", value: loan.reference_number },
    { label: "Account / UPI", value: loan.account_reference },
    { label: "Collateral", value: loan.collateral_note },
    { label: "Terms", value: loan.terms_note },
    { label: "Note", value: loan.note },
  ].filter((item) => item.value);
  return (
    <AppCard style={styles.detailsCard}>
      <AppText style={styles.detailsTitle} variant="bodyStrong">Loan details</AppText>
      {values.map((item) => (
        <View key={item.label} style={styles.detailRow}>
          <AppText color="textMuted" style={styles.detailLabel} variant="caption">{item.label}</AppText>
          <AppText style={styles.detailCopy} variant="caption">{item.value}</AppText>
        </View>
      ))}
    </AppCard>
  );
}

function PaymentRow({ loan, onPress, payment }: { loan: Loan; onPress: () => void; payment: LoanPayment }) {
  const { colors } = useDs();
  const direction = loan.direction === "borrowed" ? "Paid" : "Received";
  const allocation = [
    parseAmount(payment.principal_amount) ? `${formatCurrencyCompact(payment.principal_amount)} principal` : "",
    parseAmount(payment.interest_amount) ? `${formatCurrencyCompact(payment.interest_amount)} interest` : "",
    parseAmount(payment.fee_amount) ? `${formatCurrencyCompact(payment.fee_amount)} fees` : "",
  ].filter(Boolean).join(" · ");
  return (
    <Pressable accessibilityHint="Tap to remove this repayment" accessibilityRole="button" android_ripple={{ color: colors.press }} onPress={onPress}>
      <View style={[styles.paymentRow, { borderBottomColor: colors.border }]}>
        <View style={[styles.paymentIcon, { backgroundColor: loan.direction === "borrowed" ? colors.dangerBg : colors.successBg }]}>
          <MaterialCommunityIcons color={loan.direction === "borrowed" ? colors.danger : colors.success} name={loan.direction === "borrowed" ? "arrow-up-right" : "arrow-down-left"} size={20} />
        </View>
        <View style={styles.paymentCopy}>
          <AppText numberOfLines={1} variant="bodyStrong">{direction} {formatCurrencyCompact(payment.amount)}</AppText>
          <AppText color="textSubtle" numberOfLines={1} variant="caption">{formatDateLabel(payment.payment_date)} · {formatPaymentMethod(payment.payment_method)}</AppText>
          {allocation ? <AppText color="textMuted" numberOfLines={1} variant="caption">{allocation}</AppText> : null}
        </View>
        <MaterialCommunityIcons color={colors.textSubtle} name="chevron-right" size={21} />
      </View>
    </Pressable>
  );
}

function RepaymentSheet({
  error,
  loan,
  onClose,
  onSave,
  saving,
  visible,
}: {
  error: string;
  loan: Loan;
  onClose: () => void;
  onSave: (payload: SaveLoanPaymentPayload) => void;
  saving: boolean;
  visible: boolean;
}) {
  const { colors } = useDs();
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(getTodayDate());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("upi");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [note, setNote] = useState("");
  const [manualAllocation, setManualAllocation] = useState(false);
  const [principal, setPrincipal] = useState("");
  const [interest, setInterest] = useState("");
  const [fees, setFees] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const allocationTotal = useMemo(
    () => parseAmount(principal) + parseAmount(interest) + parseAmount(fees),
    [fees, interest, principal]
  );

  useFocusEffect(
    useCallback(() => {
      if (!visible) return undefined;
      setAmount("");
      setPaymentDate(getTodayDate());
      setPaymentMethod("upi");
      setReferenceNumber("");
      setNote("");
      setManualAllocation(false);
      setPrincipal("");
      setInterest("");
      setFees("");
      setShowDatePicker(false);
      setFieldErrors({});
      return undefined;
    }, [visible])
  );

  const submit = () => {
    const nextErrors: Record<string, string> = {};
    const numericAmount = parseAmount(amount);
    if (numericAmount <= 0) nextErrors.amount = "Enter an amount above ₹0.";
    if (!isValidDate(paymentDate) || !isLoanPaymentDateValid(paymentDate, loan)) {
      nextErrors.date = `Choose a date from ${formatDateLabel(loan.disbursed_date)} through today.`;
    }
    if (manualAllocation && Math.abs(allocationTotal - numericAmount) > 0.005) {
      nextErrors.allocation = "Principal, interest and fees must add up to the repayment amount.";
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    const payload: SaveLoanPaymentPayload = {
      amount: numericAmount.toFixed(2),
      note: note.trim(),
      payment_date: paymentDate,
      payment_method: paymentMethod,
      reference_number: referenceNumber.trim(),
    };
    if (manualAllocation) {
      payload.principal_amount = parseAmount(principal).toFixed(2);
      payload.interest_amount = parseAmount(interest).toFixed(2);
      payload.fee_amount = parseAmount(fees).toFixed(2);
    }
    onSave(payload);
  };

  const onDateChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") setShowDatePicker(false);
    if (event.type === "dismissed" || !selected) return;
    setPaymentDate(toDateInputValue(selected));
    setFieldErrors((current) => ({ ...current, date: "" }));
  };

  return (
    <AppBottomSheet
      footer={<AppButton block disabled={saving} loading={saving} onPress={submit}>Save repayment</AppButton>}
      maxHeight="94%"
      onClose={onClose}
      title={loan.direction === "borrowed" ? "Record repayment" : "Record amount received"}
      visible={visible}
    >
      <ErrorState text={error} />
      <AmountInput error={fieldErrors.amount} onChangeText={(value) => {
        setAmount(sanitizeLoanAmount(value));
        setFieldErrors((current) => ({ ...current, amount: "", allocation: "" }));
      }} value={amount} />
      <AppText color="textMuted" style={styles.amountHint} variant="caption">Outstanding: {formatCurrencyCompact(loan.total_outstanding)}</AppText>

      <DatePickerField error={fieldErrors.date} onPress={() => setShowDatePicker(true)} value={paymentDate} />
      {showDatePicker ? (
        <View style={styles.datePickerWrap}>
          <DateTimePicker
            display={Platform.OS === "ios" ? "spinner" : "default"}
            maximumDate={new Date()}
            minimumDate={fromDateInputValue(loan.disbursed_date)}
            mode="date"
            onChange={onDateChange}
            value={fromDateInputValue(paymentDate)}
          />
          {Platform.OS === "ios" ? <AppButton compact onPress={() => setShowDatePicker(false)} variant="secondary">Done</AppButton> : null}
        </View>
      ) : null}

      <AppText color="textMuted" style={styles.sheetLabel} variant="label">Payment method</AppText>
      <AppSegmentedControl accessibilityLabel="Repayment payment method" items={paymentMethodItems} onChange={setPaymentMethod} value={paymentMethod} />
      <FormField label="Reference number (optional)" onChangeText={setReferenceNumber} placeholder="UPI, bank or receipt reference" style={styles.field} value={referenceNumber} />
      <FormField label="Note (optional)" multiline onChangeText={setNote} placeholder="Anything useful to remember" style={styles.field} value={note} />

      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: manualAllocation }}
        android_ripple={{ color: colors.press }}
        onPress={() => setManualAllocation((current) => !current)}
        style={[styles.allocationToggle, { backgroundColor: colors.chipBg }]}
      >
        <View style={[styles.allocationIcon, { backgroundColor: colors.surface }]}>
          <MaterialCommunityIcons color={colors.accent} name="tune-vertical" size={21} />
        </View>
        <View style={styles.allocationCopy}>
          <AppText variant="bodyStrong">Set allocation manually</AppText>
          <AppText color="textSubtle" variant="caption">Otherwise interest is applied before principal</AppText>
        </View>
        <View style={[styles.switchTrack, { backgroundColor: manualAllocation ? colors.accent : colors.borderStrong }]}>
          <View style={[styles.switchThumb, { alignSelf: manualAllocation ? "flex-end" : "flex-start" }]} />
        </View>
      </Pressable>
      {manualAllocation ? (
        <View style={styles.allocationFields}>
          <FormField keyboardType="decimal-pad" label="Principal" onChangeText={(value) => setPrincipal(sanitizeLoanAmount(value))} placeholder="0" style={styles.field} value={principal} />
          <FormField keyboardType="decimal-pad" label="Interest" onChangeText={(value) => setInterest(sanitizeLoanAmount(value))} placeholder="0" style={styles.field} value={interest} />
          <FormField keyboardType="decimal-pad" label="Fees" onChangeText={(value) => setFees(sanitizeLoanAmount(value))} placeholder="0" style={styles.field} value={fees} />
          <AppText color={fieldErrors.allocation ? "danger" : "textMuted"} style={styles.allocationTotal} variant="caption">
            Allocated {formatCurrencyCompact(allocationTotal)} of {formatCurrencyCompact(amount)}
          </AppText>
          {fieldErrors.allocation ? <AppText color="danger" variant="caption">{fieldErrors.allocation}</AppText> : null}
        </View>
      ) : null}
    </AppBottomSheet>
  );
}

function DatePickerField({ error, onPress, value }: { error?: string; onPress: () => void; value: string }) {
  const { colors } = useDs();
  return (
    <View style={styles.dateFieldWrap}>
      <AppText color="textMuted" style={styles.sheetLabel} variant="label">Payment date</AppText>
      <Pressable accessibilityRole="button" android_ripple={{ color: colors.press }} onPress={onPress} style={[styles.dateField, { borderColor: error ? colors.danger : colors.border }]}>
        <MaterialCommunityIcons color={colors.accent} name="calendar-month-outline" size={22} />
        <AppText style={styles.dateValue} variant="bodyStrong">{formatDateLabel(value)}</AppText>
        <MaterialCommunityIcons color={colors.textSubtle} name="chevron-right" size={22} />
      </Pressable>
      {error ? <AppText color="danger" style={styles.dateError} variant="caption">{error}</AppText> : null}
    </View>
  );
}

function LoanDetailSkeleton() {
  return (
    <>
      <View style={styles.header}>
        <SkeletonBlock height={44} width={44} />
        <View style={styles.headerCopy}><SkeletonBlock height={26} width="68%" /><SkeletonBlock height={12} style={styles.skeletonGap} width="46%" /></View>
      </View>
      <AppCard style={styles.heroSkeleton}><SkeletonBlock height={48} width={48} /><SkeletonBlock height={30} style={styles.skeletonGapLarge} width="68%" /><SkeletonBlock height={8} style={styles.skeletonGapLarge} /></AppCard>
      <AppCard style={styles.scheduleSkeleton}><SkeletonBlock height={20} width="48%" /><SkeletonBlock height={14} style={styles.skeletonGap} width="74%" /></AppCard>
      <View style={styles.metricGrid}><SkeletonBlock height={112} width="48%" /><SkeletonBlock height={112} width="48%" /></View>
    </>
  );
}

const styles = StyleSheet.create({
  alignRight: { alignItems: "flex-end" },
  allocationCopy: { flex: 1, minWidth: 0 },
  allocationFields: { marginTop: dsSpace[1.5] },
  allocationIcon: { alignItems: "center", borderRadius: dsRadius.pill, height: 38, justifyContent: "center", width: 38 },
  allocationToggle: { alignItems: "center", borderRadius: dsRadius.md, flexDirection: "row", gap: dsSpace[1], marginBottom: dsSpace[2], minHeight: 64, paddingHorizontal: dsSpace[1.5] },
  allocationTotal: { marginBottom: dsSpace[0.5], marginTop: -dsSpace[1] },
  amountHint: { marginBottom: dsSpace[2], marginTop: dsSpace[0.5], textAlign: "center" },
  dateError: { marginTop: dsSpace[0.5] },
  dateField: { alignItems: "center", borderRadius: dsRadius.sm, borderWidth: 1, flexDirection: "row", gap: dsSpace[1], minHeight: 56, paddingHorizontal: dsSpace[1.5] },
  dateFieldWrap: { marginBottom: dsSpace[1.5] },
  datePickerWrap: { gap: dsSpace[1], marginBottom: dsSpace[1.5] },
  dateValue: { flex: 1 },
  detailCopy: { flex: 1, minWidth: 0, textAlign: "right" },
  detailLabel: { flexBasis: "32%" },
  detailRow: { flexDirection: "row", gap: dsSpace[1], marginTop: dsSpace[1] },
  detailValue: { flex: 1, minWidth: 0 },
  detailsCard: { borderWidth: 0 },
  detailsTitle: { marginBottom: dsSpace[0.5] },
  field: { marginBottom: dsSpace[1.5] },
  header: { alignItems: "center", flexDirection: "row", gap: dsSpace[1], marginBottom: dsSpace[2] },
  headerCopy: { flex: 1, minWidth: 0 },
  heroAmount: { color: "#FFFFFF", marginBottom: dsSpace[2] },
  heroCard: { borderRadius: dsRadius.lg, padding: dsSpace[3] },
  heroFooter: { flexDirection: "row", gap: dsSpace[1], justifyContent: "space-between", marginTop: dsSpace[1] },
  heroIcon: { alignItems: "center", borderRadius: dsRadius.md, height: 52, justifyContent: "center", width: 52 },
  heroLabel: { color: "rgba(255,255,255,0.72)", marginTop: dsSpace[2] },
  heroMuted: { color: "rgba(255,255,255,0.72)", flex: 1 },
  heroProgress: { backgroundColor: "rgba(255,255,255,0.18)" },
  heroSkeleton: { minHeight: 228, padding: dsSpace[3] },
  heroTop: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" },
  historyCard: { paddingVertical: 0 },
  metricGrid: { flexDirection: "row", gap: dsSpace[1], marginBottom: dsSpace[2] },
  metricIcon: { alignItems: "center", borderRadius: dsRadius.pill, height: 36, justifyContent: "center", marginBottom: dsSpace[1], width: 36 },
  metricTile: { flex: 1, marginBottom: 0, minHeight: 112 },
  paymentCopy: { flex: 1, minWidth: 0 },
  paymentIcon: { alignItems: "center", borderRadius: dsRadius.pill, height: 40, justifyContent: "center", width: 40 },
  paymentRow: { alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: dsSpace[1], minHeight: 76, paddingVertical: dsSpace[1] },
  planLine: { flexDirection: "row", gap: dsSpace[1], marginTop: dsSpace[2] },
  scheduleCard: { borderWidth: 0, padding: dsSpace[2] },
  scheduleCopy: { flex: 1, minWidth: 0 },
  scheduleIcon: { alignItems: "center", borderRadius: dsRadius.md, height: 48, justifyContent: "center", width: 48 },
  scheduleSkeleton: { minHeight: 122, padding: dsSpace[2] },
  scheduleTop: { alignItems: "center", flexDirection: "row", gap: dsSpace[1.5] },
  screenWithAction: { paddingBottom: 112 },
  sheetLabel: { marginBottom: dsSpace[0.5] },
  skeletonGap: { marginTop: dsSpace[1] },
  skeletonGapLarge: { marginTop: dsSpace[2] },
  switchThumb: { backgroundColor: "#FFFFFF", borderRadius: dsRadius.pill, height: 18, margin: 3, width: 18 },
  switchTrack: { borderRadius: dsRadius.pill, height: 24, justifyContent: "center", width: 44 },
});
