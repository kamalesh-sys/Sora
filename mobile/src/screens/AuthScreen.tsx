import { useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { AppButton, AppCard, AppScreen, AppSegmentedControl, AppText, ErrorState, FormField, useDs } from "../design-system";
import { dsRadius, dsSpace, dsTouch } from "../design-system/tokens";
import { TurnstileBox } from "../components/TurnstileBox";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n";
import { getApiErrorMessage } from "../services/apiClient";

type AuthMode = "login" | "signup";

const authModes: Array<{ label: string; value: AuthMode }> = [
  { label: "Log in", value: "login" },
  { label: "Sign up", value: "signup" },
];

export function AuthScreen() {
  const { login, register } = useAuth();
  const { t } = useI18n();
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isSignup = mode === "signup";
  const title = t(isSignup ? "Create account" : "Log in");
  const actionLabel = t(isSignup ? "Create account" : "Log in");
  const localizedAuthModes = useMemo(() => authModes.map((item) => ({ ...item, label: t(item.label) })), [t]);

  const passwordPlaceholder = useMemo(() => t(isSignup ? "Minimum 12 characters" : "Password"), [isSignup, t]);
  const switchMode = (nextMode: AuthMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    setError("");
    setTurnstileToken("");
    setTurnstileResetKey((current) => current + 1);
  };

  const validate = () => {
    const cleanEmail = email.trim();
    if (!cleanEmail) return t("Email is required.");
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) return t("Enter a valid email address.");
    if (!password) return t("Password is required.");
    if (isSignup && password.length < 12) return t("Password must be at least 12 characters.");
    if (!turnstileToken) return t("Complete human verification.");
    return "";
  };

  const submit = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError("");
    try {
      if (isSignup) {
        await register(name.trim(), email.trim(), password, turnstileToken);
      } else {
        await login(email.trim(), password, turnstileToken);
      }
    } catch (submitError) {
      setError(t(getApiErrorMessage(submitError, isSignup ? "Could not create account." : "Invalid email or password.")));
      setTurnstileToken("");
      setTurnstileResetKey((current) => current + 1);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppScreen contentStyle={styles.content}>
      <View style={styles.brandWrap}>
        <AppText style={styles.brandTitle} variant="title">Sora Expense</AppText>
      </View>

      <AppCard elevated style={styles.panel}>
          <AppSegmentedControl accessibilityLabel={t("Authentication mode")} items={localizedAuthModes} onChange={switchMode} style={styles.modeSwitch} value={mode} />

          <AppText style={styles.title} variant="title">{title}</AppText>

          <ErrorState text={error} />

          {isSignup ? (
            <FormField
              autoCapitalize="words"
              editable={!loading}
              label={t("Name")}
              onChangeText={setName}
              placeholder={t("Your name")}
              returnKeyType="next"
              style={styles.field}
              value={name}
            />
          ) : null}

          <FormField
            autoCapitalize="none"
            editable={!loading}
            keyboardType="email-address"
            label={t("Email")}
            onChangeText={setEmail}
            placeholder="you@example.com"
            returnKeyType="next"
            style={styles.field}
            textContentType="emailAddress"
            value={email}
          />

          <PasswordField
            disabled={loading}
            onChangeText={setPassword}
            onToggle={() => setShowPassword((current) => !current)}
            placeholder={passwordPlaceholder}
            secure={!showPassword}
            value={password}
          />

          <View style={styles.turnstile}>
            <TurnstileBox
              resetKey={turnstileResetKey}
              token={turnstileToken}
              onError={setError}
              onToken={setTurnstileToken}
            />
          </View>

          <AppButton block disabled={loading} onPress={submit} style={styles.submit}>
            {loading ? t("Please wait") : actionLabel}
          </AppButton>
      </AppCard>
    </AppScreen>
  );
}

function PasswordField({
  disabled,
  onChangeText,
  onToggle,
  placeholder,
  secure,
  value,
}: {
  disabled: boolean;
  onChangeText: (value: string) => void;
  onToggle: () => void;
  placeholder: string;
  secure: boolean;
  value: string;
}) {
  const { colors } = useDs();
  const { t } = useI18n();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <AppText color="textMuted" style={styles.label} variant="label">
        {t("Password")}
      </AppText>
      <View
        style={[
          styles.passwordBox,
          {
            backgroundColor: colors.surface,
            borderColor: focused ? colors.accent : colors.border,
            borderWidth: focused ? 2 : 1,
          },
        ]}
      >
        <TextInput
          editable={!disabled}
          onBlur={() => setFocused(false)}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          placeholder={placeholder}
          placeholderTextColor={colors.textSubtle}
          secureTextEntry={secure}
          selectionColor={colors.accent}
          style={[styles.passwordInput, { color: colors.text }]}
          textContentType="password"
          value={value}
        />
        <Pressable
          accessibilityLabel={t(secure ? "Show password" : "Hide password")}
          accessibilityRole="button"
          android_ripple={{ color: colors.press, borderless: true }}
          hitSlop={8}
          onPress={onToggle}
          style={styles.eyeButton}
        >
          <MaterialCommunityIcons name={secure ? "eye-outline" : "eye-off-outline"} size={22} color={colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  brandTitle: {
    textAlign: "center",
  },
  brandWrap: {
    alignItems: "center",
    marginBottom: dsSpace[3],
  },
  content: {
    justifyContent: "center",
    paddingBottom: dsSpace[5],
    paddingTop: dsSpace[3],
  },
  eyeButton: {
    alignItems: "center",
    borderRadius: dsRadius.pill,
    height: dsTouch.comfortable,
    justifyContent: "center",
    width: dsTouch.comfortable,
  },
  field: {
    marginBottom: dsSpace[1.5],
  },
  label: {
    marginBottom: dsSpace[0.5],
  },
  modeSwitch: {
    marginBottom: dsSpace[3],
  },
  panel: {
    padding: dsSpace[2],
  },
  passwordBox: {
    alignItems: "center",
    borderRadius: dsRadius.sm,
    flexDirection: "row",
    minHeight: dsTouch.large,
    paddingLeft: dsSpace[1.5],
    paddingRight: dsSpace[0.5],
  },
  passwordInput: {
    flex: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 16,
    minWidth: 0,
    paddingVertical: 0,
  },
  submit: {
    marginTop: dsSpace[0.5],
  },
  title: {
    marginBottom: dsSpace[2],
  },
  turnstile: {
    marginBottom: dsSpace[1],
  },
});
