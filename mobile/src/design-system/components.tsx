import { forwardRef, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets, type Edge } from "react-native-safe-area-context";

import { BottomNav, BottomNavKey } from "../components/BottomNav";
import { useAppSettings } from "../context/AppSettingsContext";
import { useSoraResponsive } from "../theme/responsive";
import { dsRadius, dsShadow, dsSize, dsSpace, dsTouch, dsTypography, makeDsColors } from "./tokens";

const localeSystemFont = Platform.select({ android: "sans-serif", ios: "System", default: "System" });

export function useDs() {
  const { accentColor, themeMode } = useAppSettings();
  return useMemo(() => ({ colors: makeDsColors(themeMode, accentColor) }), [accentColor, themeMode]);
}

type AppTextVariant = keyof typeof dsTypography;

export function AppText({
  children,
  color = "text",
  style,
  variant = "body",
  ...props
}: TextProps & {
  color?: keyof ReturnType<typeof makeDsColors>;
  variant?: AppTextVariant;
}) {
  const { colors } = useDs();
  const { language, t } = useAppSettings();
  const localizedChildren = typeof children === "string" ? t(children) : children;
  return (
    <Text
      {...props}
      style={[
        dsTypography[variant],
        { color: colors[color] },
        style,
        language === "en" ? null : { fontFamily: localeSystemFont },
      ]}
    >
      {localizedChildren}
    </Text>
  );
}

export function AppScreen({
  bottomNavCurrent,
  children,
  contentStyle,
  onRefresh,
  refreshing,
  scroll = true,
}: {
  bottomNavCurrent?: BottomNavKey;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  onRefresh?: () => void;
  refreshing?: boolean;
  scroll?: boolean;
}) {
  const { colors } = useDs();
  const responsive = useSoraResponsive();
  const safeAreaEdges: Edge[] | undefined = bottomNavCurrent ? ["top", "left", "right"] : undefined;
  const content = [
    styles.screenContent,
    {
      maxWidth: responsive.maxContentWidth,
      paddingBottom: bottomNavCurrent ? responsive.screen.bottomNavPadding + dsSpace[2] : dsSpace[3],
      paddingHorizontal: responsive.screen.contentPaddingX,
      paddingTop: responsive.compact ? dsSpace[1] : dsSpace[2],
    },
    contentStyle,
  ];

  return (
    <SafeAreaView edges={safeAreaEdges} style={[styles.safeArea, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 18}
        style={styles.flex}
      >
        {scroll ? (
          <ScrollView
            contentContainerStyle={content}
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            refreshControl={
              typeof refreshing === "boolean" && onRefresh ? (
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
              ) : undefined
            }
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[content, styles.flex]}>{children}</View>
        )}
      </KeyboardAvoidingView>
      {bottomNavCurrent ? <BottomNav current={bottomNavCurrent} /> : null}
    </SafeAreaView>
  );
}

