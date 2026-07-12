import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import {
  AppButton,
  AppCard,
  AppScreen,
  AppSegmentedControl,
  AppText,
  EmptyState,
  ErrorState,
  IconButton,
  ProgressBar,
  SkeletonBlock,
  StatusTag,
  dsRadius,
  dsSpace,
  useDs,
} from "../design-system";
import { useFeedback } from "../context/FeedbackContext";
import { LoanFormSheet } from "../features/loans/LoanFormSheet";
import {
  getLoanDirectionCopy,
  getLoanDueCopy,
  getLoanIcon,
  getLoanProgress,
  getLoanStatusMeta,
} from "../features/loans/loanUi";
import { useI18n } from "../i18n";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { getApiErrorMessage } from "../services/apiClient";
import { createLoan, deleteLoan, getLoans, updateLoan } from "../services/expenseApi";
import type { Loan, LoanDirection, SaveLoanPayload } from "../types/api";
import { formatCurrencyCompact } from "../utils/format";

type Props = NativeStackScreenProps<RootStackParamList, "Loans">;
type LoanFilter = "all" | LoanDirection;

const filterItems: Array<{ icon: "view-grid-outline" | "arrow-down-left" | "arrow-up-right"; label: string; value: LoanFilter }> = [
  { icon: "view-grid-outline", label: "All", value: "all" },
  { icon: "arrow-down-left", label: "Borrowed", value: "borrowed" },
  { icon: "arrow-up-right", label: "Lent", value: "lent" },
];

