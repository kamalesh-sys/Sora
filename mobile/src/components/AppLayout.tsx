import { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { Button, Text } from "react-native-paper";
import type { ButtonProps } from "react-native-paper";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { BottomNav, BottomNavKey } from "./BottomNav";
import { useAppSettings } from "../context/AppSettingsContext";
import { useSoraResponsive } from "../theme/responsive";

type ScreenProps = {
  bottomNavCurrent?: BottomNavKey;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  onRefresh?: () => void;
  refreshing?: boolean;
  scroll?: boolean;
};

export function Screen({
  bottomNavCurrent,
  children,
  contentStyle,
  onRefresh,
  refreshing,
  scroll = true,
}: ScreenProps) {
  const { colors } = useAppSettings();
  const responsive = useSoraResponsive();
  const backgroundStyle = { backgroundColor: colors.background };
  const safeAreaEdges: Edge[] | undefined = bottomNavCurrent ? ["top", "left", "right"] : undefined;
  const baseContentStyle = [
    styles.content,
    {
      paddingHorizontal: responsive.screen.contentPaddingX,
    },
  ];

  if (!scroll) {
    return (
      <SafeAreaView edges={safeAreaEdges} style={[styles.safeArea, backgroundStyle]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 18}
          style={styles.flexContent}
        >
          <View style={[baseContentStyle, styles.flexContent, contentStyle]}>{children}</View>
        </KeyboardAvoidingView>
        {bottomNavCurrent ? <BottomNav current={bottomNavCurrent} /> : null}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={safeAreaEdges} style={[styles.safeArea, backgroundStyle]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 18}
        style={styles.flexContent}
      >
        <ScrollView
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            baseContentStyle,
            bottomNavCurrent && { paddingBottom: responsive.screen.bottomNavPadding },
            contentStyle,
          ]}
          refreshControl={
            typeof refreshing === "boolean" && onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.accent}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
      {bottomNavCurrent ? <BottomNav current={bottomNavCurrent} /> : null}
    </SafeAreaView>
  );
}

export function AppButton(props: ButtonProps) {
  const { colors } = useAppSettings();
  return <Button rippleColor={`${colors.accent}22`} {...props} />;
}

type HeaderProps = {
  actionIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  actionLabel?: string;
  backIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  onAction?: () => void;
  onBack?: () => void;
  onSecondaryAction?: () => void;
  secondaryActionIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  subtitle?: string;
  title: string;
};

export function Header({
  actionIcon,
  actionLabel,
  backIcon = "arrow-left",
  onAction,
  onBack,
  onSecondaryAction,
  secondaryActionIcon,
  subtitle,
  title,
}: HeaderProps) {
  const { colors } = useAppSettings();
  const rippleColor = `${colors.accent}22`;
  const hasTopRow = Boolean(onBack || actionLabel || actionIcon || secondaryActionIcon);

  return (
    <View style={styles.header}>
      {hasTopRow ? (
        <View style={styles.headerTopRow}>
          {onBack ? (
            <Pressable
              android_ripple={{ color: rippleColor, borderless: true }}
              onPress={onBack}
              style={[styles.headerIconButton, { borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name={backIcon} size={22} color={colors.text} />
            </Pressable>
          ) : (
            <View />
          )}
          {actionIcon && onAction ? (
            <View style={styles.headerActionGroup}>
              <Pressable
                android_ripple={{ color: rippleColor, borderless: true }}
                onPress={onAction}
                style={[styles.headerIconButton, { borderColor: colors.border }]}
              >
                <MaterialCommunityIcons name={actionIcon} size={22} color={colors.text} />
              </Pressable>
              {secondaryActionIcon && onSecondaryAction ? (
                <Pressable
                  android_ripple={{ color: rippleColor, borderless: true }}
                  onPress={onSecondaryAction}
                  style={[styles.headerIconButton, { borderColor: colors.border }]}
                >
                  <MaterialCommunityIcons name={secondaryActionIcon} size={22} color={colors.text} />
                </Pressable>
              ) : null}
            </View>
          ) : actionLabel && onAction ? (
            <AppButton compact mode="contained" onPress={onAction}>
              {actionLabel}
            </AppButton>
          ) : null}
        </View>
      ) : null}
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text> : null}
    </View>
  );
}

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useAppSettings();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function DataRow({
  label,
  value,
  tone,
}: {
  label: string;
  tone?: "danger" | "success" | "warning";
  value: string;
}) {
  const { colors } = useAppSettings();
  const valueColor =
    tone === "danger"
      ? colors.danger
      : tone === "success"
        ? colors.success
        : tone === "warning"
          ? colors.warning
          : colors.text;

  return (
    <View style={[styles.dataRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.dataLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.dataValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

export function EmptyState({ text }: { text: string }) {
  const { colors } = useAppSettings();
  return <Text style={[styles.emptyText, { color: colors.muted }]}>{text}</Text>;
}

export function ErrorText({ text }: { text: string }) {
  const { colors } = useAppSettings();
  if (!text) {
    return null;
  }
  return <Text style={[styles.errorText, { color: colors.danger }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    paddingTop: 16,
    paddingBottom: 28,
  },
  flexContent: {
    flex: 1,
  },
  header: {
    marginBottom: 16,
  },
  headerTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  headerIconButton: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  headerActionGroup: {
    flexDirection: "row",
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  card: {
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
    padding: 14,
  },
  dataRow: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  dataLabel: {
    flex: 1,
    fontSize: 14,
    marginRight: 12,
  },
  dataValue: {
    fontSize: 14,
    fontWeight: "700",
    textAlign: "right",
  },
  emptyText: {
    fontSize: 14,
    paddingVertical: 8,
  },
  errorText: {
    fontSize: 14,
    marginBottom: 8,
  },
});
