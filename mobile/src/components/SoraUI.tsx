import { Children, ReactNode, useEffect, useRef } from "react";
import {
  Animated,
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
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Text } from "react-native-paper";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

import { useAppSettings } from "../context/AppSettingsContext";
import { useSoraResponsive } from "../theme/responsive";
import { soraPalette, soraRadius } from "../theme/soraTheme";
import { BottomNav, BottomNavKey } from "./BottomNav";
import { SoraIllustratedEmpty } from "./SoraIllustratedEmpty";
import GenericEmptyIllustration from "../../illustrations/character-with-phone-and-star.svg";

export function SoraScreen({
  bottomNavCurrent,
  children,
  onRefresh,
  refreshing,
  scroll = true,
  style,
}: {
  bottomNavCurrent?: BottomNavKey;
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useAppSettings();
  const responsive = useSoraResponsive();
  const safeAreaEdges: Edge[] | undefined = bottomNavCurrent ? ["top", "left", "right"] : undefined;
  const contentStyle = [
    styles.content,
    {
      maxWidth: responsive.maxContentWidth,
      paddingBottom: bottomNavCurrent ? responsive.screen.bottomNavPadding + 16 : 32,
      paddingHorizontal: responsive.dashboard.contentPaddingX,
      paddingTop: responsive.compact ? 12 : 18,
    },
    style,
  ];

  return (
    <SafeAreaView edges={safeAreaEdges} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 18}
        style={styles.flex}
      >
        {scroll ? (
          <ScrollView
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={contentStyle}
            refreshControl={
              typeof refreshing === "boolean" && onRefresh ? (
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
              ) : undefined
            }
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[contentStyle, styles.flex]}>{children}</View>
        )}
      </KeyboardAvoidingView>
      {bottomNavCurrent ? <BottomNav current={bottomNavCurrent} /> : null}
    </SafeAreaView>
  );
}

