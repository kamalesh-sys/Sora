import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";

export function StartupLoadingScreen() {
  const bounce1 = useRef(new Animated.Value(0)).current;
  const bounce2 = useRef(new Animated.Value(0)).current;
  const bounce3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const runAnimation = () => {
      bounce1.setValue(0);
      bounce2.setValue(0);
      bounce3.setValue(0);

      Animated.sequence([
        Animated.stagger(150, [
          Animated.sequence([
            Animated.timing(bounce1, { toValue: -12, duration: 250, useNativeDriver: true }),
            Animated.timing(bounce1, { toValue: 0, duration: 250, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(bounce2, { toValue: -12, duration: 250, useNativeDriver: true }),
            Animated.timing(bounce2, { toValue: 0, duration: 250, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(bounce3, { toValue: -12, duration: 250, useNativeDriver: true }),
            Animated.timing(bounce3, { toValue: 0, duration: 250, useNativeDriver: true }),
          ]),
        ]),
        Animated.delay(300),
      ]).start(() => runAnimation());
    };

    runAnimation();
  }, []);

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Sora</Text>
      <View style={styles.dotsContainer}>
        <Animated.View style={[styles.dot, { transform: [{ translateY: bounce1 }] }]} />
        <Animated.View style={[styles.dot, { transform: [{ translateY: bounce2 }] }]} />
        <Animated.View style={[styles.dot, { transform: [{ translateY: bounce3 }] }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    backgroundColor: "#0A0B0D",
  },
  title: {
    fontSize: 44,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -1,
  },
  dotsContainer: {
    flexDirection: "row",
    marginTop: 20,
    alignItems: "center",
    justifyContent: "center",
    height: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
    marginHorizontal: 4,
    opacity: 0.85,
  },
});
