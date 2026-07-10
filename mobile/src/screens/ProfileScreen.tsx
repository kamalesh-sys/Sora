import { useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import ColorPicker from "react-native-wheel-color-picker";

import {
  AppButton,
  AppCard,
  AppScreen,
  AppSegmentedControl,
  AppText,
  IconButton,
  ListRow,
  SectionHeader,
  dsRadius,
  dsSpace,
  useDs,
} from "../design-system";
import { AccentName, ThemeMode, accentOptions, useAppSettings } from "../context/AppSettingsContext";
import { useAuth } from "../context/AuthContext";
import { AbstractAvatar, abstractAvatarOptions, type AbstractAvatarKey } from "../components/AbstractAvatar";
import { languageOptions, useI18n } from "../i18n";
import type { RootStackParamList } from "../navigation/RootNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Profile" | "Settings">;

const appVersion = "1.0.0";
const moneyNotes = [
  {
    title: "Use one spending account",
    text: "Keep daily UPI and cash spending visible in one place so the monthly picture stays honest.",
  },
  {
    title: "Review every Sunday",
    text: "A 10-minute weekly check catches grocery, delivery, transport and food delivery before month-end.",
  },
  {
    title: "Keep fixed bills recurring",
    text: "Add rent, internet, subscriptions, school fees and EMIs as bills so upcoming cash needs are clear.",
  },
];

export function ProfileScreen({ navigation }: Props) {
  const { colors } = useDs();
  const { t } = useI18n();
  const {
    accentColor,
    accentName,
    avatarKey,
    customAccentColor,
    language,
    setAccentName,
    setAvatarKey,
    setCustomAccentColor,
    setLanguage,
    setThemeMode,
    themeMode,
  } = useAppSettings();
  const { logout, user } = useAuth();
  const [customPickerOpen, setCustomPickerOpen] = useState(accentName === "custom");
  const [draftCustomColor, setDraftCustomColor] = useState(customAccentColor);

  const applyPickerColor = (nextColor: string) => {
    if (/^#[0-9a-fA-F]{6}$/.test(nextColor)) {
      setDraftCustomColor(nextColor);
      setCustomAccentColor(nextColor);
    }
  };

  const confirmLogout = () => {
    Alert.alert(t("Logout"), t("You will need to sign in again."), [
      { text: t("Cancel"), style: "cancel" },
      { text: t("Logout"), style: "destructive", onPress: logout },
    ]);
  };

  return (
    <AppScreen>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <AppText variant="title">{t("Settings")}</AppText>
          <AppText color="textSubtle" variant="caption">{t("Account, theme and app preferences")}</AppText>
        </View>
        <IconButton accessibilityLabel={t("Close settings")} icon="close" onPress={() => navigation.goBack()} />
      </View>

      <AppCard>
        <View style={styles.accountRow}>
          <AbstractAvatar size={56} variant={avatarKey} />
          <View style={styles.accountText}>
            <AppText numberOfLines={1} variant="headline">{user?.first_name || t("Sora user")}</AppText>
            <AppText color="textSubtle" numberOfLines={1} variant="caption">{user?.email || t("No email")}</AppText>
          </View>
        </View>
      </AppCard>

      <SectionHeader title={t("Profile avatar")} />
      <AppCard>
        <AppText color="textMuted" style={styles.label} variant="label">{t("Choose an avatar")}</AppText>
        <View style={styles.avatarGrid}>
          {abstractAvatarOptions.map((option) => (
            <AvatarOption active={avatarKey === option} key={option} onPress={() => setAvatarKey(option)} option={option} />
          ))}
        </View>
      </AppCard>

      <SectionHeader title={t("Appearance")} />
      <AppCard>
        <AppText color="textMuted" style={styles.label} variant="label">{t("Theme")}</AppText>
        <View style={styles.modeRow}>
          {(["light", "dark"] as ThemeMode[]).map((mode) => (
            <AppButton key={mode} onPress={() => setThemeMode(mode)} style={styles.modeButton} variant={themeMode === mode ? "primary" : "secondary"}>
              {t(mode === "light" ? "Light" : "Dark")}
            </AppButton>
          ))}
        </View>

        <AppText color="textMuted" style={styles.label} variant="label">{t("Accent")}</AppText>
        <View style={styles.colorGrid}>
          {accentOptions.map((option) => (
            <ColorDot
              active={accentName === option.name}
              color={option.color}
              key={option.name}
              onPress={() => {
                setAccentName(option.name as AccentName);
                setCustomPickerOpen(false);
              }}
            />
          ))}
          <ColorDot
            active={accentName === "custom"}
            color={accentName === "custom" ? accentColor : draftCustomColor}
            icon="pencil-outline"
            onPress={() => {
              setCustomPickerOpen((current) => !current);
              setCustomAccentColor(draftCustomColor);
            }}
            showIcon
          />
        </View>

        {customPickerOpen ? (
          <View style={[styles.colorPickerPanel, { borderColor: colors.border }]}>
            <View style={styles.colorPickerHeader}>
              <AppText variant="bodyStrong">{t("Custom color")}</AppText>
              <View style={[styles.colorPreview, { backgroundColor: draftCustomColor }]} />
            </View>
            <ColorPicker
              color={draftCustomColor}
              gapSize={12}
              onColorChange={setDraftCustomColor}
              onColorChangeComplete={applyPickerColor}
              palette={accentOptions.map((option) => option.color)}
              sliderSize={22}
              swatches
              swatchesLast
              thumbSize={28}
            />
          </View>
        ) : null}
      </AppCard>

      <SectionHeader title={t("Language")} />
      <AppCard>
        <AppText color="textMuted" style={styles.label} variant="label">{t("App language")}</AppText>
        <AppSegmentedControl
          accessibilityLabel={t("App language")}
          items={languageOptions.map((option) => ({ label: option.label, value: option.language }))}
          onChange={setLanguage}
          value={language}
        />
      </AppCard>

      <SectionHeader title={t("Manage")} />
      <AppCard>
        <ListRow description={t("Targets, contributions and monthly plans")} icon="target" onPress={() => navigation.navigate("Goals")} title={t("Goals")} />
        <ListRow description={t("Create, edit and seed defaults")} icon="tag-multiple-outline" onPress={() => navigation.navigate("Categories")} title={t("Categories")} />
        <ListRow description={t("People, balances and history")} icon="account-multiple-outline" onPress={() => navigation.navigate("People")} title={t("People")} />
        <ListRow description={t("CSV and PDF are available from Reports")} icon="file-export-outline" onPress={() => navigation.navigate("Reports")} title={t("Export data")} />
      </AppCard>

      <SectionHeader title={t("Money notes")} />
      {moneyNotes.map((note) => (
        <AppCard key={note.title}>
          <AppText variant="bodyStrong">{t(note.title)}</AppText>
          <AppText color="textMuted" style={styles.noteText} variant="body">{t(note.text)}</AppText>
        </AppCard>
      ))}

      <SectionHeader title={t("About")} />
      <AppCard>
        <ListRow description={`${t("Version")} ${appVersion}`} icon="information-outline" title="Sora Expense" />
      </AppCard>

      <AppButton onPress={confirmLogout} variant="danger">{t("Logout")}</AppButton>
    </AppScreen>
  );
}

function AvatarOption({ active, onPress, option }: { active: boolean; onPress: () => void; option: AbstractAvatarKey }) {
  const { colors } = useDs();
  return (
    <Pressable
      accessibilityLabel={`Use ${option} avatar`}
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.avatarOption, { borderColor: active ? colors.accent : colors.border, backgroundColor: colors.surface }]}
    >
      <AbstractAvatar size={44} variant={option} />
      {active ? <View style={[styles.avatarCheck, { backgroundColor: colors.accent }]}><MaterialCommunityIcons color="#FFFFFF" name="check" size={12} /></View> : null}
    </Pressable>
  );
}