export function AppCard({
  children,
  elevated = false,
  style,
}: {
  children: ReactNode;
  elevated?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useDs();
  return (
    <View
      style={[
        styles.card,
        elevated ? dsShadow.low : dsShadow.none,
        { backgroundColor: colors.surface, borderColor: colors.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function AppButton({
  accessibilityLabel,
  block = false,
  children,
  compact = false,
  disabled,
  endIcon,
  icon,
  loading,
  onPress,
  style,
  variant = "primary",
}: {
  accessibilityLabel?: string;
  block?: boolean;
  children: ReactNode;
  compact?: boolean;
  disabled?: boolean;
  endIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  loading?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  variant?: "primary" | "secondary" | "tertiary" | "danger";
}) {
  const { colors } = useDs();
  const { t } = useAppSettings();
  const scale = useRef(new Animated.Value(1)).current;
  const isDisabled = disabled || loading;
  const variantStyle =
    variant === "danger"
      ? { backgroundColor: colors.danger, borderColor: colors.danger, text: "#FFFFFF" }
      : variant === "secondary"
        ? { backgroundColor: colors.chipBg, borderColor: colors.chipBg, text: colors.text }
        : variant === "tertiary"
          ? { backgroundColor: "transparent", borderColor: "transparent", text: colors.accent }
          : { backgroundColor: colors.accent, borderColor: colors.accent, text: "#FFFFFF" };

  const animate = (toValue: number) => {
    Animated.spring(scale, { friction: 7, tension: 180, toValue, useNativeDriver: true }).start();
  };

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ? t(accessibilityLabel) : undefined}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      android_ripple={{ color: colors.press }}
      disabled={isDisabled}
      onPress={onPress}
      onPressIn={() => animate(0.98)}
      onPressOut={() => animate(1)}
    >
      <Animated.View
        style={[
          styles.button,
          {
            backgroundColor: variantStyle.backgroundColor,
            borderColor: variantStyle.borderColor,
            minHeight: compact ? dsSize.control.sm : dsSize.control.lg,
            opacity: isDisabled ? 0.56 : 1,
            paddingHorizontal: compact ? dsSpace[2] : dsSpace[3],
            transform: [{ scale }],
            width: block ? "100%" : undefined,
          },
          style,
        ]}
      >
        {loading ? <ActivityIndicator color={variantStyle.text} size="small" /> : null}
        {!loading && icon ? <MaterialCommunityIcons name={icon} size={20} color={variantStyle.text} /> : null}
        <AppText color="text" numberOfLines={1} style={{ color: variantStyle.text }} variant="bodyStrong">
          {children}
        </AppText>
        {!loading && endIcon ? <MaterialCommunityIcons name={endIcon} size={20} color={variantStyle.text} /> : null}
      </Animated.View>
    </Pressable>
  );
}

export const AmountInput = forwardRef<TextInput, TextInputProps & { error?: string }>(function AmountInput(
  { error, onBlur, onFocus, style, ...props },
  ref
) {
  const { colors } = useDs();
  const { language, t } = useAppSettings();
  const [focused, setFocused] = useState(false);
  return (
    <View>
      <View
        style={[
          styles.amountBox,
          {
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : focused ? colors.accent : colors.border,
            borderWidth: focused || error ? 2 : 1,
          },
        ]}
      >
        <AppText style={styles.rupee} variant="amount">
          ₹
        </AppText>
        <TextInput
          ref={ref}
          {...props}
          keyboardType="decimal-pad"
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          placeholder={t("0")}
          placeholderTextColor={colors.textSubtle}
          selectionColor={colors.accent}
          style={[
            styles.amountInput,
            { color: colors.text },
            style,
            language === "en" ? null : { fontFamily: localeSystemFont },
          ]}
        />
      </View>
      {error ? <AppText color="danger" style={styles.helperText} variant="caption">{error}</AppText> : null}
    </View>
  );
});

export function CategoryChip({
  active,
  delayLongPress,
  disabled,
  icon,
  label,
  onLongPress,
  onPress,
  onPressOut,
  style,
}: {
  active?: boolean;
  delayLongPress?: number;
  disabled?: boolean;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onLongPress?: () => void;
  onPress?: () => void;
  onPressOut?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useDs();
  const { t } = useAppSettings();
  return (
    <Pressable
      accessibilityLabel={t(label)}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      android_ripple={{ color: colors.press }}
      delayLongPress={delayLongPress}
      disabled={disabled}
      onLongPress={onLongPress}
      onPress={onPress}
      onPressOut={onPressOut}
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.accent : colors.surface,
          borderColor: active ? colors.accent : colors.border,
          opacity: disabled ? 0.56 : 1,
        },
        style,
      ]}
    >
      {icon ? <MaterialCommunityIcons name={icon} size={18} color={active ? "#FFFFFF" : colors.textMuted} /> : null}
      <AppText numberOfLines={1} style={{ color: active ? "#FFFFFF" : colors.text }} variant="label">
        {label}
      </AppText>
    </Pressable>
  );
}

export function PaymentModeChip({
  active,
  icon,
  label,
  onPress,
  style,
}: {
  active?: boolean;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return <CategoryChip active={active} icon={icon} label={label} onPress={onPress} style={style} />;
}

export function IconButton({
  accessibilityLabel,
  icon,
  onPress,
  tone = "default",
}: {
  accessibilityLabel: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress?: () => void;
  tone?: "default" | "danger" | "primary";
}) {
  const { colors } = useDs();
  const { t } = useAppSettings();
  const color = tone === "danger" ? colors.danger : tone === "primary" ? colors.accent : colors.text;
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ? t(accessibilityLabel) : undefined}
      accessibilityRole="button"
      android_ripple={{ color: colors.press, borderless: true }}
      hitSlop={8}
      onPress={onPress}
      style={[styles.iconButton, { backgroundColor: colors.chipBg }]}
    >
      <MaterialCommunityIcons name={icon} size={24} color={color} />
    </Pressable>
  );
}

export function FormField({
  error,
  inputStyle,
  label,
  onBlur,
  onFocus,
  placeholder,
  style,
  ...props
}: TextInputProps & {
  error?: string;
  inputStyle?: StyleProp<TextStyle>;
  label?: string;
}) {
  const { colors } = useDs();
  const { language, t } = useAppSettings();
  const [focused, setFocused] = useState(false);
  return (
    <View style={style}>
      {label ? <AppText color="textMuted" style={styles.fieldLabel} variant="label">{label}</AppText> : null}
      <TextInput
        {...props}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        placeholder={placeholder ? t(placeholder) : undefined}
        placeholderTextColor={colors.textSubtle}
        selectionColor={colors.accent}
        style={[
          styles.formInput,
          {
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : focused ? colors.accent : colors.border,
            borderWidth: focused || error ? 2 : 1,
            color: colors.text,
          },
          inputStyle,
          language === "en" ? null : { fontFamily: localeSystemFont },
        ]}
      />
      {error ? <AppText color="danger" style={styles.helperText} variant="caption">{error}</AppText> : null}
    </View>
  );
}

export function SectionHeader({
  action,
  onAction,
  title,
}: {
  action?: string;
  onAction?: () => void;
  title: string;
}) {
  const { colors } = useDs();
  return (
    <View style={styles.sectionHeader}>
      <AppText variant="headline">{title}</AppText>
      {action ? (
        <Pressable android_ripple={{ color: colors.press, borderless: true }} onPress={onAction} hitSlop={8}>
          <AppText color="accent" variant="label">{action}</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

export function AppSegmentedControl<T extends string>({
  accessibilityLabel,
  items,
  onChange,
  style,
  value,
}: {
  accessibilityLabel?: string;
  items: Array<{ icon?: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: T }>;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
  value: T;
}) {
  const { colors } = useDs();
  const { t } = useAppSettings();

  return (
    <View
      accessibilityLabel={accessibilityLabel ? t(accessibilityLabel) : undefined}
      accessibilityRole="tablist"
      style={[styles.segmentedTrack, { backgroundColor: colors.chipBg }, style]}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            android_ripple={{ color: colors.press }}
            key={item.value}
            onPress={() => onChange(item.value)}
            style={[styles.segmentedItem, active ? { backgroundColor: colors.bgInverse } : null]}
          >
            {item.icon ? (
              <MaterialCommunityIcons
                name={item.icon}
                size={18}
                color={active ? colors.textInverse : colors.textMuted}
              />
            ) : null}
            <AppText
              numberOfLines={1}
              style={{ color: active ? colors.textInverse : colors.text }}
              variant="label"
            >
              {item.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ListRow({
  amount,
  amountColor,
  description,
  icon,
  iconColor,
  onPress,
  rightLabel,
  title,
}: {
  amount?: string;
  amountColor?: string;
  description?: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  iconColor?: string;
  onPress?: () => void;
  rightLabel?: string;
  title: string;
}) {
  const { colors } = useDs();
  const { t } = useAppSettings();
  const content = (
    <View style={[styles.listRow, { borderBottomColor: colors.border }]}>
      {icon ? (
        <View style={[styles.listIcon, { backgroundColor: colors.chipBg }]}>
          <MaterialCommunityIcons name={icon} size={22} color={iconColor ?? colors.accent} />
        </View>
      ) : null}
      <View style={styles.listText}>
        <AppText numberOfLines={1} variant="bodyStrong">{title}</AppText>
        {description ? <AppText color="textSubtle" numberOfLines={1} variant="caption">{description}</AppText> : null}
      </View>
      <View style={styles.listEnd}>
        {amount ? <AppText numberOfLines={1} style={amountColor ? { color: amountColor } : undefined} variant="bodyStrong">{amount}</AppText> : null}
        {rightLabel ? <AppText color="textSubtle" numberOfLines={1} variant="caption">{rightLabel}</AppText> : null}
      </View>
      {onPress ? <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textSubtle} /> : null}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable accessibilityLabel={t(title)} accessibilityRole="button" android_ripple={{ color: colors.press }} onPress={onPress}>
      {content}
    </Pressable>
  );
}

export function EmptyState({
  action,
  actionSpacing = "normal",
  body,
  icon = "receipt-text-outline",
  onAction,
  title,
}: {
  action?: string;
  actionSpacing?: "normal" | "loose";
  body?: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  onAction?: () => void;
  title: string;
}) {
  const { colors } = useDs();
  return (
    <View style={styles.stateBox}>
      <View style={[styles.stateIcon, { backgroundColor: colors.infoBg }]}>
        <MaterialCommunityIcons name={icon} size={28} color={colors.info} />
      </View>
      <AppText style={[styles.stateTitle, styles.centerText]} variant="headline">{title}</AppText>
      {body ? <AppText color="textMuted" style={[styles.stateBody, styles.centerText]} variant="body">{body}</AppText> : null}
      {action && onAction ? (
        <View style={actionSpacing === "loose" ? styles.stateActionLoose : undefined}>
          <AppButton onPress={onAction} variant="secondary">{action}</AppButton>
        </View>
      ) : null}
    </View>
  );
}

export function ErrorState({ text }: { text?: string }) {
  const { colors } = useDs();
  if (!text) return null;
  return (
    <View style={[styles.errorBox, { backgroundColor: colors.dangerBg, borderColor: colors.danger }]}>
      <MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.danger} />
      <AppText color="danger" style={styles.errorText} variant="caption">{text}</AppText>
    </View>
  );
}

export function ProgressBar({
  accessibilityLabel,
  color,
  progress,
  style,
  tone = "primary",
}: {
  accessibilityLabel?: string;
  color?: string;
  progress: number;
  style?: StyleProp<ViewStyle>;
  tone?: "primary" | "success" | "warning" | "danger";
}) {
  const { colors } = useDs();
  const { t } = useAppSettings();
  const safeProgress = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const fillColor = color ?? (
    tone === "success"
      ? colors.success
      : tone === "warning"
        ? colors.warning
        : tone === "danger"
          ? colors.danger
          : colors.accent
  );

  return (
    <View
      accessibilityLabel={
        accessibilityLabel
          ? t(accessibilityLabel)
          : t("{percent}% complete", { percent: Math.round(safeProgress * 100) })
      }
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(safeProgress * 100) }}
      style={[styles.progressTrack, { backgroundColor: colors.chipBg }, style]}
    >
      <View style={[styles.progressFill, { backgroundColor: fillColor, width: `${safeProgress * 100}%` }]} />
    </View>
  );
}

export function StatusTag({
  icon,
  label,
  tone = "neutral",
}: {
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  tone?: "neutral" | "info" | "success" | "warning" | "danger";
}) {
  const { colors } = useDs();
  const { t } = useAppSettings();
  const palette =
    tone === "success"
      ? { background: colors.successBg, foreground: colors.success }
      : tone === "warning"
        ? { background: colors.warningBg, foreground: colors.warning }
        : tone === "danger"
          ? { background: colors.dangerBg, foreground: colors.danger }
          : tone === "info"
            ? { background: colors.infoBg, foreground: colors.info }
            : { background: colors.chipBg, foreground: colors.textMuted };

  return (
    <View
      accessibilityLabel={t(label)}
      style={[styles.statusTag, { backgroundColor: palette.background }]}
    >
      {icon ? (
        <MaterialCommunityIcons name={icon} size={14} color={palette.foreground} />
      ) : (
        <View style={[styles.statusDot, { backgroundColor: palette.foreground }]} />
      )}
      <AppText numberOfLines={1} style={{ color: palette.foreground }} variant="caption">
        {label}
      </AppText>
    </View>
  );
}

export function BottomActionBar({ children }: { children: ReactNode }) {
  const { colors } = useDs();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bottomAction,
        {
          backgroundColor: colors.bg,
          borderTopColor: colors.border,
          paddingBottom: Math.max(insets.bottom, dsSpace[1]),
        },
      ]}
    >
      {children}
    </View>
  );
}

export function AppBottomSheet({
  children,
  footer,
  maxHeight = "86%",
  onClose,
  title,
  visible,
}: {
  children: ReactNode;
  footer?: ReactNode;
  maxHeight?: ViewStyle["maxHeight"];
  onClose: () => void;
  title?: string;
  visible: boolean;
}) {
  const { colors } = useDs();
  const { t, themeMode } = useAppSettings();
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={[styles.sheetRoot, { paddingBottom: dsSpace[0.5] }]}>
        <Pressable accessibilityLabel={t("Close sheet")} style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheetKeyboard}>
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: themeMode === "dark" ? colors.surfaceAlt : colors.surface,
                borderColor: colors.border,
                maxHeight,
              },
            ]}
          >
            {title ? (
              <View style={styles.sheetHeader}>
                <AppText variant="headline">{title}</AppText>
                <IconButton accessibilityLabel="Close sheet" icon="close" onPress={onClose} />
              </View>
            ) : null}
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {children}
            </ScrollView>
            {footer ? <View style={[styles.sheetFooter, { borderTopColor: colors.border }]}>{footer}</View> : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export function SkeletonBlock({
  height = 16,
  radius = dsRadius.sm,
  style,
  width = "100%",
}: {
  height?: ViewStyle["height"];
  radius?: number;
  style?: StyleProp<ViewStyle>;
  width?: ViewStyle["width"];
}) {
  const { colors } = useDs();
  const opacity = useRef(new Animated.Value(0.62)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          duration: 700,
          toValue: 0.32,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          duration: 700,
          toValue: 0.78,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      accessibilityRole="progressbar"
      style={[{ backgroundColor: colors.chipBg, borderRadius: radius, height, opacity, width }, style]}
    />
  );
}

export function SkeletonList({ rows = 3, showAvatar = true }: { rows?: number; showAvatar?: boolean }) {
  return (
    <AppCard style={styles.skeletonListCard}>
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={styles.skeletonListRow}>
          {showAvatar ? <SkeletonBlock height={48} radius={dsRadius.sm} width={48} /> : null}
          <View style={styles.skeletonListText}>
            <SkeletonBlock height={14} width="72%" />
            <SkeletonBlock height={12} style={styles.skeletonLineGap} width="46%" />
          </View>
          <SkeletonBlock height={16} width={58} />
        </View>
      ))}
    </AppCard>
  );
}

