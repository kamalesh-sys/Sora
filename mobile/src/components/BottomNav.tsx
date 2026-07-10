import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  { key: "Home", label: "Home", icon: "home-outline", route: "Home" },
  { key: "Expenses", label: "Expenses", icon: "receipt-text-outline", route: "Expenses" },
];

const centerItem: NavItem = { key: "Add", label: "Add", icon: "plus", route: "ExpenseForm" };

const rightItems: NavItem[] = [
  { key: "Budget", label: "Bills", icon: "calendar-clock-outline", route: "Bills" },
  { key: "Profile", label: "Reports", icon: "chart-bar", route: "Reports" },
];

const allItems = [...leftItems, centerItem, ...rightItems];

export function BottomNav({ current }: { current: BottomNavKey }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors, t } = useAppSettings();
  const insets = useSafeAreaInsets();
  const responsive = useSoraResponsive();
  const bottomInset = Platform.OS === "android" ? Math.max(insets.bottom, 0) : insets.bottom;
  const navHeight = responsive.nav.height + bottomInset;
  const navPaddingBottom = responsive.nav.paddingBottom + bottomInset;

  const renderItem = (item: NavItem) => {
    return (
      <NavItemButton
        key={item.key}
        active={item.key === current}
        item={{ ...item, label: t(item.label) }}
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
          height: navHeight,
          minHeight: navHeight,
          paddingBottom: navPaddingBottom,
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
  const { colors, language } = useAppSettings();
  const { navTap } = useFeedback();
  const isAdd = item.key === "Add";
  const iconColor = isAdd ? "#ffffff" : active ? colors.accent : colors.muted;
  const rippleColor = isAdd ? "rgba(255,255,255,0.26)" : `${colors.accent}24`;

  return (
    <Pressable
      accessibilityLabel={item.label}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      android_ripple={{ color: rippleColor, borderless: true }}
      onPress={() => {
        navTap();
        onPress();
      }}
      style={[
        styles.item,
        isAdd && styles.addItem,
        isAdd && { width: responsive.nav.fabSize + 8 },
      ]}
      hitSlop={8}
    >
      <View style={[styles.animatedItem, isAdd && [styles.animatedAddItem, { marginTop: -Math.round(responsive.nav.fabSize * 0.34) }]]}>
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
          <MaterialCommunityIcons
            name={item.icon}
            size={isAdd ? Math.round(responsive.nav.fabSize * 0.5) : responsive.nav.iconSize + 3}
            color={iconColor}
          />
        </View>
        {!isAdd ? (
          <Text
            maxFontSizeMultiplier={responsive.maxFontScale}
            numberOfLines={1}
            style={[
              styles.label,
              {
                color: active ? colors.accent : colors.muted,
                fontSize: responsive.nav.label,
                fontFamily: language === "en" ? "Inter_600SemiBold" : "sans-serif-medium",
              },
            ]}
          >
            {item.label}
          </Text>
        ) : null}
      </View>
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
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    elevation: 8,
    flexDirection: "row",
    shadowColor: "#1D2939",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
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
  animatedAddItem: {},
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
  label: {
    includeFontPadding: false,
    lineHeight: 14,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
});
