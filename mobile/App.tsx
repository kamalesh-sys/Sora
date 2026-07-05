import { NavigationContainer, type LinkingOptions } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { PaperProvider } from "react-native-paper";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppSettingsProvider, useAppSettings } from "./src/context/AppSettingsContext";
import { AuthProvider } from "./src/context/AuthContext";
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
      HouseholdDetail: "households/:householdId",
      Households: "households",
      People: "people",
      Profile: "profile",
      Reports: "reports",
      Settings: "settings",
      Settlements: "settlements",
    },
  },
  prefixes: ["soraexpense://"],
};

export default function App() {
  return (
    <SafeAreaProvider>
      <AppSettingsProvider>
        <AppShell />
      </AppSettingsProvider>
    </SafeAreaProvider>
  );
}

function AppShell() {
  const { paperTheme, themeMode } = useAppSettings();

  return (
    <PaperProvider theme={paperTheme}>
      <AuthProvider>
        <NavigationContainer linking={linking}>
          <StatusBar style={themeMode === "dark" ? "light" : "dark"} />
          <RootNavigator />
        </NavigationContainer>
      </AuthProvider>
    </PaperProvider>
  );
}
