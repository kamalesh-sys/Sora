import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import LottieView from "lottie-react-native";

import { useAppSettings } from "../context/AppSettingsContext";
import { useSoraResponsive } from "../theme/responsive";

const loadingMessages = [
  "Opening Sora Expense...",
  "Hmm, this is taking a tiny minute eh...",
  "Counting invisible coins. Very serious work.",
  "Still loading. Sora is putting things in neat little boxes.",
];

export function StartupLoadingScreen() {
  const { colors } = useAppSettings();
  const responsive = useSoraResponsive();
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setMessageIndex(1), 3500),
      setTimeout(() => setMessageIndex(2), 8000),
      setTimeout(() => setMessageIndex(3), 13000),
    ];

    return () => {
      timers.forEach(clearTimeout);
    };
  }, []);

  const illustrationSize = useMemo(() => {
    if (responsive.tiny) {
      return 120;
    }
    if (responsive.compact) {
      return 140;
    }
    return 160;
  }, [responsive.compact, responsive.tiny]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingHorizontal: responsive.dashboard.contentPaddingX }]}>
      <View style={styles.animationWrap}>
        <LottieView
          autoPlay
          loop
          source={require("../../assets/abstract-square.json")}
          style={{ width: illustrationSize, height: illustrationSize }}
        />
      </View>

      <Text style={[styles.title, { color: colors.text }]}>Sora Expense</Text>
      <Text style={[styles.message, { color: colors.muted }]}>{loadingMessages[messageIndex]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  animationWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  message: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 22,
    marginTop: 8,
    maxWidth: 320,
    minHeight: 48,
    textAlign: "center",
  },
  screen: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  title: {
    fontSize: 30,
    fontWeight: "900",
  },
});