export function LoansScreen({ navigation }: Props) {
  const { colors } = useDs();
  const { success } = useFeedback();
  const { t } = useI18n();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [filter, setFilter] = useState<LoanFilter>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState("");
  const loadRequestRef = useRef(0);

  const load = useCallback(async ({ reset = false }: { reset?: boolean } = {}) => {
    const requestId = ++loadRequestRef.current;
    if (reset) {
      setLoading(true);
      setLoans([]);
    }
    setError("");
    try {
      const rows = await getLoans();
      if (requestId !== loadRequestRef.current) return;
      setLoans(rows);
    } catch (loadError) {
      if (requestId !== loadRequestRef.current) return;
      setLoans([]);
      setError(getApiErrorMessage(loadError, t("Could not load loans. Check your connection and try again.")));
    } finally {
      if (requestId !== loadRequestRef.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void load({ reset: true });
      return () => {
        loadRequestRef.current += 1;
      };
    }, [load])
  );

  const visibleLoans = useMemo(
    () => (filter === "all" ? loans : loans.filter((loan) => loan.direction === filter)),
    [filter, loans]
  );
  const borrowedOutstanding = useMemo(
    () => loans.filter((loan) => loan.direction === "borrowed").reduce((sum, loan) => sum + Number(loan.total_outstanding), 0),
    [loans]
  );
  const lentOutstanding = useMemo(
    () => loans.filter((loan) => loan.direction === "lent").reduce((sum, loan) => sum + Number(loan.total_outstanding), 0),
    [loans]
  );

  const openCreate = () => {
    setEditingLoan(null);
    setEditorError("");
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingLoan(null);
    setEditorError("");
  };

  const saveLoan = async (payload: SaveLoanPayload) => {
    setSaving(true);
    setEditorError("");
    try {
      if (editingLoan) {
        const updated = await updateLoan(editingLoan.id, payload);
        setLoans((current) => current.map((loan) => (loan.id === updated.id ? updated : loan)));
      } else {
        const created = await createLoan(payload);
        setLoans((current) => [created, ...current]);
      }
      success();
      closeEditor();
    } catch (saveError) {
      setEditorError(getApiErrorMessage(saveError, t("Could not save this loan. Try again.")));
    } finally {
      setSaving(false);
    }
  };

  const removeLoan = async () => {
    if (!editingLoan) return;
    setSaving(true);
    setEditorError("");
    try {
      await deleteLoan(editingLoan.id);
      setLoans((current) => current.filter((loan) => loan.id !== editingLoan.id));
      success();
      closeEditor();
    } catch (deleteError) {
      setEditorError(getApiErrorMessage(deleteError, t("This loan could not be deleted.")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppScreen onRefresh={() => {
      setRefreshing(true);
      void load();
    }} refreshing={refreshing}>
      <View style={styles.header}>
        <IconButton accessibilityLabel={t("Back to profile")} icon="arrow-left" onPress={() => navigation.goBack()} />
        <View style={styles.headerCopy}>
          <AppText variant="title">Loans</AppText>
        </View>
        <IconButton accessibilityLabel={t("Create loan")} icon="plus" onPress={openCreate} tone="primary" />
      </View>

      {error && loans.length ? <ErrorState text={error} /> : null}
      {loading && !loans.length ? (
        <LoansSkeleton />
      ) : error && !loans.length ? (
        <EmptyState action="Try again" body={error} icon="cloud-alert-outline" onAction={() => void load({ reset: true })} title="Loans are unavailable" />
      ) : (
        <>
          <View style={styles.summaryGrid}>
            <SummaryCard amount={borrowedOutstanding} icon="arrow-down-left" label="You owe" tone="danger" />
            <SummaryCard amount={lentOutstanding} icon="arrow-up-right" label="Owed to you" tone="success" />
          </View>

          {loans.length ? (
            <>
              <AppSegmentedControl accessibilityLabel="Loan direction filter" items={filterItems} onChange={setFilter} style={styles.filter} value={filter} />
              {visibleLoans.length ? (
                visibleLoans.map((loan) => (
                  <LoanCard key={loan.id} loan={loan} onPress={() => navigation.push("LoanDetail", { loanId: loan.id })} />
                ))
              ) : (
                <EmptyState action="Add loan" icon="filter-variant" onAction={openCreate} title="Nothing here yet" />
              )}
            </>
          ) : (
            <EmptyState
              action="Add a loan"
              actionSpacing="loose"
              icon="hand-coin-outline"
              onAction={openCreate}
              title="No loans yet"
            />
          )}
        </>
      )}

      <LoanFormSheet
        error={editorError}
        loan={editingLoan}
        onClose={closeEditor}
        onDelete={() => void removeLoan()}
        onSave={(payload) => void saveLoan(payload)}
        saving={saving}
        visible={editorOpen}
      />
    </AppScreen>
  );
}

function SummaryCard({ amount, icon, label, tone }: { amount: number; icon: "arrow-down-left" | "arrow-up-right"; label: string; tone: "danger" | "success" }) {
  const { colors } = useDs();
  const palette = tone === "danger" ? { background: colors.dangerBg, color: colors.danger } : { background: colors.successBg, color: colors.success };
  return (
    <AppCard style={[styles.summaryCard, { backgroundColor: palette.background, borderColor: palette.background }]}>
      <View style={styles.summaryTop}>
        <View style={[styles.summaryIcon, { backgroundColor: colors.surface }]}>
          <MaterialCommunityIcons color={palette.color} name={icon} size={21} />
        </View>
        <AppText color="textMuted" variant="caption">{label}</AppText>
      </View>
      <AppText numberOfLines={1} style={{ color: palette.color }} variant="headline">{formatCurrencyCompact(amount)}</AppText>
    </AppCard>
  );
}

function LoanCard({ loan, onPress }: { loan: Loan; onPress: () => void }) {
  const { colors } = useDs();
  const status = getLoanStatusMeta(loan.display_status);
  const direction = getLoanDirectionCopy(loan.direction);
  return (
    <Pressable accessibilityRole="button" android_ripple={{ color: colors.press }} onPress={onPress}>
      <AppCard elevated style={styles.loanCard}>
        <View style={styles.loanTop}>
          <View style={[styles.loanIcon, { backgroundColor: loan.direction === "borrowed" ? colors.dangerBg : colors.successBg }]}>
            <MaterialCommunityIcons color={loan.direction === "borrowed" ? colors.danger : colors.success} name={getLoanIcon(loan.direction)} size={22} />
          </View>
          <View style={styles.loanCopy}>
            <AppText numberOfLines={1} variant="headline">{loan.name}</AppText>
            <AppText color="textSubtle" numberOfLines={1} variant="caption">{direction.label} · {loan.counterparty_name}</AppText>
          </View>
          <StatusTag icon={status.icon} label={status.label} tone={status.tone} />
        </View>
        <View style={styles.amountRow}>
          <View>
            <AppText color="textMuted" variant="caption">Outstanding</AppText>
            <AppText numberOfLines={1} variant="bodyStrong">{formatCurrencyCompact(loan.total_outstanding)}</AppText>
          </View>
          <AppText color={loan.display_status === "overdue" ? "danger" : "textSubtle"} numberOfLines={1} style={styles.dueCopy} variant="caption">{getLoanDueCopy(loan)}</AppText>
        </View>
        <ProgressBar accessibilityLabel={`${Math.round(getLoanProgress(loan) * 100)}% principal repaid`} progress={getLoanProgress(loan)} tone={loan.direction === "borrowed" ? "danger" : "success"} />
      </AppCard>
    </Pressable>
  );
}

function LoansSkeleton() {
  return (
    <>
      <View style={styles.summaryGrid}>
        <SkeletonBlock height={122} width="48%" />
        <SkeletonBlock height={122} width="48%" />
      </View>
      <SkeletonBlock height={48} style={styles.filter} />
      {[0, 1, 2].map((item) => (
        <AppCard key={item} style={styles.skeletonCard}>
          <View style={styles.skeletonTop}>
            <SkeletonBlock height={44} width={44} />
            <View style={styles.skeletonCopy}>
              <SkeletonBlock height={16} width="68%" />
              <SkeletonBlock height={12} style={styles.skeletonGap} width="44%" />
            </View>
          </View>
          <SkeletonBlock height={12} style={styles.skeletonGapLarge} width="42%" />
          <SkeletonBlock height={8} style={styles.skeletonGap} />
        </AppCard>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  amountRow: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between", marginBottom: dsSpace[1.5] },
  dueCopy: { flex: 1, marginLeft: dsSpace[1], textAlign: "right" },
  filter: { marginBottom: dsSpace[2] },
  header: { alignItems: "center", flexDirection: "row", gap: dsSpace[1], marginBottom: dsSpace[2] },
  headerCopy: { flex: 1, minWidth: 0 },
  loanCard: { padding: dsSpace[2] },
  loanCopy: { flex: 1, minWidth: 0 },
  loanIcon: { alignItems: "center", borderRadius: dsRadius.md, height: 44, justifyContent: "center", width: 44 },
  loanTop: { alignItems: "flex-start", flexDirection: "row", gap: dsSpace[1], marginBottom: dsSpace[2] },
  skeletonCard: { minHeight: 146 },
  skeletonCopy: { flex: 1, minWidth: 0 },
  skeletonGap: { marginTop: dsSpace[1] },
  skeletonGapLarge: { marginTop: dsSpace[2] },
  skeletonTop: { flexDirection: "row", gap: dsSpace[1.5] },
  summaryCard: { flex: 1, marginBottom: 0, minHeight: 122, padding: dsSpace[1.5] },
  summaryGrid: { flexDirection: "row", gap: dsSpace[1], marginBottom: dsSpace[2] },
  summaryIcon: { alignItems: "center", borderRadius: dsRadius.pill, height: 36, justifyContent: "center", width: 36 },
  summaryTop: { alignItems: "center", flexDirection: "row", gap: dsSpace[1], marginBottom: dsSpace[2] },
});
