import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";

import { StartupLoadingScreen } from "../components/StartupLoadingScreen";
import { useAuth } from "../context/AuthContext";
import { AuthScreen } from "../screens/AuthScreen";
import { BillsScreen } from "../screens/BillsScreen";
import { CategoriesScreen } from "../screens/CategoriesScreen";
import { DashboardScreen } from "../screens/DashboardScreen";
import { ExpenseFormScreen } from "../screens/ExpenseFormScreen";
import { ExpensesScreen } from "../screens/ExpensesScreen";
import { PeopleScreen } from "../screens/PeopleScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { ReportsScreen } from "../screens/ReportsScreen";

export type RootStackParamList = {
  Bills: undefined;
  Categories: undefined;
  ExpenseForm: { expenseId?: number } | undefined;
  Expenses: undefined;
  Home: undefined;
  People: undefined;
  Profile: undefined;
  Reports: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { initializing, user } = useAuth();
  const [minimumStartupDone, setMinimumStartupDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinimumStartupDone(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  if (initializing || !minimumStartupDone) {
    return <StartupLoadingScreen />;
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <Stack.Navigator
      screenOptions={{
        animation: "fade_from_bottom",
        animationDuration: 140,
        headerShown: false,
      }}
      initialRouteName="Home"
    >
      <Stack.Screen name="Home" component={DashboardScreen} />
      <Stack.Screen name="Expenses" component={ExpensesScreen} />
      <Stack.Screen name="ExpenseForm" component={ExpenseFormScreen} />
      <Stack.Screen name="Categories" component={CategoriesScreen} />
      <Stack.Screen name="Bills" component={BillsScreen} />
      <Stack.Screen name="People" component={PeopleScreen} />
      <Stack.Screen name="Reports" component={ReportsScreen} />
      <Stack.Screen name="Settings" component={ProfileScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
    </Stack.Navigator>
  );
}
