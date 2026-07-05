import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Text, TextInput } from "react-native-paper";

import { AppButton } from "../components/AppLayout";
import { SoraIllustration } from "../components/SoraIllustratedEmpty";
import { SoraCard, SoraHeader, SoraIconRow, SoraScreen, SoraSectionHeader } from "../components/SoraUI";
import { API_BASE_URL } from "../config/api";
import {
  AccentName,
  ThemeMode,
  accentOptions,
  useAppSettings,
} from "../context/AppSettingsContext";
import { useAuth } from "../context/AuthContext";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { useSoraResponsive } from "../theme/responsive";
import { soraPalette } from "../theme/soraTheme";
import ProfileIllustration from "../../illustrations/confident-person-walking.svg";

type Props = NativeStackScreenProps<RootStackParamList, "Profile" | "Settings">;

const moneyNotes = [
  {
    title: "Use one spending account",
    text: "Keep daily UPI and cash spending visible in one place so the monthly picture stays honest.",
  },
  {
    title: "Review every Sunday",
    text: "A 10-minute weekly check catches grocery, delivery, transport, and impulse spending before month-end.",
  },
  {
    title: "Set category limits",
    text: "Give groceries, utilities, transport, and food their own limits instead of relying only on one total budget.",
  },
  {
    title: "Keep fixed bills recurring",
    text: "Add rent, internet, subscriptions, school fees, and EMIs as bills so upcoming cash needs are clear.",
  },
  {
    title: "Separate savings first",
    text: "Move savings right after income arrives. Track spending against the money left, not the full salary.",
  },
];

export function ProfileScreen({ navigation }: Props) {
  const {
    accentColor,
    accentName,
    colors,
    customAccentColor,
    setAccentName,
    setCustomAccentColor,
    setThemeMode,
    themeMode,
  } = useAppSettings();
  const responsive = useSoraResponsive();
  const { logout, user } = useAuth();
  const inlineIllustrationSize = responsive.tiny ? 116 : responsive.compact ? 132 : 148;
  const [customColorInput, setCustomColorInput] = useState(customAccentColor);
  const customColor = customColorInput.trim();
  const customColorIsValid = /^#[0-9a-fA-F]{6}$/.test(customColor);

  const applyCustomColor = () => {
    if (customColorIsValid) {
      setCustomAccentColor(customColor);
    }
  };

  return (
    <SoraScreen>
      <SoraHeader
        title="Settings"
        subtitle="Account, app theme and money notes"
        onBack={() => navigation.goBack()}
      />

      <SoraCard tone="purple" style={styles.accountCard}>
        <View style={styles.accountContent}>
          <View style={styles.accountText}>
            <Text style={styles.accountName}>{user?.first_name || "Sora user"}</Text>
            <Text style={styles.accountEmail}>{user?.email || "No email"}</Text>
            <Text style={styles.apiText} numberOfLines={1}>API: {API_BASE_URL}</Text>
          </View>
          <SoraIllustration color="#FFFFFF" source={ProfileIllustration} size={inlineIllustrationSize} />
        </View>
      </SoraCard>

      <SoraCard>
        <Text style={[styles.blockTitle, { color: colors.text }]}>Appearance</Text>
        <View style={styles.modeRow}>
          {(["light", "dark"] as ThemeMode[]).map((mode) => (
            <AppButton
              key={mode}
              mode={themeMode === mode ? "contained" : "outlined"}
              onPress={() => setThemeMode(mode)}
              style={styles.modeButton}
            >
              {mode === "light" ? "Light" : "Dark"}
            </AppButton>
          ))}
        </View>

        <Text style={[styles.label, { color: colors.muted }]}>Accent color</Text>
        <View style={styles.colorGrid}>
          {accentOptions.map((option) => (
            <ColorDot
              active={accentName === option.name}
              color={option.color}
              key={option.name}
              onPress={() => setAccentName(option.name as AccentName)}
            />
          ))}
          <ColorDot
            active={accentName === "custom"}
            color={customColorIsValid ? customColor : accentColor}
            icon={accentName === "custom" ? "check" : "plus"}
            onPress={applyCustomColor}
          />
        </View>

        <View style={styles.customColorRow}>
          <TextInput
            autoCapitalize="none"
            label="Custom hex"
            mode="outlined"
            onChangeText={setCustomColorInput}
            placeholder="#2563eb"
            style={styles.customColorInput}
            value={customColorInput}
          />
          <AppButton mode="contained" disabled={!customColorIsValid} onPress={applyCustomColor}>
            Apply
          </AppButton>
        </View>
      </SoraCard>

      <SoraSectionHeader title="Manage" />
      <SoraCard style={styles.linkCard}>
        <SoraIconRow
          icon="shape-outline"
          iconBackground={soraPalette.purpleSoft}
          iconColor={accentColor}
          meta="Create, edit and seed defaults"
          onPress={() => navigation.navigate("Categories")}
          title="Categories"
        />
        <SoraIconRow
          icon="account-group-outline"
          iconBackground={soraPalette.greenSurface}
          iconColor={soraPalette.green}
          meta="People, email invites and ledgers"
          onPress={() => navigation.navigate("People")}
          title="People"
        />
        <SoraIconRow
          icon="home-group"
          iconBackground={soraPalette.redSurface}
          iconColor={soraPalette.red}
          meta="Shared homes, members and reports"
          onPress={() => navigation.navigate("Households")}
          title="Households"
        />
        <SoraIconRow
          icon="cash-check"
          iconBackground={soraPalette.purpleSoft}
          iconColor={accentColor}
          meta="Settlement history and cancellations"
          onPress={() => navigation.navigate("Settlements")}
          title="Settlements"
        />
      </SoraCard>

      <SoraSectionHeader title="Money Notes" />
      {moneyNotes.map((note) => (
        <SoraCard key={note.title} style={styles.noteCard}>
          <Text style={[styles.noteTitle, { color: colors.text }]}>{note.title}</Text>
          <Text style={[styles.noteText, { color: colors.muted }]}>{note.text}</Text>
        </SoraCard>
      ))}

      <AppButton mode="outlined" textColor={colors.danger} onPress={logout} style={styles.logoutButton}>
        Logout
      </AppButton>
    </SoraScreen>
  );
}

function ColorDot({
  active,
  color,
  icon = "check",
  onPress,
}: {
  active: boolean;
  color: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      android_ripple={{ color: "rgba(255,255,255,0.18)", borderless: true }}
      hitSlop={8}
      onPress={onPress}
      style={[styles.colorDot, { backgroundColor: color }, active && styles.colorDotActive]}
    >
      {active ? <MaterialCommunityIcons name={icon} size={20} color="#FFFFFF" /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  accountCard: {
    paddingVertical: 22,
  },
  accountContent: {
    alignItems: "center",
    flexDirection: "row",
  },
  accountText: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  accountName: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "900",
  },
  accountEmail: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 15,
    marginTop: 4,
  },
  apiText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    marginTop: 14,
  },
  blockTitle: {
    fontSize: 19,
    fontWeight: "900",
    marginBottom: 12,
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  modeButton: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 10,
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 14,
  },
  colorDot: {
    alignItems: "center",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  colorDotActive: {
    borderColor: "#FFFFFF",
    borderWidth: 2,
    elevation: 3,
  },
  customColorRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  customColorInput: {
    flex: 1,
  },
  linkCard: {
    gap: 4,
  },
  noteCard: {
    marginBottom: 10,
  },
  noteTitle: {
    fontSize: 17,
    fontWeight: "900",
  },
  noteText: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  logoutButton: {
    marginBottom: 18,
    marginTop: 4,
  },
});