export function SoraHeader({
  actionIcon,
  actionLabel,
  backIcon = "arrow-left",
  onAction,
  onBack,
  subtitle,
  title,
}: {
  actionIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  actionLabel?: string;
  backIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  onAction?: () => void;
  onBack?: () => void;
  subtitle?: string;
  title: string;
}) {
  const { colors } = useAppSettings();
  const responsive = useSoraResponsive();
  const rippleColor = `${colors.accent}22`;
  return (
    <View style={[styles.header, { marginBottom: responsive.compact ? 18 : 24 }]}>
      <View style={styles.headerText}>
        {onBack ? (
          <Pressable
            android_ripple={{ color: rippleColor, borderless: true }}
            hitSlop={8}
            onPress={onBack}
            style={styles.inlineBack}
          >
            <MaterialCommunityIcons name={backIcon} size={responsive.dashboard.headerIcon} color={colors.text} />
          </Pressable>
        ) : null}
        <View style={styles.titleWrap}>
          <Text
            adjustsFontSizeToFit
            maxFontSizeMultiplier={responsive.maxFontScale}
            minimumFontScale={0.76}
            numberOfLines={1}
            style={[styles.title, { color: colors.text, fontSize: responsive.dashboard.greeting }]}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              maxFontSizeMultiplier={responsive.maxFontScale}
              numberOfLines={2}
              style={[styles.subtitle, { color: colors.muted }]}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {onAction ? (
        <Pressable
          android_ripple={{ color: rippleColor, borderless: true }}
          hitSlop={8}
          onPress={onAction}
          style={styles.headerAction}
        >
          {actionIcon ? (
            <MaterialCommunityIcons name={actionIcon} size={responsive.dashboard.headerIcon - 2} color={colors.text} />
          ) : (
            <Text style={[styles.actionLabel, { color: colors.accent }]}>{actionLabel}</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

export function SoraCard({
  children,
  style,
  tone = "default",
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: "default" | "purple" | "green" | "red";
}) {
  const { colors } = useAppSettings();
  const toneStyle =
    tone === "green"
      ? { backgroundColor: `${colors.success}12`, borderColor: `${colors.success}30` }
      : tone === "red"
        ? { backgroundColor: `${colors.danger}12`, borderColor: `${colors.danger}30` }
        : tone === "purple"
          ? { backgroundColor: colors.accent, borderColor: colors.accent }
          : { backgroundColor: colors.card, borderColor: colors.border };

  return <View style={[styles.card, toneStyle, style]}>{children}</View>;
}

export function SoraSectionHeader({
  action,
  onAction,
  title,
}: {
  action?: string;
  onAction?: () => void;
  title: string;
}) {
  const { colors } = useAppSettings();
  const responsive = useSoraResponsive();
  return (
    <View style={styles.sectionHeader}>
      <Text
        maxFontSizeMultiplier={responsive.maxFontScale}
        style={[styles.sectionTitle, { color: colors.text, fontSize: responsive.dashboard.sectionTitle }]}
      >
        {title}
      </Text>
      {action && onAction ? (
        <Pressable android_ripple={{ color: `${colors.accent}22`, borderless: true }} onPress={onAction}>
          <Text style={[styles.sectionAction, { color: colors.accent }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function SoraIconRow({
  amount,
  icon,
  iconBackground,
  iconColor,
  meta,
  onPress,
  title,
}: {
  amount?: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  iconBackground?: string;
  iconColor?: string;
  meta?: string;
  onPress?: () => void;
  title: string;
}) {
  const { colors } = useAppSettings();
  const responsive = useSoraResponsive();
  const content = (
    <View style={styles.iconRow}>
      <View
        style={[
          styles.iconCircle,
          {
            backgroundColor: iconBackground ?? soraPalette.purpleSoft,
            borderRadius: responsive.compact ? 25 : 30,
            height: responsive.compact ? 50 : 60,
            width: responsive.compact ? 50 : 60,
          },
        ]}
      >
        <MaterialCommunityIcons name={icon} size={responsive.compact ? 24 : 29} color={iconColor ?? colors.accent} />
      </View>
      <View style={styles.iconRowText}>
        <Text maxFontSizeMultiplier={responsive.maxFontScale} numberOfLines={1} style={[styles.iconRowTitle, { color: colors.text }]}>
          {title}
        </Text>
        {meta ? (
          <Text maxFontSizeMultiplier={responsive.maxFontScale} numberOfLines={1} style={[styles.iconRowMeta, { color: colors.muted }]}>
            {meta}
          </Text>
        ) : null}
      </View>
      {amount ? (
        <Text adjustsFontSizeToFit maxFontSizeMultiplier={responsive.maxFontScale} numberOfLines={1} style={[styles.iconRowAmount, { color: colors.text }]}>
          {amount}
        </Text>
      ) : null}
    </View>
  );

  if (!onPress) {
    return content;
  }
  return (
    <Pressable android_ripple={{ color: `${colors.accent}18` }} onPress={onPress} style={styles.pressableRow}>
      {content}
    </Pressable>
  );
}

export function SoraChip({
  active,
  children,
  onPress,
}: {
  active?: boolean;
  children: ReactNode;
  onPress: () => void;
}) {
  const { colors } = useAppSettings();
  const textColor = active ? "#FFFFFF" : colors.text;
  const renderedChildren = Children.map(children, (child) => {
    if (typeof child === "string") {
      const text = child.trim();
      return text ? <Text style={[styles.chipText, { color: textColor }]}>{text}</Text> : null;
    }
    if (typeof child === "number") {
      return <Text style={[styles.chipText, { color: textColor }]}>{child}</Text>;
    }
    return child;
  });

  return (
    <Pressable
      android_ripple={{ color: `${colors.accent}18`, borderless: false }}
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: colors.card, borderColor: colors.border },
        active && { backgroundColor: colors.accent, borderColor: colors.accent },
      ]}
    >
      <View style={styles.chipContent}>{renderedChildren}</View>
    </Pressable>
  );
}

export function SoraEmpty({ text }: { text: string }) {
  return <SoraIllustratedEmpty compact illustration={GenericEmptyIllustration} title={text} />;
}

export function SoraError({ text }: { text?: string }) {
  const { colors } = useAppSettings();
  if (!text) {
    return null;
  }
  return <Text style={[styles.errorText, { color: colors.danger }]}>{text}</Text>;
}

export function SoraSkeleton({
  height,
  radius = 12,
  style,
  width = "100%",
}: {
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  width?: number | `${number}%`;
}) {
  const { colors, themeMode } = useAppSettings();
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          duration: 780,
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          duration: 780,
          toValue: 0.45,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  const baseColor = themeMode === "dark" ? "rgba(255,255,255,0.10)" : "rgba(15,23,42,0.08)";
  const highlightColor = themeMode === "dark" ? "rgba(255,255,255,0.17)" : "rgba(15,23,42,0.13)";

  return (
    <Animated.View
      style={[
        {
          backgroundColor: baseColor,
          borderColor: colors.border,
          borderRadius: radius,
          height,
          opacity,
          overflow: "hidden",
          width,
        },
        style,
      ]}
    >
      <View style={[styles.skeletonHighlight, { backgroundColor: highlightColor }]} />
    </Animated.View>
  );
}

export function SoraRowSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <View>
      {Array.from({ length: rows }).map((_, index) => (
        <SoraCard key={index} style={styles.skeletonRowCard}>
          <View style={styles.skeletonRow}>
            <SoraSkeleton height={52} radius={26} style={styles.skeletonAvatar} width={52} />
            <View style={styles.skeletonTextBlock}>
              <SoraSkeleton height={16} radius={8} width="72%" />
              <SoraSkeleton height={12} radius={6} style={styles.skeletonLineGap} width="52%" />
            </View>
            <SoraSkeleton height={18} radius={8} width={72} />
          </View>
        </SoraCard>
      ))}
    </View>
  );
}

export function SoraCardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <SoraCard>
      <SoraSkeleton height={22} radius={9} width="54%" />
      <SoraSkeleton height={12} radius={6} style={styles.skeletonLineGapLarge} width="86%" />
      {Array.from({ length: rows }).map((_, index) => (
        <SoraSkeleton
          height={index === rows - 1 ? 38 : 14}
          key={index}
          radius={index === rows - 1 ? 14 : 7}
          style={styles.skeletonLineGap}
          width={index % 2 ? "64%" : "100%"}
        />
      ))}
    </SoraCard>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    alignSelf: "center",
    width: "100%",
  },
  flex: {
    flex: 1,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  headerText: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    minWidth: 0,
  },
  inlineBack: {
    marginRight: 10,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontWeight: "900",
    letterSpacing: 0,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 19,
    marginTop: 4,
  },
  headerAction: {
    marginLeft: 12,
  },
  actionLabel: {
    fontSize: 16,
    fontWeight: "900",
  },
  card: {
    borderRadius: soraRadius.card,
    borderWidth: 1,
    marginBottom: 14,
    padding: 16,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
    marginTop: 4,
  },
  sectionTitle: {
    fontWeight: "900",
  },
  sectionAction: {
    fontSize: 16,
    fontWeight: "900",
  },
  pressableRow: {
    borderRadius: 18,
    overflow: "hidden",
  },
  iconRow: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 66,
    paddingVertical: 8,
  },
  iconCircle: {
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  iconRowText: {
    flex: 1,
    minWidth: 0,
  },
  iconRowTitle: {
    fontSize: 17,
    fontWeight: "900",
  },
  iconRowMeta: {
    fontSize: 14,
    marginTop: 4,
  },
  iconRowAmount: {
    fontSize: 17,
    fontWeight: "900",
    marginLeft: 10,
    maxWidth: 118,
    textAlign: "right",
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 40,
    overflow: "hidden",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
  },
  chipText: {
    fontSize: 14,
    fontWeight: "800",
  },
  errorText: {
    color: soraPalette.red,
    fontSize: 14,
    marginBottom: 10,
  },
  skeletonAvatar: {
    marginRight: 14,
  },
  skeletonHighlight: {
    height: "100%",
    opacity: 0.42,
    transform: [{ translateX: -80 }, { skewX: "-18deg" }],
    width: "42%",
  },
  skeletonLineGap: {
    marginTop: 9,
  },
  skeletonLineGapLarge: {
    marginTop: 14,
  },
  skeletonRow: {
    alignItems: "center",
    flexDirection: "row",
  },
  skeletonRowCard: {
    marginBottom: 10,
    paddingVertical: 14,
  },
  skeletonTextBlock: {
    flex: 1,
    marginRight: 12,
  },
});
