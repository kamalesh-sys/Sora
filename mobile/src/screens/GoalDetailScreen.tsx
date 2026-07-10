import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
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
  dsColorPrimitives,
  dsRadius,
  dsSpace,
  useDs,
} from "../design-system";
import { useAppSettings } from "../context/AppSettingsContext";
import { useFeedback } from "../context/FeedbackContext";
import { GoalFormSheet } from "../features/goals/GoalFormSheet";
import {
  fromDateInputValue,
  getGoalHealthMeta,
  getGoalIcon,
  getGoalProgress,
  goalColorWash,
  safeGoalColor,
  sanitizeGoalAmount,
  toDateInputValue,
} from "../features/goals/goalUi";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { getApiErrorMessage } from "../services/apiClient";
import {
  addGoalContribution,
  deleteGoal,
  getGoal,
  getGoalTemplates,
  skipGoalMonth,
  undoGoalMonthSkip,
  updateGoal,
} from "../services/expenseApi";
import type { Goal, GoalTemplate, SaveGoalPayload } from "../types/api";
import { getCurrentMonth, getTodayDate, isValidDate } from "../utils/date";
import {
  formatCurrencyCompact,
  formatDateLabel,
  formatMonthLabel,
  parseAmount,
} from "../utils/format";

type Props = NativeStackScreenProps<RootStackParamList, "GoalDetail">;

