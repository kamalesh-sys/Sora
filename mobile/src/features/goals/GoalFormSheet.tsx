import { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import {
  AppBottomSheet,
  AppButton,
  AppText,
  ErrorState,
  FormField,
  dsRadius,
  dsSpace,
  useDs,
} from "../../design-system";
import type { Goal, GoalTemplate, SaveGoalPayload } from "../../types/api";
import { isValidDate } from "../../utils/date";
import { formatDateLabel, parseAmount } from "../../utils/format";
import {
  defaultGoalDate,
  fromDateInputValue,
  goalColorPresets,
  goalColorWash,
  getGoalIcon,
  isFutureDate,
  sanitizeGoalAmount,
  toDateInputValue,
} from "./goalUi";

type GoalFormSheetProps = {
  error?: string;
  goal?: Goal | null;
  initialTemplate?: GoalTemplate | null;
  onClose: () => void;
  onSave: (payload: SaveGoalPayload) => void;
  saving: boolean;
  templates: GoalTemplate[];
  visible: boolean;
};

type FieldErrors = {
  amount?: string;
  date?: string;
  name?: string;
};

export function GoalFormSheet({
  error,
  goal,
  initialTemplate,
  onClose,
  onSave,
  saving,
  templates,
  visible,
}: GoalFormSheetProps) {
  const { colors } = useDs();
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [targetDate, setTargetDate] = useState(defaultGoalDate());
  const [templateKey, setTemplateKey] = useState("");
  const [icon, setIcon] = useState("star-four-points-outline");
  const [color, setColor] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    if (!visible) return;

    const template = initialTemplate ?? null;
    setName(goal?.name ?? template?.name ?? "");
    setTargetAmount(goal?.target_amount ?? "");
    setTargetDate(goal?.target_date ?? defaultGoalDate(template?.suggested_months ?? 12));
    setTemplateKey(goal?.template_key ?? template?.key ?? "");
    setIcon(goal?.icon ?? template?.icon ?? "star-four-points-outline");
    setColor(goal?.color ?? template?.color ?? "");
    setFieldErrors({});
    setShowDatePicker(false);
  }, [goal, initialTemplate, visible]);

  const applyTemplate = (template: GoalTemplate) => {
    setTemplateKey(template.key);
    setName(template.name);
    setIcon(template.icon);
    setColor(template.color);
    setTargetDate(defaultGoalDate(template.suggested_months));
    setFieldErrors((current) => ({ ...current, date: undefined, name: undefined }));
  };

  const validate = () => {
    const next: FieldErrors = {};
    const amount = parseAmount(targetAmount);
    const savedAmount = parseAmount(goal?.saved_amount);

    if (!name.trim()) next.name = "Give your goal a short name.";
    if (!Number.isFinite(amount) || amount <= 0) {
      next.amount = "Enter a target amount greater than 0.";
    } else if (goal && amount < savedAmount) {
      next.amount = "Target cannot be lower than the amount already saved.";
    }
    if (!isValidDate(targetDate)) {
      next.date = "Choose a valid target date.";
    } else if (goal?.status !== "completed" && !isFutureDate(targetDate)) {
      next.date = "Choose a date after today.";
    }

    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = () => {
    if (!validate()) return;
    const amount = parseAmount(targetAmount);
    onSave({
      color: color || undefined,
      icon,
      name: name.trim(),
      target_amount: amount.toFixed(2),
      target_date: targetDate,
      template_key: templateKey || undefined,
    });
  };

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === "android") setShowDatePicker(false);
    if (event.type === "dismissed" || !selectedDate) return;
    setTargetDate(toDateInputValue(selectedDate));
    setFieldErrors((current) => ({ ...current, date: undefined }));
  };

  return (
    <AppBottomSheet
      footer={
        <AppButton block disabled={saving} loading={saving} onPress={submit}>
          {goal ? "Save changes" : "Create goal"}
        </AppButton>
      }
      maxHeight="94%"
      onClose={onClose}
      title={goal ? "Edit goal" : "New goal"}
      visible={visible}
    >
      <ErrorState text={error} />

      {!goal && templates.length ? (
        <View style={styles.templateSection}>
          <AppText color="textMuted" style={styles.label} variant="label">
            Start with a template
          </AppText>
          <ScrollView
            contentContainerStyle={styles.templateRail}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {templates.map((template) => {
              const active = template.key === templateKey;
              return (
                <Pressable
                  accessibilityLabel={`Use ${template.name} template`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  android_ripple={{ color: colors.press }}
                  key={template.key}
                  onPress={() => applyTemplate(template)}
                  style={[
                    styles.templateCard,
                    {
                      backgroundColor: active ? goalColorWash(template.color) : colors.surfaceAlt,
                      borderColor: active ? template.color : colors.border,
                    },
                  ]}
                >
                  <View style={[styles.templateIcon, { backgroundColor: goalColorWash(template.color) }]}>
                    <MaterialCommunityIcons
                      color={template.color}
                      name={getGoalIcon(template.icon, template.key)}
                      size={22}
                    />
                  </View>
                  <AppText numberOfLines={2} variant="label">
                    {template.name}
                  </AppText>
                  <AppText color="textSubtle" numberOfLines={1} variant="caption">
                    {template.suggested_months} months
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      <FormField
        error={fieldErrors.name}
        label="Goal name"
        onChangeText={(value) => {
          setName(value);
          setFieldErrors((current) => ({ ...current, name: undefined }));
        }}
        placeholder="Emergency fund, new laptop"
        returnKeyType="next"
        style={styles.fieldGap}
        value={name}
      />
      <FormField
        error={fieldErrors.amount}
        keyboardType="decimal-pad"
        label="Target amount (₹)"
        onChangeText={(value) => {
          setTargetAmount(sanitizeGoalAmount(value));
          setFieldErrors((current) => ({ ...current, amount: undefined }));
        }}
        placeholder="100000"
        style={styles.fieldGap}
        value={targetAmount}
      />

      <AppText color="textMuted" style={styles.label} variant="label">
        Target date
      </AppText>
      <Pressable
        accessibilityLabel={`Target date ${targetDate}`}
        accessibilityRole="button"
        android_ripple={{ color: colors.press }}
        onPress={() => setShowDatePicker(true)}
        style={[
          styles.dateField,
          {
            backgroundColor: colors.surface,
            borderColor: fieldErrors.date ? colors.danger : colors.border,
          },
        ]}
      >
        <View style={[styles.dateIcon, { backgroundColor: colors.accentWash }]}>
          <MaterialCommunityIcons color={colors.accent} name="calendar-month-outline" size={22} />
        </View>
        <View style={styles.dateText}>
          <AppText variant="bodyStrong">{formatDateLabel(targetDate)}</AppText>
        </View>
        <MaterialCommunityIcons color={colors.textSubtle} name="chevron-right" size={22} />
      </Pressable>
      {fieldErrors.date ? (
        <AppText color="danger" style={styles.helperText} variant="caption">
          {fieldErrors.date}
        </AppText>
      ) : null}
      <View style={styles.colorSection}>
        <AppText color="textMuted" style={styles.label} variant="label">
          Goal color
        </AppText>
        <View style={styles.colorRow}>
          {goalColorPresets.map((preset) => {
            const selected = color === preset.value;
            return (
              <Pressable
                accessibilityLabel={`${preset.label} goal color`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                android_ripple={{ color: colors.press }}
                key={preset.value}
                onPress={() => setColor(preset.value)}
                style={[
                  styles.colorOption,
                  { borderColor: selected ? colors.text : colors.border },
                ]}
              >
                <View style={[styles.colorSwatch, { backgroundColor: preset.value }]}>
                  {selected ? <MaterialCommunityIcons color={colors.surface} name="check" size={18} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
      {showDatePicker ? (
        <View style={styles.datePickerWrap}>
          <DateTimePicker
            display={Platform.OS === "ios" ? "spinner" : "default"}
            minimumDate={goal?.status === "completed" ? undefined : new Date(Date.now() + 86400000)}
            mode="date"
            onChange={handleDateChange}
            value={fromDateInputValue(targetDate)}
          />
          {Platform.OS === "ios" ? (
            <AppButton compact onPress={() => setShowDatePicker(false)} variant="secondary">
              Done
            </AppButton>
          ) : null}
        </View>
      ) : null}

    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  colorOption: {
    alignItems: "center",
    borderRadius: dsRadius.pill,
    borderWidth: 2,
    height: 40,
    justifyContent: "center",
    padding: 3,
    width: 40,
  },
  colorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: dsSpace[1],
  },
  colorSection: {
    marginBottom: dsSpace[1.5],
    marginTop: dsSpace[1.5],
  },
  colorSwatch: {
    alignItems: "center",
    borderRadius: dsRadius.pill,
    height: "100%",
    justifyContent: "center",
    width: "100%",
  },
  dateField: {
    alignItems: "center",
    borderRadius: dsRadius.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: dsSpace[1.5],
    minHeight: 64,
    padding: dsSpace[1],
  },
  dateIcon: {
    alignItems: "center",
    borderRadius: dsRadius.sm,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  datePickerWrap: {
    gap: dsSpace[1],
    marginBottom: dsSpace[1.5],
  },
  dateText: {
    flex: 1,
    minWidth: 0,
  },
  fieldGap: {
    marginBottom: dsSpace[1.5],
  },
  helperText: {
    marginBottom: dsSpace[1.5],
    marginTop: dsSpace[0.5],
  },
  label: {
    marginBottom: dsSpace[0.5],
  },
  templateCard: {
    borderRadius: dsRadius.md,
    borderWidth: 1,
    gap: dsSpace[0.5],
    minHeight: 104,
    padding: dsSpace[1],
    width: 126,
  },
  templateIcon: {
    alignItems: "center",
    borderRadius: dsRadius.sm,
    height: 36,
    justifyContent: "center",
    marginBottom: dsSpace[0.5],
    width: 36,
  },
  templateRail: {
    gap: dsSpace[1],
    paddingBottom: dsSpace[0.5],
    paddingRight: dsSpace[2],
  },
  templateSection: {
    marginBottom: dsSpace[2],
  },
});
