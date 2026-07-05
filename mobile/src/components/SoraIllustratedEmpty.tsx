import type { ComponentType, ReactNode } from "react";
import { Image, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import type { SvgProps } from "react-native-svg";
import { Text } from "react-native-paper";

import { useAppSettings } from "../context/AppSettingsContext";
import { useSoraResponsive } from "../theme/responsive";

type IllustrationSource = ComponentType<SvgProps> | number | unknown;

export function SoraIllustratedEmpty({
  action,
  illustration,
  compact,
  size,
  text,
  title,
  style,
}: {
  action?: ReactNode;
  illustration?: IllustrationSource;
  compact?: boolean;
  size?: number;
  text?: string;
  title: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useAppSettings();
  const responsive = useSoraResponsive();
  const illustrationSize =
    size ?? (compact ? (responsive.tiny ? 136 : responsive.compact ? 152 : 168) : responsive.tiny ? 184 : responsive.compact ? 212 : 240);

  return (
    <View style={[styles.container, compact && styles.compact, style]}>
      {illustration ? <SoraIllustration source={illustration} size={illustrationSize} /> : null}
      <Text
        maxFontSizeMultiplier={responsive.maxFontScale}
        style={[styles.title, compact && styles.compactTitle, { color: colors.text }]}
      >
        {title}
      </Text>
      {text ? (
        <Text
          maxFontSizeMultiplier={responsive.maxFontScale}
          style={[styles.text, compact && styles.compactText, { color: colors.muted }]}
        >
          {text}
        </Text>
      ) : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

export function SoraIllustration({
  color,
  source,
  size,
}: {
  color?: string;
  source: IllustrationSource;
  size: number;
}) {
  const { colors, themeMode } = useAppSettings();
  const inheritedColor = color ?? (themeMode === "dark" ? "#FFFFFF" : colors.text);

  if (typeof source === "function") {
    const SvgIllustration = source as ComponentType<SvgProps>;
    return (
      <SvgIllustration
        accessibilityElementsHidden
        color={inheritedColor}
        fill={inheritedColor}
        height={size}
        importantForAccessibility="no"
        width={size}
      />
    );
  }

  if (typeof source === "number") {
    return (
      <Image
        accessibilityIgnoresInvertColors
        resizeMode="contain"
        source={source}
        style={[{ height: size, width: size }, themeMode === "dark" && !color && styles.darkAssetFallback]}
      />
    );
  }

  return null;
}

const styles = StyleSheet.create({
  action: {
    marginTop: 16,
  },
  compact: {
    marginVertical: 14,
    minHeight: 218,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  compactText: {
    fontSize: 13,
    lineHeight: 19,
    maxWidth: 260,
  },
  compactTitle: {
    fontSize: 17,
    marginTop: 10,
  },
  container: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 22,
    minHeight: 320,
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  text: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    maxWidth: 300,
    textAlign: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "900",
    marginTop: 14,
    textAlign: "center",
  },
  darkAssetFallback: {
    tintColor: "#FFFFFF",
  },
});
