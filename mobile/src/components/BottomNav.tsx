import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { useRef } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Text } from "react-native-paper";

import { useAppSettings } from "../context/AppSettingsContext";
import { useFeedback } from "../context/FeedbackContext";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { useSoraResponsive } from "../theme/responsive";

export type BottomNavKey = "Home" | "Expenses" | "Add" | "Budget" | "Profile";

type NavItem = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  key: BottomNavKey;
  label: string;
  route: keyof RootStackParamList;
};

const leftItems: NavItem[] = [
  { key: "Home", label: "Home", icon: "home", route: "Home" },
  { key: "Expenses", label: "Expenses", icon: "receipt-text", route: "Expenses" },
];

const centerItem: NavItem = { key: "Add", label: "Add", icon: "plus", route: "ExpenseForm" };

const rightItems: NavItem[] = [
  { key: "Budget", label: "Bills", icon: "file-document", route: "Bills" },
  { key: "Profile", label: "Reports", icon: "chart-pie", route: "Reports" },
];

const allItems = [...leftItems, centerItem, ...rightItems];

export function BottomNav({ current }: { current: BottomNavKey }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useAppSettings();
  const responsive = useSoraResponsive();

  const renderItem = (item: NavItem) => {
    return (
      <NavItemButton
        key={item.key}
        active={item.key === current}
        item={item}
        onPress={() => navigation.navigate(item.route as never)}
        responsive={responsive}
      />
    );
  };

  return (
    <View
      style={[
        styles.shell,
        {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          minHeight: responsive.nav.height,
          paddingBottom: responsive.nav.paddingBottom,
          paddingHorizontal: responsive.nav.paddingHorizontal,
          paddingTop: responsive.nav.paddingTop,
        },
      ]}
    >
      <View style={styles.leftGroup}>{leftItems.map(renderItem)}</View>
      <View style={[styles.centerGroup, { width: responsive.nav.fabSize + 8 }]}>
        {renderItem(centerItem)}
      </View>
      <View style={styles.rightGroup}>{rightItems.map(renderItem)}</View>
    </View>
  );
}

function NavItemButton({
  active,
  item,
  onPress,
  responsive,
}: {
  active: boolean;
  item: NavItem;
  onPress: () => void;
  responsive: ReturnType<typeof useSoraResponsive>;
}) {
  const { colors } = useAppSettings();
  const { navTap } = useFeedback();
  const scale = useRef(new Animated.Value(1)).current;
  const keyframe = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const isAdd = item.key === "Add";
  const iconColor = isAdd ? "#ffffff" : active ? colors.accent : colors.text;
  const rippleColor = isAdd ? "rgba(255,255,255,0.26)" : `${colors.accent}24`;
  const iconLift = keyframe.interpolate({
    inputRange: [0, 0.55, 1],
    outputRange: [0, -5, 0],
  });
  const iconPop = keyframe.interpolate({
    inputRange: [0, 0.55, 1],
    outputRange: [1, 1.18, 1],
  });
  const iconOpacity = keyframe.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [1, 0.72, 1],
  });
  const addRotate = keyframe.interpolate({
    inputRange: [0, 0.55, 1],
    outputRange: ["0deg", "45deg", "0deg"],
  });
  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.78, 1.45],
  });
  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.34, 0],
  });

  const animateTo = (toValue: number) => {
    Animated.spring(scale, {
      toValue,
      friction: 6,
      tension: 170,
      useNativeDriver: true,
    }).start();
  };

  const playIconAnimation = () => {
    keyframe.stopAnimation();
    pulse.stopAnimation();
    keyframe.setValue(0);
    pulse.setValue(0);

    Animated.parallel([
      Animated.timing(keyframe, {
        toValue: 1,
        duration: isAdd ? 220 : 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      isAdd
        ? Animated.timing(pulse, {
            toValue: 1,
            duration: 260,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          })
        : Animated.delay(0),
    ]).start();
  };

  return (
    <Pressable
      android_ripple={{ color: rippleColor, borderless: true }}
      onPress={() => {
        navTap();
        playIconAnimation();
        setTimeout(onPress, 70);
      }}
      onPressIn={() => animateTo(isAdd ? 0.88 : 0.92)}
      onPressOut={() => animateTo(1)}
      style={[
        styles.item,
        isAdd && styles.addItem,
        isAdd && { width: responsive.nav.fabSize + 8 },
      ]}
      hitSlop={8}
    >
      <Animated.View
        style={[
          styles.animatedItem,
          isAdd && [
            styles.animatedAddItem,
            { marginTop: -Math.round(responsive.nav.fabSize * 0.34) },
          ],
          {
            opacity: iconOpacity,
            transform: [{ translateY: iconLift }, { scale }],
          },
        ]}
      >
        {isAdd ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.addPulse,
              {
                borderColor: colors.accent,
                borderRadius: (responsive.nav.fabSize + 8) / 2,
                height: responsive.nav.fabSize + 8,
                opacity: pulseOpacity,
                transform: [{ scale: pulseScale }],
                width: responsive.nav.fabSize + 8,
              },
            ]}
          />
        ) : null}
        <View
          style={[
            styles.iconBox,
            {
              height: responsive.nav.iconBoxHeight,
              width: responsive.nav.iconBoxWidth,
            },
            isAdd && [
              styles.addBox,
              {
                backgroundColor: colors.accent,
                borderRadius: responsive.nav.fabSize / 2,
                height: responsive.nav.fabSize,
                shadowColor: colors.accent,
                width: responsive.nav.fabSize,
              },
            ],
          ]}
        >
          <Animated.View
            style={{
              transform: [{ scale: iconPop }, ...(isAdd ? [{ rotate: addRotate }] : [])],
            }}
          >
            <MaterialCommunityIcons
              name={item.icon}
              size={isAdd ? Math.round(responsive.nav.fabSize * 0.5) : responsive.nav.iconSize + 3}
              color={iconColor}
            />
          </Animated.View>
        </View>
        {!isAdd ? (
          <Text
            maxFontSizeMultiplier={responsive.maxFontScale}
            numberOfLines={1}
            style={[
              styles.label,
              {
                color: active ? colors.accent : colors.text,
                fontSize: responsive.nav.label,
              },
            ]}
          >
            {item.label}
          </Text>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

export function isBottomNavKey(value: string): value is BottomNavKey {
  return allItems.some((item) => item.key === value);
}

const styles = StyleSheet.create({
  shell: {
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    elevation: 14,
    flexDirection: "row",
    shadowColor: "#1D2939",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
  },
  leftGroup: {
    flex: 2,
    flexDirection: "row",
  },
  centerGroup: {
    alignItems: "center",
  },
  rightGroup: {
    flex: 2,
    flexDirection: "row",
  },
  item: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    minHeight: 56,
  },
  addItem: {
    flex: 0,
  },
  animatedItem: {
    alignItems: "center",
    justifyContent: "center",
  },
  animatedAddItem: {
  },
  iconBox: {
    alignItems: "center",
    borderRadius: 18,
    height: 38,
    justifyContent: "center",
    width: 46,
  },
  addBox: {
    elevation: 10,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
  },
  addPulse: {
    borderWidth: 2,
    position: "absolute",
    top: -4,
  },
  label: {
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
  },
});
