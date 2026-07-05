import { useCallback, useState } from "react";
import { StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Text, TextInput } from "react-native-paper";

import { AppButton } from "../components/AppLayout";
import { SoraCard, SoraEmpty, SoraError, SoraHeader, SoraIconRow, SoraRowSkeleton, SoraScreen, SoraSectionHeader } from "../components/SoraUI";
import { useAppSettings } from "../context/AppSettingsContext";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { createHousehold, getHouseholds } from "../services/expenseApi";
import { soraPalette } from "../theme/soraTheme";
import type { Household } from "../types/api";
import { formatCurrencyCompact } from "../utils/format";

type Props = NativeStackScreenProps<RootStackParamList, "Households">;

export function HouseholdsScreen({ navigation }: Props) {
  const { colors } = useAppSettings();
  const [households, setHouseholds] = useState<Household[]>([]);
  const [name, setName] = useState("");
  const [budget, setBudget] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setHouseholds(await getHouseholds());
    } catch {
      setError("Could not load households.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(households.length === 0);
      load();
    }, [households.length, load])
  );

  const save = async () => {
    const amount = Number(budget || 0);
    if (!name.trim()) {
      setError("Household name is required.");
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Budget must be a valid amount.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const household = await createHousehold({
        currency: "INR",
        description: description.trim(),
        monthly_budget: amount ? amount.toFixed(2) : null,
        name: name.trim(),
      });
      setName("");
      setBudget("");
      setDescription("");
      await load();
      navigation.navigate("HouseholdDetail", { householdId: household.id });
    } catch {
      setError("Could not create household.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SoraScreen>
      <SoraHeader title="Households" subtitle="Shared financial spaces" onBack={() => navigation.goBack()} />
      <SoraError text={error} />

      <SoraCard>
        <Text style={[styles.blockTitle, { color: colors.text }]}>Create Household</Text>
        <TextInput label="Name" mode="outlined" value={name} onChangeText={setName} style={styles.input} />
        <TextInput label="Monthly budget" mode="outlined" value={budget} onChangeText={setBudget} keyboardType="decimal-pad" style={styles.input} />
        <TextInput label="Description" mode="outlined" value={description} onChangeText={setDescription} multiline style={styles.input} />
        <AppButton mode="contained" loading={saving} onPress={save}>Create Household</AppButton>
      </SoraCard>

      <SoraSectionHeader title="Your Households" />
      {loading && !households.length ? <SoraRowSkeleton rows={4} /> : households.length ? households.map((household) => (
        <SoraCard key={household.id} style={styles.rowCard}>
          <SoraIconRow
            amount={household.monthly_budget ? formatCurrencyCompact(household.monthly_budget) : undefined}
            icon="home-city-outline"
            iconBackground={soraPalette.purpleSoft}
            iconColor={colors.accent}
            meta={`${household.my_role ?? "member"} · ${household.members_count ?? 0} members`}
            onPress={() => navigation.navigate("HouseholdDetail", { householdId: household.id })}
            title={household.name}
          />
        </SoraCard>
      )) : <SoraEmpty text="No households yet." />}
    </SoraScreen>
  );
}

const styles = StyleSheet.create({
  blockTitle: {
    fontSize: 19,
    fontWeight: "900",
    marginBottom: 12,
  },
  input: {
    marginBottom: 12,
  },
  rowCard: {
    marginBottom: 10,
    paddingVertical: 10,
  },
});