export function AppCandleChart({
  accessibilityLabel = "Daily spend chart",
  color,
  height = 86,
  values,
}: {
  accessibilityLabel?: string;
  color?: string;
  height?: number;
  values: number[];
}) {
  const { colors } = useDs();
  const { t } = useAppSettings();
  const max = Math.max(...values, 0);
  const activeColor = color ?? colors.accent;
  const emptyColor = colors.chipBg;
  const chartValues = values.length ? values : [0, 0, 0, 0, 0, 0, 0];

  return (
    <View accessibilityLabel={t(accessibilityLabel)} accessibilityRole="image" style={[styles.candleChart, { height }]}>
      {chartValues.map((value, index) => {
        const active = value > 0;
        const normalized = max > 0 ? value / max : 0;
        const barHeight = active ? Math.max(8, Math.round(normalized * (height - 8))) : 4;
        return (
          <View key={`${index}-${value}`} style={styles.candleSlot}>
            <View
              style={[
                styles.candleBar,
                {
                  backgroundColor: active ? activeColor : emptyColor,
                  height: barHeight,
                  opacity: active ? 1 : 0.9,
                },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  amountBox: {
    alignItems: "center",
    borderRadius: dsRadius.lg,
    flexDirection: "row",
    minHeight: 116,
    paddingHorizontal: dsSpace[2],
  },
  amountInput: {
    flex: 1,
    fontFamily: "Inter_600SemiBold",
    fontSize: 48,
    fontWeight: "600",
    lineHeight: 56,
    minWidth: 0,
    padding: 0,
  },
  bottomAction: {
    borderTopWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    left: 0,
    paddingHorizontal: dsSpace[2],
    paddingTop: dsSpace[1.5],
    position: "absolute",
    right: 0,
  },
  button: {
    alignItems: "center",
    borderRadius: dsRadius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: dsSpace[1],
    justifyContent: "center",
    minHeight: dsTouch.large,
    paddingHorizontal: dsSpace[2],
  },
  card: {
    borderRadius: dsRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: dsSpace[2],
    padding: dsSpace[2],
  },
  chip: {
    alignItems: "center",
    borderRadius: dsRadius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: dsSpace[0.5],
    minHeight: dsTouch.comfortable,
    paddingHorizontal: dsSpace[1.5],
  },
  centerText: {
    textAlign: "center",
  },
  errorBox: {
    alignItems: "center",
    borderRadius: dsRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: dsSpace[1],
    marginBottom: dsSpace[1.5],
    padding: dsSpace[1.5],
  },
  errorText: {
    flex: 1,
  },
  fieldLabel: {
    marginBottom: dsSpace[0.5],
  },
  flex: {
    flex: 1,
  },
  formInput: {
    borderRadius: dsRadius.sm,
    fontFamily: "Inter_500Medium",
    fontSize: 16,
    minHeight: dsTouch.large,
    paddingHorizontal: dsSpace[1.5],
  },
  helperText: {
    marginTop: dsSpace[0.5],
  },
  iconButton: {
    alignItems: "center",
    borderRadius: dsRadius.pill,
    height: dsTouch.min,
    justifyContent: "center",
    width: dsTouch.min,
  },
  listEnd: {
    alignItems: "flex-end",
    maxWidth: 112,
  },
  listIcon: {
    alignItems: "center",
    borderRadius: dsRadius.sm,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  listRow: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: dsSpace[1.5],
    minHeight: 80,
    paddingVertical: dsSpace[1.5],
  },
  listText: {
    flex: 1,
    minWidth: 0,
  },
  progressFill: {
    borderRadius: dsRadius.pill,
    height: "100%",
  },
  progressTrack: {
    borderRadius: dsRadius.pill,
    height: 8,
    overflow: "hidden",
    width: "100%",
  },
  rupee: {
    marginRight: dsSpace[1],
  },
  safeArea: {
    flex: 1,
  },
  screenContent: {
    alignSelf: "center",
    flexGrow: 1,
    width: "100%",
  },
  candleBar: {
    borderRadius: dsRadius.pill,
    minHeight: 4,
    width: "72%",
  },
  candleChart: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 3,
    width: "100%",
  },
  candleSlot: {
    alignItems: "center",
    flex: 1,
    height: "100%",
    justifyContent: "flex-end",
    minWidth: 0,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: dsSpace[1.5],
    marginTop: dsSpace[1],
  },
  segmentedItem: {
    alignItems: "center",
    borderRadius: dsRadius.pill,
    flex: 1,
    flexDirection: "row",
    gap: dsSpace[0.5],
    justifyContent: "center",
    minHeight: dsSize.control.sm,
    paddingHorizontal: dsSpace[1],
  },
  segmentedTrack: {
    borderRadius: dsRadius.pill,
    flexDirection: "row",
    gap: dsSpace[0.5],
    padding: dsSpace[0.5],
    width: "100%",
  },
  sheet: {
    ...dsShadow.low,
    borderRadius: dsRadius.sheet,
    borderWidth: StyleSheet.hairlineWidth,
    padding: dsSpace[2],
    paddingBottom: dsSpace[2.5],
    width: "100%",
  },
  sheetFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: dsSpace[1.5],
    paddingTop: dsSpace[1.5],
  },
  sheetHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: dsSpace[1],
  },
  sheetKeyboard: {
    justifyContent: "flex-end",
    paddingHorizontal: dsSpace[1],
    width: "100%",
  },
  sheetRoot: {
    backgroundColor: "rgba(10,11,13,0.62)",
    flex: 1,
    justifyContent: "flex-end",
  },
  skeletonLineGap: {
    marginTop: dsSpace[1],
  },
  skeletonListCard: {
    paddingVertical: dsSpace[0.5],
  },
  skeletonListRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: dsSpace[1.5],
    minHeight: 76,
    paddingVertical: dsSpace[1],
  },
  skeletonListText: {
    flex: 1,
    minWidth: 0,
  },
  stateBody: {
    marginBottom: dsSpace[2],
    marginTop: dsSpace[0.5],
  },
  stateActionLoose: {
    marginTop: dsSpace[1.5],
  },
  stateBox: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 220,
    paddingHorizontal: dsSpace[2],
    paddingVertical: dsSpace[4],
  },
  stateIcon: {
    alignItems: "center",
    borderRadius: dsRadius.pill,
    height: 64,
    justifyContent: "center",
    marginBottom: dsSpace[1.5],
    width: 64,
  },
  stateTitle: {
    marginTop: dsSpace[0.5],
  },
  statusDot: {
    borderRadius: dsRadius.pill,
    height: 7,
    width: 7,
  },
  statusTag: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: dsRadius.pill,
    flexDirection: "row",
    gap: dsSpace[0.5],
    minHeight: 28,
    paddingHorizontal: dsSpace[1],
    paddingVertical: dsSpace[0.5],
  },
});