function ColorDot({
  active,
  color,
  icon = "check",
  onPress,
  showIcon = false,
}: {
  active: boolean;
  color: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
  showIcon?: boolean;
}) {
  return (
    <Pressable
      android_ripple={{ color: "rgba(255,255,255,0.18)", borderless: true }}
      hitSlop={8}
      onPress={onPress}
      style={[styles.colorDot, { backgroundColor: color }, active && styles.colorDotActive]}
    >
      {active || showIcon ? <MaterialCommunityIcons name={icon} size={20} color="#FFFFFF" /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  accountRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: dsSpace[1.5],
  },
  accountText: {
    flex: 1,
    minWidth: 0,
  },
  avatarCheck: {
    alignItems: "center",
    borderColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 2,
    bottom: -3,
    height: 20,
    justifyContent: "center",
    position: "absolute",
    right: -3,
    width: 20,
  },
  avatarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: dsSpace[1],
  },
  avatarOption: {
    alignItems: "center",
    borderRadius: dsRadius.md,
    borderWidth: 1,
    height: 60,
    justifyContent: "center",
    position: "relative",
    width: 60,
  },
  colorDot: {
    alignItems: "center",
    borderRadius: dsRadius.pill,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  colorDotActive: {
    borderColor: "#FFFFFF",
    borderWidth: 2,
    elevation: 3,
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: dsSpace[1.5],
    marginBottom: dsSpace[2],
  },
  colorPickerHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: dsSpace[1.5],
  },
  colorPickerPanel: {
    borderRadius: dsRadius.lg,
    borderWidth: 1,
    height: 330,
    padding: dsSpace[2],
  },
  colorPreview: {
    borderColor: "rgba(255,255,255,0.75)",
    borderRadius: dsRadius.pill,
    borderWidth: 2,
    height: 32,
    width: 32,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: dsSpace[1],
    marginBottom: dsSpace[2],
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    marginBottom: dsSpace[1],
  },
  modeButton: {
    flex: 1,
  },
  modeRow: {
    flexDirection: "row",
    gap: dsSpace[1],
    marginBottom: dsSpace[2],
  },
  noteText: {
    marginTop: dsSpace[0.5],
  },
});
