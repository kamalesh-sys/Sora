import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";

import { useAppSettings } from "../context/AppSettingsContext";
import SoraOgLogo from "../assets/sora_og_logo.svg";

export function StartupLoadingScreen() {
  const { colors, t } = useAppSettings();

  return (
    <View
      accessibilityLabel={t("Sora Expense is getting ready")}
      accessibilityLiveRegion="polite"
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <SoraOgLogo accessibilityElementsHidden height={108} importantForAccessibility="no-hide-descendants" width={108} />
      <Text style={[styles.title, { color: colors.text }]}>Sora Expense</Text>
      <Text style={[styles.message, { color: colors.muted }]}>{t("Getting things ready")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  message: {
    fontSize: 14,
    marginTop: 8,
  },
  title: {
    fontSize: 19,
    fontWeight: "700",
    letterSpacing: -0.25,
    marginTop: 18,
  },
});
