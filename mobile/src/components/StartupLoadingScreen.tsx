import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";

import CharacterRunningWithKite from "../../illustrations/character-running-with-kite.svg";
import { useAppSettings } from "../context/AppSettingsContext";
import { useSoraResponsive } from "../theme/responsive";

const loadingMessages = [
  "Opening Sora Expense...",
  "Render is waking up. Tiny server stretch break.",
  "This is taking a bit. Hold on, your money data is getting ready.",
  "Still here. Free servers can be dramatic after sleeping.",
];

export function StartupLoadingScreen() {
  const { colors, themeMode } = useAppSettings();
  const responsive = useSoraResponsive();
  const progress = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const [messageIndex, setMessageIndex] = useState(0);
  const trackWidth = Math.min(responsive.width * 0.78, 340);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(progress, {
        duration: 2000,
        easing: Easing.out(Easing.cubic),
        toValue: 0.72,
        useNativeDriver: true,
      }),
      Animated.timing(progress, {
        duration: 11000,
        easing: Easing.out(Easing.quad),
        toValue: 0.94,
        useNativeDriver: true,
      }),
    ]).start();

    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          toValue: 0,
          useNativeDriver: true,
        }),
      ])
    );
    pulseAnimation.start();

    const timers = [
      setTimeout(() => setMessageIndex(1), 3500),
      setTimeout(() => setMessageIndex(2), 8000),
      setTimeout(() => setMessageIndex(3), 13000),
    ];

    return () => {
      progress.stopAnimation();
      pulseAnimation.stop();
      timers.forEach(clearTimeout);
    };
  }, [progress, pulse]);

  const progressScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.08, 1],
  });
  const progressTranslate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-trackWidth * 0.46, 0],
  });
  const illustrationScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.025],
  });
  const illustrationOpacity = themeMode === "dark" ? 0.92 : 1;

  const illustrationSize = useMemo(() => {
    if (responsive.tiny) {
      return 180;
    }
    if (responsive.compact) {
      return 210;
    }
    return 240;
  }, [responsive.compact, responsive.tiny]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingHorizontal: responsive.dashboard.contentPaddingX }]}>
      <Animated.View
        style={[
          styles.illustrationWrap,
          {
            opacity: illustrationOpacity,
            transform: [{ scale: illustrationScale }],
          },
        ]}
      >
        <CharacterRunningWithKite height={illustrationSize} width={illustrationSize} />
      </Animated.View>

      <Text style={[styles.title, { color: colors.text }]}>Sora Expense</Text>
      <Text style={[styles.message, { color: colors.muted }]}>{loadingMessages[messageIndex]}</Text>

      <View style={[styles.track, { backgroundColor: colors.border, width: trackWidth }]}>
        <Animated.View
          style={[
            styles.bar,
            {
              backgroundColor: colors.accent,
              transform: [{ translateX: progressTranslate }, { scaleX: progressScale }],
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderRadius: 999,
    height: "100%",
    width: "100%",
  },
  illustrationWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
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
  track: {
    borderRadius: 999,
    height: 9,
    marginTop: 20,
    overflow: "hidden",
  },
});
