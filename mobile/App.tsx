import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  Inter_900Black,
} from "@expo-google-fonts/inter";
import { useCallback, useEffect, useState } from "react";
import { useFonts } from "expo-font";
import * as NavigationBar from "expo-navigation-bar";
import { NavigationContainer, type LinkingOptions } from "@react-navigation/native";
import { Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { PaperProvider } from "react-native-paper";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { StartupLoadingScreen } from "./src/components/StartupLoadingScreen";
import { AppSettingsProvider, useAppSettings } from "./src/context/AppSettingsContext";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { FeedbackProvider } from "./src/context/FeedbackContext";
import { AppErrorBoundary } from "./src/components/AppErrorBoundary";
import { RootNavigator } from "./src/navigation/RootNavigator";
import type { RootStackParamList } from "./src/navigation/RootNavigator";
import { client } from "./src/services/apiClient";

const linking: LinkingOptions<RootStackParamList> = {
  config: {
    screens: {
      Bills: "bills",
      Categories: "categories",
      ExpenseForm: "add-expense",
      Expenses: "expenses",
      Home: "home",
      People: "people",
      Profile: "profile",
      Reports: "reports",
      Settings: "settings",
    },
  },
  prefixes: ["soraexpense://"],
};

export default function App() {
  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
        <AppSettingsProvider>
          <AppShell />
        </AppSettingsProvider>
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}

function AppShell() {
  const { paperTheme, settingsReady, themeMode } = useAppSettings();
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Inter_900Black,
  });

  const syncAndroidNavigationBar = useCallback(() => {
    if (Platform.OS !== "android") return;

    const background = themeMode === "dark" ? "#0A0B0D" : "#FFFFFF";
    const buttonStyle = themeMode === "dark" ? "light" : "dark";
    const edgeStyle = themeMode === "dark" ? "dark" : "light";

    try {
      NavigationBar.setStyle(edgeStyle);
    } catch {
      // Android system-bar APIs vary by API level and device navigation mode.
    }

    void Promise.all([
      NavigationBar.setVisibilityAsync("visible"),
      NavigationBar.setPositionAsync("relative"),
      NavigationBar.setBehaviorAsync("inset-touch"),
      NavigationBar.setBackgroundColorAsync(background),
      NavigationBar.setBorderColorAsync(background),
      NavigationBar.setButtonStyleAsync(buttonStyle),
    ]).catch(() => undefined);
  }, [themeMode]);

  useEffect(() => {
    syncAndroidNavigationBar();
  }, [syncAndroidNavigationBar]);

  return (
    <PaperProvider theme={paperTheme}>
      <FeedbackProvider>
        <AuthProvider>
          <BootGate
            fontsLoaded={fontsLoaded}
            settingsReady={settingsReady}
            syncAndroidNavigationBar={syncAndroidNavigationBar}
            themeMode={themeMode}
          />
        </AuthProvider>
      </FeedbackProvider>
    </PaperProvider>
  );
}

function BootGate({
  fontsLoaded,
  settingsReady,
  syncAndroidNavigationBar,
  themeMode,
}: {
  fontsLoaded: boolean;
  settingsReady: boolean;
  syncAndroidNavigationBar: () => void;
  themeMode: "light" | "dark";
}) {
  const { initializing } = useAuth();
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [apiReady, setApiReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMinTimeElapsed(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    let retryTimer: NodeJS.Timeout;

    const checkHealth = async () => {
      try {
        const response = await client.get("/health/");
        if (response.data && response.data.status === "ok") {
          if (active) {
            setApiReady(true);
          }
          return;
        }
      } catch (err) {
        // failed or timed out, will retry
      }
      
      if (active) {
        retryTimer = setTimeout(checkHealth, 4000);
      }
    };

    checkHealth();

    return () => {
      active = false;
      clearTimeout(retryTimer);
    };
  }, []);

  if (!fontsLoaded || !settingsReady || initializing || !minTimeElapsed || !apiReady) {
    return (
      <>
        <StatusBar style="light" />
        <StartupLoadingScreen />
      </>
    );
  }

  const statusBarStyle = themeMode === "dark" ? "light" : "dark";

  return (
    <NavigationContainer
      linking={linking}
      onReady={syncAndroidNavigationBar}
      onStateChange={syncAndroidNavigationBar}
    >
      <StatusBar style={statusBarStyle} />
      <RootNavigator />
    </NavigationContainer>
  );
}
