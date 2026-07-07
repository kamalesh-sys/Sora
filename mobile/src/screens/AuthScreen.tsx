import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, LayoutAnimation, Modal, Platform, Pressable, StyleSheet, TextInput, UIManager, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { AppButton, AppCard, AppScreen, AppSegmentedControl, AppText, ErrorState, FormField, useDs } from "../design-system";
import { dsRadius, dsSpace, dsTouch } from "../design-system/tokens";
import { TurnstileBox } from "../components/TurnstileBox";
import { useAuth } from "../context/AuthContext";

type AuthMode = "login" | "signup";

const authModes: Array<{ label: string; value: AuthMode }> = [
  { label: "Log in", value: "login" },
  { label: "Sign up", value: "signup" },
];

if (Platform.OS === "android") {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

export function AuthScreen() {
  const { login, register } = useAuth();
  const stretch = useRef(new Animated.Value(1)).current;
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
  const title = isSignup ? "Create account" : "Log in";
  const actionLabel = isSignup ? "Create account" : "Log in";
  const loadingLabel = isSignup ? "Creating account" : "Logging in";

  const passwordPlaceholder = useMemo(() => (isSignup ? "Minimum 12 characters" : "Password"), [isSignup]);
  const stretchStyle = {
    transform: [{ scaleY: stretch }],
  };

  const switchMode = (nextMode: AuthMode) => {
    if (nextMode === mode) return;
    stretch.stopAnimation();
    stretch.setValue(0.985);
    LayoutAnimation.configureNext({
      create: { duration: 220, property: LayoutAnimation.Properties.opacity, type: LayoutAnimation.Types.easeInEaseOut },
      delete: { duration: 160, property: LayoutAnimation.Properties.opacity, type: LayoutAnimation.Types.easeInEaseOut },
      duration: 260,
      update: { type: LayoutAnimation.Types.easeInEaseOut },
    });
    setMode(nextMode);
    setError("");
    setTurnstileToken("");
    setTurnstileResetKey((current) => current + 1);
    Animated.spring(stretch, {
      friction: 7,
      tension: 140,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  const validate = () => {
    const cleanEmail = email.trim();
    if (!cleanEmail) return "Email is required.";
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) return "Enter a valid email address.";
    if (!password) return "Password is required.";
    if (isSignup && password.length < 12) return "Password must be at least 12 characters.";
    if (!turnstileToken) return "Complete human verification.";
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
    } catch {
      setError(isSignup ? "Could not create account." : "Invalid email or password.");
      setTurnstileToken("");
      setTurnstileResetKey((current) => current + 1);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppScreen contentStyle={styles.content}>
      <Animated.View style={[styles.brandWrap, stretchStyle]}>
        <AppText style={styles.brandTitle} variant="title">Sora Expense</AppText>
      </Animated.View>

      <Animated.View style={stretchStyle}>
        <AppCard elevated style={styles.panel}>
          <AppSegmentedControl accessibilityLabel="Authentication mode" items={authModes} onChange={switchMode} style={styles.modeSwitch} value={mode} />

          <AppText style={styles.title} variant="title">{title}</AppText>

          <ErrorState text={error} />

          {isSignup ? (
            <FormField
              autoCapitalize="words"
              editable={!loading}
              label="Name"
              onChangeText={setName}
              placeholder="Your name"
              returnKeyType="next"
              style={styles.field}
              value={name}
            />
          ) : null}

          <FormField
            autoCapitalize="none"
            editable={!loading}
            keyboardType="email-address"
            label="Email"
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

          <AppButton block disabled={loading} loading={loading} onPress={submit} style={styles.submit}>
            {actionLabel}
          </AppButton>
        </AppCard>
      </Animated.View>

      <AuthLoadingOverlay label={loadingLabel} visible={loading} />
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
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <AppText color="textMuted" style={styles.label} variant="label">
        Password
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
          accessibilityLabel={secure ? "Show password" : "Hide password"}
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

function AuthLoadingOverlay({ label, visible }: { label: string; visible: boolean }) {
  const { colors } = useDs();
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    spin.setValue(0);
    pulse.setValue(0);
    const spinAnimation = Animated.loop(
      Animated.timing(spin, {
        duration: 900,
        easing: Easing.linear,
        toValue: 1,
        useNativeDriver: true,
      })
    );
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          duration: 650,
          easing: Easing.out(Easing.quad),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          duration: 650,
          easing: Easing.in(Easing.quad),
          toValue: 0,
          useNativeDriver: true,
        }),
      ])
    );
    spinAnimation.start();
    pulseAnimation.start();
    return () => {
      spinAnimation.stop();
      pulseAnimation.stop();
    };
  }, [pulse, spin, visible]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1.04],
  });

  return (
    <Modal animationType="fade" transparent visible={visible}>
      <View style={styles.loadingOverlay}>
        <View style={[styles.loadingPanel, { backgroundColor: colors.surface }]}>
          <Animated.View
            style={[
              styles.loadingRing,
              {
                borderColor: colors.border,
                borderTopColor: colors.accent,
                transform: [{ rotate }, { scale }],
              },
            ]}
          />
          <AppText style={styles.loadingText} variant="headline">{label}</AppText>
        </View>
      </View>
    </Modal>
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
  loadingOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(10,11,13,0.42)",
    flex: 1,
    justifyContent: "center",
    padding: dsSpace[2],
  },
  loadingPanel: {
    alignItems: "center",
    borderRadius: dsRadius.lg,
    minWidth: 188,
    padding: dsSpace[3],
  },
  loadingRing: {
    borderRadius: 28,
    borderWidth: 3,
    height: 56,
    width: 56,
  },
  loadingText: {
    marginTop: dsSpace[2],
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
