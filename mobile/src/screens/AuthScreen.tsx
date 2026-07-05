import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { Text, TextInput } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppButton } from "../components/AppLayout";
import { SoraIllustration } from "../components/SoraIllustratedEmpty";
import { useAppSettings } from "../context/AppSettingsContext";
import { useAuth } from "../context/AuthContext";
import { useSoraResponsive } from "../theme/responsive";
import { soraShadow } from "../theme/soraTheme";
import AuthIllustration from "../../illustrations/person-working-on-laptop.svg";
import SoraLogo from "../assets/sora-logo.svg";

type AuthMode = "login" | "signup";

export function AuthScreen() {
  const { colors } = useAppSettings();
  const responsive = useSoraResponsive();
  const inlineIllustrationSize = responsive.tiny ? 116 : responsive.compact ? 132 : 148;
  const { login, register, requestOtp } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [otpSent, setOtpSent] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isSignup = mode === "signup";
  const title = useMemo(() => {
    if (!isSignup) {
      return "Welcome back";
    }
    return otpSent ? "Verify your email" : "Create account";
  }, [isSignup, otpSent]);

  const resetStatus = () => {
    setMessage("");
    setError("");
  };

  const validate = () => {
    if (!email.trim()) {
      return "Email is required.";
    }
    if (!password.trim()) {
      return "Password is required.";
    }
    if (isSignup && password.length < 8) {
      return "Password must be at least 8 characters.";
    }
    return "";
  };

  const sendOtp = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    resetStatus();
    try {
      await requestOtp(email.trim());
      setOtpSent(true);
      setOtp("");
      setMessage("OTP sent to your email.");
    } catch {
      setError("Could not send OTP.");
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (isSignup && !otpSent) {
      await sendOtp();
      return;
    }

    if (isSignup && !/^\d{6}$/.test(otp.trim())) {
      setError("Enter the 6-digit OTP.");
      return;
    }

    setLoading(true);
    resetStatus();
    try {
      if (isSignup) {
        await register(name.trim(), email.trim(), password, otp.trim());
      } else {
        await login(email.trim(), password);
      }
    } catch {
      setError(isSignup ? "Could not create account." : "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setOtpSent(false);
    setOtp("");
    resetStatus();
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 18}
        style={styles.keyboard}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              maxWidth: responsive.maxContentWidth,
              paddingHorizontal: responsive.dashboard.contentPaddingX,
            },
          ]}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.hero, soraShadow.purple, { backgroundColor: colors.accent }]}>
            <View style={styles.heroTop}>
              <View style={styles.heroTextBlock}>
                <View style={styles.logoCircle}>
                  <SoraLogo height={56} width={56} />
                </View>
                <Text style={styles.heroTitle}>Sora Expense</Text>
                <Text style={styles.heroText}>Track house spending, bills, people and reports without the clutter.</Text>
              </View>
              <View style={styles.heroIllustration}>
                <SoraIllustration color="#FFFFFF" source={AuthIllustration} size={inlineIllustrationSize} />
              </View>
            </View>
          </View>

          <View style={[styles.panel, soraShadow.soft, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.modeRow, { backgroundColor: colors.background }]}>
              <AppButton mode={mode === "login" ? "contained" : "text"} onPress={() => switchMode("login")} style={styles.modeButton}>
                Login
              </AppButton>
              <AppButton mode={mode === "signup" ? "contained" : "text"} onPress={() => switchMode("signup")} style={styles.modeButton}>
                Sign up
              </AppButton>
            </View>

            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              {isSignup ? "Use email OTP to create your account." : "Login with your email and password."}
            </Text>

            {isSignup ? (
              <TextInput
                autoCapitalize="words"
                disabled={otpSent || loading}
                label="Name"
                mode="outlined"
                onChangeText={setName}
                style={styles.input}
                value={name}
              />
            ) : null}

            <TextInput
              autoCapitalize="none"
              disabled={otpSent || loading}
              keyboardType="email-address"
              label="Email"
              mode="outlined"
              onChangeText={setEmail}
              style={styles.input}
              value={email}
            />
            <TextInput
              disabled={otpSent || loading}
              label="Password"
              mode="outlined"
              onChangeText={setPassword}
              right={
                <TextInput.Icon
                  forceTextInputFocus={false}
                  icon={showPassword ? "eye-off-outline" : "eye-outline"}
                  onPress={() => setShowPassword((current) => !current)}
                />
              }
              secureTextEntry={!showPassword}
              style={styles.input}
              value={password}
            />

            {isSignup && otpSent ? (
              <TextInput
                keyboardType="number-pad"
                label="OTP"
                maxLength={6}
                mode="outlined"
                onChangeText={setOtp}
                style={styles.input}
                value={otp}
              />
            ) : null}

            {message ? <Text style={[styles.message, { color: colors.success }]}>{message}</Text> : null}
            {error ? <Text style={[styles.message, { color: colors.danger }]}>{error}</Text> : null}

            <AppButton
              contentStyle={styles.primaryContent}
              disabled={loading}
              loading={loading}
              mode="contained"
              onPress={submit}
              style={styles.primaryButton}
            >
              {!isSignup ? "Login" : otpSent ? "Verify and create account" : "Send OTP"}
            </AppButton>

            {isSignup && otpSent ? (
              <AppButton disabled={loading} mode="text" onPress={sendOtp}>
                Resend OTP
              </AppButton>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  keyboard: {
    flex: 1,
  },
  content: {
    alignSelf: "center",
    flexGrow: 1,
    justifyContent: "flex-start",
    paddingBottom: 44,
    paddingTop: 18,
    width: "100%",
  },
  hero: {
    borderRadius: 26,
    marginBottom: 18,
    padding: 18,
  },
  heroIllustration: {
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },
  heroTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  heroTop: {
    alignItems: "center",
    flexDirection: "row",
  },
  logoCircle: {
    alignItems: "center",
    borderRadius: 28,
    height: 56,
    justifyContent: "center",
    marginBottom: 18,
    width: 56,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "900",
  },
  heroText: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 15,
    lineHeight: 21,
    marginTop: 6,
  },
  panel: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
  },
  modeRow: {
    borderRadius: 18,
    flexDirection: "row",
    gap: 6,
    marginBottom: 18,
    padding: 5,
  },
  modeButton: {
    flex: 1,
  },
  title: {
    fontSize: 26,
    fontWeight: "900",
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
    marginTop: 4,
  },
  input: {
    marginBottom: 12,
  },
  message: {
    fontSize: 14,
    marginBottom: 10,
  },
  primaryButton: {
    borderRadius: 12,
    marginTop: 2,
  },
  primaryContent: {
    height: 50,
  },
});
