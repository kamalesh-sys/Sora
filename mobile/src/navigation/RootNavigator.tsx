import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { useAuth } from "../context/AuthContext";
import { AuthScreen } from "../screens/AuthScreen";
import { BillsScreen } from "../screens/BillsScreen";
import { CategoriesScreen } from "../screens/CategoriesScreen";
import { DashboardScreen } from "../screens/DashboardScreen";
import { ExpenseFormScreen } from "../screens/ExpenseFormScreen";
import { ExpensesScreen } from "../screens/ExpensesScreen";
import { GoalDetailScreen } from "../screens/GoalDetailScreen";
import { GoalsScreen } from "../screens/GoalsScreen";
import { PeopleScreen } from "../screens/PeopleScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { ReportsScreen } from "../screens/ReportsScreen";
import type { TransactionType } from "../types/api";

export type RootStackParamList = {
  Bills: undefined;
  Categories: { transactionType?: TransactionType } | undefined;
  ExpenseForm: { expenseId?: number; transactionType?: TransactionType } | undefined;
  Expenses: undefined;
  GoalDetail: { created?: boolean; goalId: number };
  Goals: undefined;
  Home: undefined;
  People: undefined;
  Profile: undefined;
  Reports: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { user } = useAuth();

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <Stack.Navigator
      screenOptions={{
        animation: "none",
        headerShown: false,
      }}
      initialRouteName="Home"
    >
      <Stack.Screen name="Home" component={DashboardScreen} />
      <Stack.Screen name="Expenses" component={ExpensesScreen} />
      <Stack.Screen name="Goals" component={GoalsScreen} />
      <Stack.Screen name="GoalDetail" component={GoalDetailScreen} />
      <Stack.Screen
        name="ExpenseForm"
        component={ExpenseFormScreen}
        options={{ presentation: "fullScreenModal" }}
      />
      <Stack.Screen name="Categories" component={CategoriesScreen} />
      <Stack.Screen name="Bills" component={BillsScreen} />
      <Stack.Screen name="People" component={PeopleScreen} />
      <Stack.Screen name="Reports" component={ReportsScreen} />
      <Stack.Screen name="Settings" component={ProfileScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
    </Stack.Navigator>
  );
}
