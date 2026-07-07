import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  Inter_900Black,
} from "@expo-google-fonts/inter";
import { useFonts } from "expo-font";
import { NavigationContainer, type LinkingOptions } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { PaperProvider } from "react-native-paper";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { StartupLoadingScreen } from "./src/components/StartupLoadingScreen";
import { AppSettingsProvider, useAppSettings } from "./src/context/AppSettingsContext";
import { AuthProvider } from "./src/context/AuthContext";
import { FeedbackProvider } from "./src/context/FeedbackContext";
import { AppErrorBoundary } from "./src/components/AppErrorBoundary";
import { RootNavigator } from "./src/navigation/RootNavigator";
import type { RootStackParamList } from "./src/navigation/RootNavigator";

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
  const { paperTheme, themeMode } = useAppSettings();
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Inter_900Black,
  });

  if (!fontsLoaded) {
    return <StartupLoadingScreen />;
  }

  return (
    <PaperProvider theme={paperTheme}>
      <FeedbackProvider>
        <AuthProvider>
          <NavigationContainer linking={linking}>
            <StatusBar style={themeMode === "dark" ? "light" : "dark"} />
            <RootNavigator />
          </NavigationContainer>
        </AuthProvider>
      </FeedbackProvider>
    </PaperProvider>
  );
}
