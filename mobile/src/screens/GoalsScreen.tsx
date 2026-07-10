import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import {
  AppCard,
  AppScreen,
  AppSegmentedControl,
  AppText,
  EmptyState,
  ErrorState,
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
import { useAppSettings } from "../context/AppSettingsContext";
import { useI18n } from "../i18n";
import { GoalFormSheet } from "../features/goals/GoalFormSheet";
import {
  getGoalHealthMeta,
  getGoalIcon,
  getGoalProgress,
  getProgressTone,
  goalColorWash,
  safeGoalColor,
} from "../features/goals/goalUi";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { createGoal, getGoals, getGoalTemplates } from "../services/expenseApi";
import { getApiErrorMessage } from "../services/apiClient";
import type { Goal, GoalTemplate, SaveGoalPayload } from "../types/api";
import { formatCurrencyCompact, formatDateLabel, parseAmount } from "../utils/format";

type Props = NativeStackScreenProps<RootStackParamList, "Goals">;
type GoalFilter = "active" | "completed";

const filterItems: Array<{ label: string; value: GoalFilter }> = [
  { label: "Active", value: "active" },
  { label: "Completed", value: "completed" },
];

export function GoalsScreen({ navigation }: Props) {
  const { colors } = useDs();
  const { themeMode } = useAppSettings();
  const { success } = useFeedback();
  const { t } = useI18n();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [templates, setTemplates] = useState<GoalTemplate[]>([]);
  const [filter, setFilter] = useState<GoalFilter>("active");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [initialTemplate, setInitialTemplate] = useState<GoalTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState("");

  const activeGoals = useMemo(() => goals.filter((goal) => goal.status === "active"), [goals]);
  const completedGoals = useMemo(() => goals.filter((goal) => goal.status === "completed"), [goals]);
  const visibleGoals = filter === "active" ? activeGoals : completedGoals;
  const totalSaved = activeGoals.reduce((sum, goal) => sum + parseAmount(goal.saved_amount), 0);
  const totalTarget = activeGoals.reduce((sum, goal) => sum + parseAmount(goal.target_amount), 0);
  const overallProgress = totalTarget > 0 ? Math.min(1, totalSaved / totalTarget) : 0;
  const heroBackground = themeMode === "dark" ? colors.accent : colors.bgInverse;
  const heroIconBackground = themeMode === "dark" ? "#0A0B0D" : colors.accent;

  const load = useCallback(async (showInitialLoading = false) => {
    if (showInitialLoading) setLoading(true);
    setError("");
    try {
      const [goalRows, templateRows] = await Promise.all([
        getGoals(),
        getGoalTemplates().catch(() => [] as GoalTemplate[]),
      ]);
      setGoals(goalRows);
      setTemplates(templateRows);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, t("Could not load goals. Check your connection and try again.")));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void load(true);
    }, [load])
  );

  const openEditor = (template: GoalTemplate | null = null) => {
    setInitialTemplate(template);
    setEditorError("");
    setEditorOpen(true);
  };

  const saveGoal = async (payload: SaveGoalPayload) => {
    setSaving(true);
    setEditorError("");
    try {
      const created = await createGoal(payload);
      success();
      setEditorOpen(false);
        setNotice(t("Goal created. Your monthly plan is ready."));
      setGoals((current) => [created, ...current]);
      navigation.navigate("GoalDetail", { created: true, goalId: created.id });
    } catch (saveError) {
      setEditorError(getApiErrorMessage(saveError, t("Could not create goal. Try again.")));
    } finally {
      setSaving(false);
    }
  };

  const refresh = () => {
    setRefreshing(true);
    void load();
  };

  return (
    <AppScreen onRefresh={refresh} refreshing={refreshing}>
      <View style={styles.header}>
        <IconButton accessibilityLabel={t("Back to home")} icon="arrow-left" onPress={() => navigation.goBack()} />
        <View style={styles.headerText}>
          <AppText variant="title">{t("Goals")}</AppText>
        </View>
        <IconButton accessibilityLabel={t("Create goal")} icon="plus" onPress={() => openEditor()} tone="primary" />
      </View>

      {notice ? <SuccessNotice onDismiss={() => setNotice("")} text={notice} /> : null}
      {error && goals.length ? <ErrorState text={error} /> : null}

      {loading && !goals.length ? (
        <GoalsSkeleton />
      ) : error && !goals.length ? (
        <EmptyState
          action={t("Try again")}
          body={error}
          icon="cloud-alert-outline"
          onAction={() => void load(true)}
          title={t("Goals are unavailable")}
        />
      ) : (
        <>
          {activeGoals.length ? (
          <AppCard elevated style={[styles.overviewCard, { backgroundColor: heroBackground, borderColor: heroBackground }]}>
            <View style={styles.overviewTop}>
              <View style={styles.overviewCopy}>
                <AppText style={styles.inverseMuted} variant="caption">
                  Saved
                </AppText>
                <AppText numberOfLines={1} style={styles.inverseTitle} variant="title">
                  {formatCurrencyCompact(totalSaved)}
                </AppText>
                <AppText style={styles.inverseMuted} variant="body">
                  {formatCurrencyCompact(totalTarget)} target
                </AppText>
              </View>
              <View style={[styles.overviewIcon, { backgroundColor: heroIconBackground }]}>
                <MaterialCommunityIcons color="#FFFFFF" name="flag-checkered" size={26} />
              </View>
            </View>
            <ProgressBar
              accessibilityLabel={`${Math.round(overallProgress * 100)}% saved`}
              color="#FFFFFF"
              progress={overallProgress}
              style={styles.overviewProgress}
            />
          </AppCard>
          ) : null}

          {templates.length ? (
            <>
              <SectionHeader title="Quick start" />
              <ScrollView
                contentContainerStyle={styles.templateRail}
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                {templates.map((template) => (
                  <GoalTemplateCard key={template.key} onPress={() => openEditor(template)} template={template} />
                ))}
              </ScrollView>
            </>
          ) : null}

          {goals.length ? (
            <>
              <View style={styles.goalSectionHeader}>
                <SectionHeader title="Goals" />
                <AppSegmentedControl
                  accessibilityLabel="Goal status"
                  items={filterItems.map((item) => ({ ...item, label: t(item.label) }))}
                  onChange={setFilter}
                  style={styles.filterControl}
                  value={filter}
                />
              </View>
              {visibleGoals.length ? (
                visibleGoals.map((goal) => (
                  <GoalCard
                    goal={goal}
                    key={goal.id}
                    onPress={() => navigation.navigate("GoalDetail", { goalId: goal.id })}
                  />
                ))
              ) : (
                <EmptyState
                  action={filter === "active" ? "Create goal" : undefined}
                  icon={filter === "active" ? "flag-outline" : "trophy-outline"}
                  onAction={filter === "active" ? () => openEditor() : undefined}
                  title={filter === "active" ? "No active goals" : "No completed goals yet"}
                />
              )}
            </>
          ) : (
            <EmptyState
              action="Create goal"
              icon="target"
              onAction={() => openEditor()}
              title="No goals yet"
            />
          )}
        </>
      )}

      <GoalFormSheet
        error={editorError}
        initialTemplate={initialTemplate}
        onClose={() => setEditorOpen(false)}
        onSave={saveGoal}
        saving={saving}
        templates={templates}
        visible={editorOpen}
      />
    </AppScreen>
  );
}