export function GoalDetailScreen({ navigation, route }: Props) {
  const { colors } = useDs();
  const { themeMode } = useAppSettings();
  const { success } = useFeedback();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [templates, setTemplates] = useState<GoalTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(route.params.created ? "Goal created. Your monthly plan is ready." : "");
  const [editing, setEditing] = useState(false);
  const [contributing, setContributing] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sheetError, setSheetError] = useState("");

  const load = useCallback(async (showInitialLoading = false) => {
    if (showInitialLoading) setLoading(true);
    setError("");
    try {
      const [nextGoal, nextTemplates] = await Promise.all([
        getGoal(route.params.goalId),
        getGoalTemplates().catch(() => [] as GoalTemplate[]),
      ]);
      setGoal(nextGoal);
      setTemplates(nextTemplates);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, "Could not load this goal. Try again."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [route.params.goalId]);

  useFocusEffect(
    useCallback(() => {
      void load(true);
    }, [load])
  );

  const openContribution = () => {
    setSheetError("");
    setContributing(true);
  };

  const openEditor = () => {
    setSheetError("");
    setEditing(true);
  };

  const openSkip = () => {
    setSheetError("");
    setSkipping(true);
  };

  const saveEdit = async (payload: SaveGoalPayload) => {
    if (!goal) return;
    setSaving(true);
    setSheetError("");
    try {
      const updated = await updateGoal(goal.id, payload);
      setGoal(updated);
      setEditing(false);
      setNotice("Goal updated. The monthly plan has been recalculated.");
      success();
    } catch (saveError) {
      setSheetError(getApiErrorMessage(saveError, "Could not update goal. Try again."));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    if (!goal) return;
    Alert.alert(
      "Delete goal?",
      `This permanently removes ${goal.name} and its contribution history.`,
      [
        { text: "Keep goal", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setSaving(true);
            setError("");
            try {
              await deleteGoal(goal.id);
              navigation.navigate("Goals");
            } catch (deleteError) {
              setError(getApiErrorMessage(deleteError, "Could not delete goal."));
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const confirmUndoSkip = (skipId: number, month: string) => {
    if (!goal) return;
    Alert.alert(
      "Restore this month?",
      `${formatMonthLabel(month.slice(0, 7))} will return to the plan and the monthly contribution will recalculate.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          onPress: async () => {
            setSaving(true);
            setError("");
            try {
              const result = await undoGoalMonthSkip(goal.id, skipId);
              setGoal(result.goal);
              setNotice("Month restored. Your plan has been recalculated.");
            } catch (undoError) {
              setError(getApiErrorMessage(undoError, "Could not restore this month."));
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const refresh = () => {
    setRefreshing(true);
    void load();
  };

  if (loading && !goal) {
    return (
      <AppScreen>
        <DetailHeader navigation={navigation} onDelete={confirmDelete} onEdit={openEditor} />
        <GoalDetailSkeleton />
      </AppScreen>
    );
  }

  if (!goal) {
    return (
      <AppScreen>
        <DetailHeader navigation={navigation} onDelete={confirmDelete} onEdit={openEditor} />
        <EmptyState
          action="Try again"
          body={error || "This goal may have been removed."}
          icon="target-variant"
          onAction={() => void load(true)}
          title="Goal not available"
        />
      </AppScreen>
    );
  }

  const health = getGoalHealthMeta(goal.health_status);
  const progress = getGoalProgress(goal);
  const goalColor = safeGoalColor(goal.color, colors.accent);
  const heroBackground = themeMode === "dark" ? colors.accent : colors.bgInverse;
  const heroIconBackground = themeMode === "dark" ? "#0A0B0D" : "rgba(255,255,255,0.16)";
  const contributions = goal.contributions ?? [];
  const skippedMonths = goal.skipped_months ?? [];
  const active = goal.status === "active";

  return (
    <>
      <AppScreen
        contentStyle={active ? styles.screenWithAction : undefined}
        onRefresh={refresh}
        refreshing={refreshing}
      >
        <DetailHeader navigation={navigation} onDelete={confirmDelete} onEdit={openEditor} />

        {notice ? <SuccessNotice onDismiss={() => setNotice("")} text={notice} /> : null}
        <ErrorState text={error} />

        <AppCard
          elevated
          style={[styles.heroCard, { backgroundColor: heroBackground, borderColor: heroBackground }]}
        >
          <View style={styles.heroTop}>
            <View style={[styles.heroIcon, { backgroundColor: heroIconBackground }]}>
              <MaterialCommunityIcons
                color="#FFFFFF"
                name={getGoalIcon(goal.icon, goal.template_key)}
                size={28}
              />
            </View>
            <StatusTag icon={health.icon} label={health.label} tone={health.tone} />
          </View>
          <AppText style={styles.heroTitle} variant="title">
            {goal.name}
          </AppText>
          <View style={styles.heroAmountRow}>
            <AppText numberOfLines={1} style={styles.heroAmount} variant="title">
              {formatCurrencyCompact(goal.saved_amount)}
            </AppText>
            <AppText numberOfLines={1} style={styles.heroTarget} variant="caption">
              of {formatCurrencyCompact(goal.target_amount)}
            </AppText>
          </View>
          <ProgressBar
            accessibilityLabel={`${Math.round(progress * 100)}% of ${goal.name} saved`}
            color={dsColorPrimitives.gray0}
            progress={progress}
            style={styles.heroProgress}
          />
          <View style={styles.heroFooter}>
            <AppText style={styles.heroTarget} variant="caption">
              {Math.round(progress * 100)}% saved
            </AppText>
            <AppText style={styles.heroTarget} variant="caption">
              Target {formatDateLabel(goal.target_date)}
            </AppText>
          </View>
        </AppCard>

        {goal.status === "completed" ? (
          <CompletionCard completedAt={goal.completed_at} goalColor={goalColor} />
        ) : (
          <PlanCard goal={goal} onAdd={openContribution} onEdit={openEditor} onSkip={openSkip} />
        )}

        <View style={styles.metricsGrid}>
          <MetricTile
            icon="wallet-outline"
            label="Still to save"
            value={formatCurrencyCompact(goal.remaining_amount)}
          />
          <MetricTile
            icon="calendar-range"
            label="Time left"
            value={goal.status === "completed" ? "Done" : `${goal.remaining_month_count} mo`}
          />
        </View>

        {goal.health_status === "at_risk" || goal.health_status === "overdue" ? (
          <HealthCard goal={goal} onAdd={openContribution} onEdit={openEditor} />
        ) : null}

        <SectionHeader title="Contribution history" />
        {contributions.length ? (
          <AppCard style={styles.historyCard}>
            {contributions.map((contribution, index) => (
              <View
                key={contribution.id}
                style={[
                  styles.historyRow,
                  index < contributions.length - 1 ? { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth } : null,
                ]}
              >
                <View style={[styles.historyIcon, { backgroundColor: colors.successBg }]}>
                  <MaterialCommunityIcons color={colors.success} name="arrow-down" size={20} />
                </View>
                <View style={styles.historyCopy}>
                  <AppText variant="bodyStrong">
                    {contribution.note || (index === contributions.length - 1 ? "First contribution" : "Contribution")}
                  </AppText>
                  <AppText color="textSubtle" variant="caption">
                    {formatDateLabel(contribution.contribution_date)}
                  </AppText>
                </View>
                <AppText numberOfLines={1} style={{ color: colors.success }} variant="bodyStrong">
                  +{formatCurrencyCompact(contribution.amount)}
                </AppText>
              </View>
            ))}
          </AppCard>
        ) : (
          <EmptyState
            action={active ? "Add first contribution" : undefined}
            icon="history"
            onAction={active ? openContribution : undefined}
            title="No contributions yet"
          />
        )}

        {skippedMonths.length ? (
          <>
            <SectionHeader title="Plan changes" />
            <AppCard style={styles.historyCard}>
              {skippedMonths.map((skip, index) => (
                <View
                  key={skip.id}
                  style={[
                    styles.skipRow,
                    index < skippedMonths.length - 1 ? { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth } : null,
                  ]}
                >
                  <View style={[styles.historyIcon, { backgroundColor: colors.warningBg }]}>
                    <MaterialCommunityIcons color={colors.warning} name="calendar-remove-outline" size={20} />
                  </View>
                  <View style={styles.historyCopy}>
                    <AppText variant="bodyStrong">Skipped {formatMonthLabel(skip.month.slice(0, 7))}</AppText>
                  </View>
                  {active ? (
                    <AppButton
                      compact
                      disabled={saving}
                      onPress={() => confirmUndoSkip(skip.id, skip.month)}
                      variant="tertiary"
                    >
                      Undo
                    </AppButton>
                  ) : null}
                </View>
              ))}
            </AppCard>
          </>
        ) : null}

        <View style={styles.dangerZone}>
          <AppButton icon="trash-can-outline" onPress={confirmDelete} variant="tertiary">
            Delete goal
          </AppButton>
        </View>

        <GoalFormSheet
          error={sheetError}
          goal={goal}
          onClose={() => setEditing(false)}
          onSave={saveEdit}
          saving={saving}
          templates={templates}
          visible={editing}
        />

        <ContributionSheet
          error={sheetError}
          goal={goal}
          onClose={() => setContributing(false)}
          onSave={async (amount, contributionDate, note, addToExpenses) => {
            setSaving(true);
            setSheetError("");
            try {
              const result = await addGoalContribution(goal.id, {
                amount,
                add_to_expenses: addToExpenses,
                contribution_date: contributionDate,
                note,
              });
              setGoal(result.goal);
              setContributing(false);
              setNotice(
                result.just_completed
                  ? "Goal complete. You reached the target."
                  : "Contribution added. Your plan is up to date."
              );
              success();
            } catch (saveError) {
              setSheetError(getApiErrorMessage(saveError, "Could not add contribution. Try again."));
            } finally {
              setSaving(false);
            }
          }}
          saving={saving}
          visible={contributing}
        />

        <SkipMonthSheet
          error={sheetError}
          goal={goal}
          onClose={() => setSkipping(false)}
          onConfirm={async () => {
            setSaving(true);
            setSheetError("");
            try {
              const result = await skipGoalMonth(goal.id, getCurrentMonth());
              setGoal(result.goal);
              setSkipping(false);
              setNotice("Month skipped. Your monthly contribution has been recalculated.");
              success();
            } catch (skipError) {
              setSheetError(getApiErrorMessage(skipError, "Could not skip this month. Try again."));
            } finally {
              setSaving(false);
            }
          }}
          saving={saving}
          visible={skipping}
        />
      </AppScreen>

      {active ? (
        <BottomActionBar>
          <AppButton block icon="plus" onPress={openContribution}>
            Add contribution
          </AppButton>
        </BottomActionBar>
      ) : null}
    </>
  );
}

function DetailHeader({
  navigation,
  onDelete,
  onEdit,
}: {
  navigation: Props["navigation"];
  onDelete: () => void;
  onEdit: () => void;
}) {
  return (
    <View style={styles.header}>
      <IconButton accessibilityLabel="Back to goals" icon="arrow-left" onPress={() => navigation.goBack()} />
      <View style={styles.headerText}>
        <AppText variant="headline">Goal details</AppText>
      </View>
      <IconButton accessibilityLabel="Edit goal" icon="pencil-outline" onPress={onEdit} tone="primary" />
      <IconButton accessibilityLabel="Delete goal" icon="trash-can-outline" onPress={onDelete} tone="danger" />
    </View>
  );
}

function PlanCard({
  goal,
  onAdd,
  onEdit,
  onSkip,
}: {
  goal: Goal;
  onAdd: () => void;
  onEdit: () => void;
  onSkip: () => void;
}) {
  const { colors } = useDs();
  const overdue = goal.health_status === "overdue";
  return (
    <AppCard style={[styles.planCard, { backgroundColor: overdue ? colors.dangerBg : colors.accentWash }]}>
      <View style={styles.planTop}>
        <View style={[styles.planIcon, { backgroundColor: overdue ? colors.dangerBg : colors.surface }]}>
          <MaterialCommunityIcons
            color={overdue ? colors.danger : colors.accent}
            name={overdue ? "calendar-alert" : "calendar-sync-outline"}
            size={24}
          />
        </View>
        <View style={styles.planCopy}>
          <AppText color="textMuted" variant="caption">
            {overdue ? "Target date passed" : "Required each month"}
          </AppText>
          <AppText numberOfLines={1} variant="title">
            {overdue ? formatCurrencyCompact(goal.remaining_amount) : formatCurrencyCompact(goal.required_monthly_contribution)}
          </AppText>
          <AppText color="textMuted" variant="caption">
            {overdue
              ? "remaining to finish"
              : `${goal.remaining_month_count} ${goal.remaining_month_count === 1 ? "month" : "months"} left`}
          </AppText>
        </View>
      </View>
      <View style={styles.planActions}>
        <AppButton compact onPress={overdue ? onEdit : onAdd} variant="secondary">
          {overdue ? "Change date" : "Add this amount"}
        </AppButton>
        {!overdue && goal.can_skip_current_month ? (
          <AppButton compact onPress={onSkip} variant="tertiary">
            Skip month
          </AppButton>
        ) : null}
      </View>
    </AppCard>
  );
}

function CompletionCard({ completedAt, goalColor }: { completedAt: string | null; goalColor: string }) {
  const { colors } = useDs();
  return (
    <AppCard style={[styles.completionCard, { backgroundColor: colors.successBg }] }>
      <View style={[styles.completionIcon, { backgroundColor: goalColorWash(goalColor) }]}>
        <MaterialCommunityIcons color={goalColor} name="trophy-outline" size={28} />
      </View>
      <View style={styles.completionCopy}>
        <AppText variant="headline">Goal complete</AppText>
        <AppText color="textMuted" variant="caption">
          {completedAt ? formatDateLabel(completedAt.slice(0, 10)) : "Completed"}
        </AppText>
      </View>
    </AppCard>
  );
}

function MetricTile({
  icon,
  label,
  value,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  value: string;
}) {
  const { colors } = useDs();
  return (
    <AppCard style={styles.metricTile}>
      <MaterialCommunityIcons color={colors.textMuted} name={icon} size={20} />
      <AppText color="textMuted" variant="caption">
        {label}
      </AppText>
      <AppText numberOfLines={1} variant="headline">
        {value}
      </AppText>
    </AppCard>
  );
}

function HealthCard({ goal, onAdd, onEdit }: { goal: Goal; onAdd: () => void; onEdit: () => void }) {
  const { colors } = useDs();
  const health = getGoalHealthMeta(goal.health_status);
  const background =
    goal.health_status === "completed"
      ? colors.successBg
      : goal.health_status === "at_risk"
        ? colors.warningBg
        : goal.health_status === "overdue"
          ? colors.dangerBg
          : colors.infoBg;
  const foreground =
    goal.health_status === "completed"
      ? colors.success
      : goal.health_status === "at_risk"
        ? colors.warning
        : goal.health_status === "overdue"
          ? colors.danger
          : colors.info;
  return (
    <AppCard style={[styles.healthCard, { backgroundColor: background }] }>
      <View style={styles.healthTitleRow}>
        <MaterialCommunityIcons color={foreground} name={health.icon} size={22} />
        <AppText style={{ color: foreground }} variant="bodyStrong">
          {health.label}
        </AppText>
      </View>
      {goal.health_status === "at_risk" ? (
        <View style={styles.healthActionRow}>
          <AppButton compact onPress={onAdd} variant="secondary">
            Add {formatCurrencyCompact(goal.shortfall_amount)}
          </AppButton>
        </View>
      ) : goal.health_status === "overdue" ? (
        <View style={styles.healthActionRow}>
          <AppButton compact onPress={onEdit} variant="secondary">
            Edit target date
          </AppButton>
        </View>
      ) : null}
    </AppCard>
  );
}

function ContributionSheet({
  error,
  goal,
  onClose,
  onSave,
  saving,
  visible,
}: {
  error: string;
  goal: Goal;
  onClose: () => void;
  onSave: (amount: string, date: string, note: string, addToExpenses: boolean) => void;
  saving: boolean;
  visible: boolean;
}) {
  const { colors } = useDs();
  const amountRef = useRef<TextInput>(null);
  const defaultAmount = Math.min(
    parseAmount(goal.required_monthly_contribution) || parseAmount(goal.remaining_amount),
    parseAmount(goal.remaining_amount)
  );
  const [amount, setAmount] = useState(defaultAmount > 0 ? defaultAmount.toFixed(2) : "");
  const [contributionDate, setContributionDate] = useState(getTodayDate());
  const [note, setNote] = useState("");
  const [addToExpenses, setAddToExpenses] = useState(false);
  const [amountTouched, setAmountTouched] = useState(false);
  const [dateError, setDateError] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!visible) return;
      const suggested = Math.min(
        parseAmount(goal.required_monthly_contribution) || parseAmount(goal.remaining_amount),
        parseAmount(goal.remaining_amount)
      );
      setAmount(suggested > 0 ? suggested.toFixed(2) : "");
      setContributionDate(getTodayDate());
      setNote("");
      setAddToExpenses(false);
      setAmountTouched(false);
      setDateError("");
      setShowDatePicker(false);
      setTimeout(() => amountRef.current?.focus(), 150);
    }, [goal.remaining_amount, goal.required_monthly_contribution, visible])
  );

  const numericAmount = parseAmount(amount);
  const amountError = amountTouched && numericAmount <= 0 ? "Enter an amount greater than 0." : "";
  const quickAmounts = useMemo(
    () =>
      Array.from(new Set([500, 1000, Math.round(defaultAmount)].filter((value) => value > 0))).slice(0, 3),
    [defaultAmount]
  );

  const submit = () => {
    setAmountTouched(true);
    if (numericAmount <= 0) return;
    if (!isValidDate(contributionDate) || contributionDate > getTodayDate()) {
      setDateError("Choose today or an earlier date.");
      return;
    }
    onSave(numericAmount.toFixed(2), contributionDate, note.trim(), addToExpenses);
  };

  const onDateChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === "android") setShowDatePicker(false);
    if (event.type === "dismissed" || !date) return;
    setContributionDate(toDateInputValue(date));
    setDateError("");
  };

  return (
    <AppBottomSheet
      footer={
        <AppButton block disabled={saving} loading={saving} onPress={submit}>
          Add contribution
        </AppButton>
      }
      maxHeight="94%"
      onClose={onClose}
      title="Add contribution"
      visible={visible}
    >
      <ErrorState text={error} />
      <AmountInput
        error={amountError}
        onChangeText={(value) => setAmount(sanitizeGoalAmount(value))}
        ref={amountRef}
        value={amount}
      />
      <View style={styles.quickAmountRow}>
        {quickAmounts.map((value) => (
          <AppButton compact key={value} onPress={() => setAmount(String(value))} variant="secondary">
            {formatCurrencyCompact(value)}
          </AppButton>
        ))}
      </View>

      <AppText color="textMuted" style={styles.sheetLabel} variant="label">
        Date
      </AppText>
      <Pressable
        accessibilityRole="button"
        android_ripple={{ color: colors.press }}
        onPress={() => setShowDatePicker(true)}
        style={[styles.contributionDate, { borderColor: dateError ? colors.danger : colors.border }]}
      >
        <MaterialCommunityIcons color={colors.accent} name="calendar-month-outline" size={22} />
        <AppText style={styles.contributionDateText} variant="bodyStrong">
          {formatDateLabel(contributionDate)}
        </AppText>
        <MaterialCommunityIcons color={colors.textSubtle} name="chevron-right" size={22} />
      </Pressable>
      {dateError ? (
        <AppText color="danger" style={styles.sheetErrorText} variant="caption">
          {dateError}
        </AppText>
      ) : null}
      {showDatePicker ? (
        <View style={styles.datePickerWrap}>
          <DateTimePicker
            display={Platform.OS === "ios" ? "spinner" : "default"}
            maximumDate={new Date()}
            mode="date"
            onChange={onDateChange}
            value={fromDateInputValue(contributionDate)}
          />
          {Platform.OS === "ios" ? (
            <AppButton compact onPress={() => setShowDatePicker(false)} variant="secondary">
              Done
            </AppButton>
          ) : null}
        </View>
      ) : null}

      <FormField
        label="Note (optional)"
        onChangeText={setNote}
        placeholder="Salary saving, extra income"
        style={styles.noteField}
        value={note}
      />
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: addToExpenses }}
        android_ripple={{ color: colors.press }}
        onPress={() => setAddToExpenses((current) => !current)}
        style={[styles.expenseToggle, { backgroundColor: colors.chipBg, borderColor: colors.border }]}
      >
        <View style={[styles.expenseToggleIcon, { backgroundColor: colors.surface }]}>
          <MaterialCommunityIcons color={colors.accent} name="receipt-text-plus-outline" size={21} />
        </View>
        <AppText style={styles.expenseToggleLabel} variant="bodyStrong">Add to expenses</AppText>
        <View style={[styles.expenseToggleTrack, { backgroundColor: addToExpenses ? colors.accent : colors.borderStrong }]}>
          <View style={[styles.expenseToggleThumb, { alignSelf: addToExpenses ? "flex-end" : "flex-start" }]} />
        </View>
      </Pressable>
      {numericAmount >= parseAmount(goal.remaining_amount) && numericAmount > 0 ? (
        <View style={[styles.finishHint, { backgroundColor: colors.successBg }]}>
          <MaterialCommunityIcons color={colors.success} name="party-popper" size={20} />
          <AppText color="textMuted" style={styles.finishHintText} variant="caption">
            This contribution will complete the goal.
          </AppText>
        </View>
      ) : null}
    </AppBottomSheet>
  );
}

function SkipMonthSheet({
  error,
  goal,
  onClose,
  onConfirm,
  saving,
  visible,
}: {
  error: string;
  goal: Goal;
  onClose: () => void;
  onConfirm: () => void;
  saving: boolean;
  visible: boolean;
}) {
  const { colors } = useDs();
  const currentMonthly = parseAmount(goal.required_monthly_contribution);
  const monthsAfterSkip = Math.max(1, goal.remaining_month_count - 1);
  const recalculated = parseAmount(goal.remaining_amount) / monthsAfterSkip;
  const increase = Math.max(0, recalculated - currentMonthly);

  return (
    <AppBottomSheet
      footer={
        <View style={styles.sheetFooterActions}>
          <AppButton block disabled={saving} loading={saving} onPress={onConfirm}>
            Skip and recalculate
          </AppButton>
          <AppButton block disabled={saving} onPress={onClose} variant="tertiary">
            Keep this month
          </AppButton>
        </View>
      }
      maxHeight="86%"
      onClose={onClose}
      title="Skip this month?"
      visible={visible}
    >
      <ErrorState text={error} />
      <View style={[styles.skipHeroIcon, { backgroundColor: colors.warningBg }]}>
        <MaterialCommunityIcons color={colors.warning} name="calendar-arrow-right" size={30} />
      </View>
      <AppText style={styles.skipTitle} variant="headline">
        Give the plan a little room
      </AppText>
      <AppText color="textMuted" style={styles.skipBody} variant="body">
        No money is removed. Sora will mark {formatMonthLabel(getCurrentMonth())} as skipped and spread the remaining amount across the time left.
      </AppText>

      <View style={styles.previewGrid}>
        <PreviewTile label="Now" value={formatCurrencyCompact(currentMonthly)} />
        <View style={[styles.previewArrow, { backgroundColor: colors.chipBg }]}>
          <MaterialCommunityIcons color={colors.textMuted} name="arrow-right" size={20} />
        </View>
        <PreviewTile label="After skip" tone={colors.warning} value={formatCurrencyCompact(recalculated)} />
      </View>

      <View style={[styles.impactNote, { backgroundColor: colors.warningBg }]}>
        <MaterialCommunityIcons color={colors.warning} name="information-outline" size={20} />
        <AppText color="textMuted" style={styles.impactCopy} variant="caption">
          {increase > 0
            ? `The monthly contribution may rise by about ${formatCurrencyCompact(increase)}.`
            : "The target date leaves enough room, so the monthly amount should stay similar."}
        </AppText>
      </View>
    </AppBottomSheet>
  );
}

function PreviewTile({ label, tone, value }: { label: string; tone?: string; value: string }) {
  return (
    <View style={styles.previewTile}>
      <AppText color="textMuted" variant="caption">
        {label}
      </AppText>
      <AppText numberOfLines={1} style={tone ? { color: tone } : undefined} variant="headline">
        {value}
      </AppText>
      <AppText color="textSubtle" variant="caption">
        per month
      </AppText>
    </View>
  );
}

function SuccessNotice({ onDismiss, text }: { onDismiss: () => void; text: string }) {
  const { colors } = useDs();
  return (
    <Pressable
      accessibilityHint="Dismiss message"
      accessibilityRole="button"
      onPress={onDismiss}
      style={[styles.successNotice, { backgroundColor: colors.successBg }]}
    >
      <MaterialCommunityIcons color={colors.success} name="check-circle" size={20} />
      <AppText color="success" style={styles.successNoticeText} variant="caption">
        {text}
      </AppText>
      <MaterialCommunityIcons color={colors.success} name="close" size={18} />
    </Pressable>
  );
}

function GoalDetailSkeleton() {
  return (
    <>
      <AppCard style={styles.heroSkeleton}>
        <SkeletonBlock height={48} width={48} />
        <SkeletonBlock height={34} style={styles.skeletonGap} width="72%" />
        <SkeletonBlock height={18} style={styles.skeletonGap} width="48%" />
        <SkeletonBlock height={8} style={styles.skeletonGap} />
      </AppCard>
      <AppCard style={styles.planSkeleton}>
        <SkeletonBlock height={18} width="42%" />
        <SkeletonBlock height={34} style={styles.skeletonGap} width="58%" />
      </AppCard>
      <View style={styles.metricsGrid}>
        <SkeletonBlock height={112} width="48%" />
        <SkeletonBlock height={112} width="48%" />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  completionCard: {
    alignItems: "center",
    borderWidth: 0,
    flexDirection: "row",
    gap: dsSpace[1.5],
  },
  completionCopy: {
    flex: 1,
    minWidth: 0,
  },
  completionIcon: {
    alignItems: "center",
    borderRadius: dsRadius.pill,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  contributionDate: {
    alignItems: "center",
    borderRadius: dsRadius.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: dsSpace[1],
    minHeight: 56,
    paddingHorizontal: dsSpace[1.5],
  },
  contributionDateText: {
    flex: 1,
  },
  dangerZone: {
    alignItems: "center",
    marginBottom: dsSpace[2],
    marginTop: dsSpace[1],
  },
  expenseToggle: {
    alignItems: "center",
    borderRadius: dsRadius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: dsSpace[1],
    marginBottom: dsSpace[1.5],
    minHeight: 60,
    paddingHorizontal: dsSpace[1.5],
  },
  expenseToggleIcon: {
    alignItems: "center",
    borderRadius: dsRadius.pill,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  expenseToggleLabel: {
    flex: 1,
  },
  expenseToggleThumb: {
    backgroundColor: "#FFFFFF",
    borderRadius: dsRadius.pill,
    height: 18,
    margin: 3,
    width: 18,
  },
  expenseToggleTrack: {
    borderRadius: dsRadius.pill,
    height: 24,
    justifyContent: "center",
    width: 44,
  },
  datePickerWrap: {
    gap: dsSpace[1],
    marginBottom: dsSpace[1.5],
  },
  finishHint: {
    alignItems: "center",
    borderRadius: dsRadius.md,
    flexDirection: "row",
    gap: dsSpace[1],
    marginBottom: dsSpace[1],
    padding: dsSpace[1.5],
  },
  finishHintText: {
    flex: 1,
  },
  healthActionRow: {
    alignItems: "flex-start",
    marginTop: dsSpace[1.5],
  },
  healthCard: {
    borderWidth: 0,
  },
  healthTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: dsSpace[1],
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
  heroAmount: {
    color: "#FFFFFF",
  },
  heroAmountRow: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: dsSpace[0.5],
    marginBottom: dsSpace[1],
    marginTop: dsSpace[2.5],
  },
  heroCard: {
    borderRadius: dsRadius.lg,
    padding: dsSpace[3],
  },
  heroFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: dsSpace[1],
  },
  heroIcon: {
    alignItems: "center",
    borderRadius: dsRadius.md,
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  heroProgress: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  heroSkeleton: {
    minHeight: 260,
    padding: dsSpace[3],
  },
  heroTarget: {
    color: "rgba(255,255,255,0.72)",
  },
  heroTitle: {
    color: "#FFFFFF",
    marginTop: dsSpace[2],
  },
  heroTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  historyCard: {
    paddingVertical: 0,
  },
  historyCopy: {
    flex: 1,
    minWidth: 0,
  },
  historyIcon: {
    alignItems: "center",
    borderRadius: dsRadius.pill,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  historyRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: dsSpace[1],
    minHeight: 72,
    paddingVertical: dsSpace[1],
  },
  impactCopy: {
    flex: 1,
  },
  impactNote: {
    alignItems: "flex-start",
    borderRadius: dsRadius.md,
    flexDirection: "row",
    gap: dsSpace[1],
    marginBottom: dsSpace[1],
    padding: dsSpace[1.5],
  },
  metricTile: {
    flex: 1,
    gap: dsSpace[0.5],
    marginBottom: 0,
    minHeight: 112,
  },
  metricsGrid: {
    flexDirection: "row",
    gap: dsSpace[1],
    marginBottom: dsSpace[2],
  },
  noteField: {
    marginBottom: dsSpace[1.5],
  },
  planActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: dsSpace[1],
    marginTop: dsSpace[2],
  },
  planCard: {
    borderWidth: 0,
    padding: dsSpace[2],
  },
  planCopy: {
    flex: 1,
    minWidth: 0,
  },
  planIcon: {
    alignItems: "center",
    borderRadius: dsRadius.md,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  planSkeleton: {
    minHeight: 150,
    padding: dsSpace[2],
  },
  planTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: dsSpace[1.5],
  },
  previewArrow: {
    alignItems: "center",
    borderRadius: dsRadius.pill,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  previewGrid: {
    alignItems: "center",
    flexDirection: "row",
    gap: dsSpace[1],
    marginBottom: dsSpace[2],
  },
  previewTile: {
    flex: 1,
    minWidth: 0,
  },
  quickAmountRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: dsSpace[1],
    marginBottom: dsSpace[2],
    marginTop: dsSpace[1],
  },
  screenWithAction: {
    paddingBottom: 112,
  },
  sheetErrorText: {
    marginTop: dsSpace[0.5],
  },
  sheetFooterActions: {
    gap: dsSpace[0.5],
  },
  sheetLabel: {
    marginBottom: dsSpace[0.5],
  },
  skipBody: {
    marginBottom: dsSpace[2],
    textAlign: "center",
  },
  skipHeroIcon: {
    alignItems: "center",
    alignSelf: "center",
    borderRadius: dsRadius.pill,
    height: 64,
    justifyContent: "center",
    width: 64,
  },
  skipRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: dsSpace[1],
    minHeight: 72,
    paddingVertical: dsSpace[1],
  },
  skipTitle: {
    marginBottom: dsSpace[0.5],
    marginTop: dsSpace[1.5],
    textAlign: "center",
  },
  skeletonGap: {
    marginTop: dsSpace[1.5],
  },
  successNotice: {
    alignItems: "center",
    borderRadius: dsRadius.md,
    flexDirection: "row",
    gap: dsSpace[1],
    marginBottom: dsSpace[1.5],
    minHeight: 48,
    paddingHorizontal: dsSpace[1.5],
  },
  successNoticeText: {
    flex: 1,
  },
});