function GoalTemplateCard({ onPress, template }: { onPress: () => void; template: GoalTemplate }) {
  const { colors } = useDs();
  return (
    <Pressable
      accessibilityLabel={`Create ${template.name} goal`}
      accessibilityRole="button"
      android_ripple={{ color: colors.press }}
      onPress={onPress}
      style={[styles.quickStartCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={[styles.quickStartIcon, { backgroundColor: colors.chipBg }]}>
        <MaterialCommunityIcons color={colors.accent} name={getGoalIcon(template.icon, template.key)} size={24} />
      </View>
      <View style={styles.quickStartText}>
        <AppText numberOfLines={2} variant="bodyStrong">
          {template.name}
        </AppText>
        <AppText color="textSubtle" numberOfLines={1} variant="caption">
          {template.suggested_months} months
        </AppText>
      </View>
      <MaterialCommunityIcons color={colors.textSubtle} name="arrow-top-right" size={20} />
    </Pressable>
  );
}

function GoalCard({ goal, onPress }: { goal: Goal; onPress: () => void }) {
  const { colors } = useDs();
  const color = safeGoalColor(goal.color, colors.accent);
  const health = getGoalHealthMeta(goal.health_status);
  const progress = getGoalProgress(goal);

  return (
    <Pressable accessibilityRole="button" android_ripple={{ color: colors.press }} onPress={onPress}>
      <AppCard elevated style={styles.goalCard}>
        <View style={styles.goalTop}>
          <View style={[styles.goalIcon, { backgroundColor: goalColorWash(color) }]}>
            <MaterialCommunityIcons color={color} name={getGoalIcon(goal.icon, goal.template_key)} size={24} />
          </View>
          <View style={styles.goalTitleWrap}>
            <AppText numberOfLines={2} variant="headline">
              {goal.name}
            </AppText>
            <AppText color="textSubtle" numberOfLines={1} variant="caption">
              Target {formatDateLabel(goal.target_date)}
            </AppText>
          </View>
          <StatusTag icon={health.icon} label={health.label} tone={health.tone} />
        </View>

        <View style={styles.amountRow}>
          <AppText numberOfLines={1} variant="bodyStrong">
            {formatCurrencyCompact(goal.saved_amount)}
          </AppText>
          <AppText color="textSubtle" numberOfLines={1} variant="caption">
            of {formatCurrencyCompact(goal.target_amount)}
          </AppText>
        </View>
        <ProgressBar progress={progress} tone={getProgressTone(goal.health_status)} />

        <View style={styles.goalFooter}>
          <View style={styles.monthlyCopy}>
            <AppText color="textMuted" variant="caption">
              {goal.status === "completed" ? "Goal reached" : "Monthly contribution"}
            </AppText>
            <AppText numberOfLines={1} variant="bodyStrong">
              {goal.status === "completed"
                ? formatDateLabel(goal.completed_at?.slice(0, 10) ?? goal.target_date)
                : formatCurrencyCompact(goal.required_monthly_contribution)}
            </AppText>
          </View>
          <View style={[styles.openButton, { backgroundColor: colors.chipBg }]}>
            <MaterialCommunityIcons color={colors.text} name="arrow-right" size={20} />
          </View>
        </View>
      </AppCard>
    </Pressable>
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
      <AppText color="success" style={styles.successText} variant="caption">
        {text}
      </AppText>
      <MaterialCommunityIcons color={colors.success} name="close" size={18} />
    </Pressable>
  );
}

function GoalsSkeleton() {
  return (
    <>
      <AppCard style={styles.overviewSkeleton}>
        <SkeletonBlock height={14} width="44%" />
        <SkeletonBlock height={34} style={styles.skeletonGap} width="58%" />
        <SkeletonBlock height={8} style={styles.skeletonGap} />
      </AppCard>
      <View style={styles.skeletonRail}>
        <SkeletonBlock height={118} width="48%" />
        <SkeletonBlock height={118} width="48%" />
      </View>
      {[0, 1].map((row) => (
        <AppCard key={row} style={styles.goalSkeleton}>
          <View style={styles.skeletonTitleRow}>
            <SkeletonBlock height={48} width={48} />
            <View style={styles.skeletonCopy}>
              <SkeletonBlock height={16} width="70%" />
              <SkeletonBlock height={12} style={styles.skeletonGapSmall} width="45%" />
            </View>
          </View>
          <SkeletonBlock height={8} style={styles.skeletonGap} />
        </AppCard>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  amountRow: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: dsSpace[0.5],
    marginBottom: dsSpace[1],
  },
  filterControl: {
    marginBottom: dsSpace[2],
  },
  goalCard: {
    padding: dsSpace[2],
  },
  goalFooter: {
    alignItems: "center",
    flexDirection: "row",
    gap: dsSpace[1],
    marginTop: dsSpace[2],
  },
  goalIcon: {
    alignItems: "center",
    borderRadius: dsRadius.md,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  goalSectionHeader: {
    marginTop: dsSpace[1],
  },
  goalSkeleton: {
    minHeight: 150,
  },
  goalTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  goalTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: dsSpace[1],
    marginBottom: dsSpace[2],
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
  inverseMuted: {
    color: "rgba(255,255,255,0.72)",
  },
  inverseTitle: {
    color: "#FFFFFF",
    marginVertical: dsSpace[0.5],
  },
  monthlyCopy: {
    flex: 1,
    minWidth: 0,
  },
  openButton: {
    alignItems: "center",
    borderRadius: dsRadius.pill,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  overviewCard: {
    borderRadius: dsRadius.lg,
    padding: dsSpace[3],
  },
  overviewCopy: {
    flex: 1,
    minWidth: 0,
  },
  overviewIcon: {
    alignItems: "center",
    borderRadius: dsRadius.pill,
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  overviewProgress: {
    backgroundColor: "rgba(255,255,255,0.18)",
    marginTop: dsSpace[2],
  },
  overviewSkeleton: {
    minHeight: 180,
    padding: dsSpace[3],
  },
  overviewTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: dsSpace[1.5],
  },
  quickStartCard: {
    alignItems: "center",
    borderRadius: dsRadius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: dsSpace[1],
    minHeight: 88,
    padding: dsSpace[1.5],
    width: 246,
  },
  quickStartIcon: {
    alignItems: "center",
    borderRadius: dsRadius.md,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  quickStartText: {
    flex: 1,
    minWidth: 0,
  },
  skeletonCopy: {
    flex: 1,
    minWidth: 0,
  },
  skeletonGap: {
    marginTop: dsSpace[1.5],
  },
  skeletonGapSmall: {
    marginTop: dsSpace[1],
  },
  skeletonRail: {
    flexDirection: "row",
    gap: dsSpace[1],
    marginBottom: dsSpace[2],
  },
  skeletonTitleRow: {
    flexDirection: "row",
    gap: dsSpace[1.5],
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
  successText: {
    flex: 1,
  },
  templateRail: {
    gap: dsSpace[1],
    marginBottom: dsSpace[2],
    paddingRight: dsSpace[2],
  },
});
