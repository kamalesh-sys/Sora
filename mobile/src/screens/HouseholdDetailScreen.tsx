import { useCallback, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Text } from "react-native-paper";

import { AppButton } from "../components/AppLayout";
import { SoraCard, SoraChip, SoraEmpty, SoraError, SoraHeader, SoraIconRow, SoraScreen, SoraSectionHeader } from "../components/SoraUI";
import { useAppSettings } from "../context/AppSettingsContext";
import { useAuth } from "../context/AuthContext";
import type { RootStackParamList } from "../navigation/RootNavigator";
import {
  addHouseholdMember,
  createSettlement,
  getHousehold,
  getHouseholdBalances,
  getHouseholdMembers,
  getHouseholdReport,
  getHouseholdShareSummary,
  getPeople,
} from "../services/expenseApi";
import { exportMonthlyReport } from "../services/reportExport";
import { soraPalette } from "../theme/soraTheme";
import type { Household, HouseholdBalance, HouseholdMember, HouseholdMonthlyReport, Person } from "../types/api";
import { getCurrentMonth } from "../utils/date";
import { formatCurrencyCompact } from "../utils/format";

type Props = NativeStackScreenProps<RootStackParamList, "HouseholdDetail">;

export function HouseholdDetailScreen({ navigation, route }: Props) {
  const { colors } = useAppSettings();
  const { token } = useAuth();
  const { householdId } = route.params;
  const [month, setMonth] = useState(getCurrentMonth());
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [balances, setBalances] = useState<HouseholdBalance[]>([]);
  const [report, setReport] = useState<HouseholdMonthlyReport | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settlingShareId, setSettlingShareId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [householdData, memberRows, peopleRows, balanceRows, reportData] = await Promise.all([
        getHousehold(householdId),
        getHouseholdMembers(householdId),
        getPeople(),
        getHouseholdBalances(householdId),
        getHouseholdReport(householdId, month),
      ]);
      setHousehold(householdData);
      setMembers(memberRows);
      setPeople(peopleRows);
      setBalances(balanceRows);
      setReport(reportData);
    } catch {
      setError("Could not load household.");
    } finally {
      setLoading(false);
    }
  }, [householdId, month]);

  useFocusEffect(
    useCallback(() => {
      setLoading(!household && !report);
      load();
    }, [household, load, report])
  );

  const memberPersonIds = useMemo(
    () => new Set(members.map((member) => member.person).filter(Boolean)),
    [members]
  );
  const addablePeople = people.filter((person) => !memberPersonIds.has(person.id));

  const addMember = async () => {
    if (!selectedPerson) {
      setError("Choose a person to add.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await addHouseholdMember(householdId, { person: selectedPerson, role: "member", visibility_level: "shared_only" });
      setSelectedPerson(null);
      await load();
    } catch {
      setError("Could not add household member.");
    } finally {
      setSaving(false);
    }
  };

  const showSummary = async () => {
    try {
      const result = await getHouseholdShareSummary(householdId, month);
      Alert.alert("Share Summary", result.text);
    } catch {
      setError("Could not load share summary.");
    }
  };

  const exportReport = async (type: "csv" | "pdf") => {
    if (!token) {
      setError("Login required.");
      return;
    }
    try {
      await exportMonthlyReport({ householdId, month, token, type });
    } catch {
      setError(`Could not export ${type.toUpperCase()} report.`);
    }
  };

  const confirmSettle = (balance: HouseholdBalance) => {
    Alert.alert("Mark settled", `Create a UPI settlement for ${formatCurrencyCompact(balance.pending_amount)}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Mark settled",
        onPress: async () => {
          setSettlingShareId(balance.share_id);
          setError("");
          try {
            await createSettlement({
              amount: balance.pending_amount,
              expense_share: balance.share_id,
              method: "upi",
              status: "completed",
            });
            await load();
          } catch {
            setError("Could not create settlement.");
          } finally {
            setSettlingShareId(null);
          }
        },
      },
    ]);
  };

  return (
    <SoraScreen>
      <SoraHeader
        title={household?.name ?? "Household"}
        subtitle={`${members.length} members · ${month}`}
        onBack={() => navigation.goBack()}
      />
      <SoraError text={error} />

      <SoraCard tone="purple">
        <Text style={styles.heroLabel}>Spent this month</Text>
        <Text style={styles.heroAmount}>{formatCurrencyCompact(report?.total_spent ?? 0)}</Text>
        <Text style={styles.heroMeta}>Budget {formatCurrencyCompact(report?.household_budget ?? household?.monthly_budget ?? 0)} · Remaining {formatCurrencyCompact(report?.remaining ?? 0)}</Text>
        <View style={styles.actionRow}>
          <AppButton mode="contained-tonal" onPress={showSummary}>Share Text</AppButton>
          <AppButton mode="contained-tonal" onPress={() => exportReport("pdf")}>PDF</AppButton>
          <AppButton mode="contained-tonal" onPress={() => exportReport("csv")}>CSV</AppButton>
        </View>
      </SoraCard>

      <SoraCard>
        <Text style={[styles.blockTitle, { color: colors.text }]}>Add Member</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {addablePeople.map((person) => (
            <SoraChip active={selectedPerson === person.id} key={person.id} onPress={() => setSelectedPerson(person.id)}>
              {person.name}
            </SoraChip>
          ))}
          <SoraChip onPress={() => navigation.navigate("People")}>+ Person</SoraChip>
        </ScrollView>
        <AppButton mode="outlined" loading={saving} onPress={addMember}>Add to Household</AppButton>
      </SoraCard>

      <SoraSectionHeader title="Balances" />
      {balances.length ? balances.map((row) => (
        <SoraCard key={row.share_id} style={styles.rowCard}>
          <SoraIconRow
            amount={formatCurrencyCompact(row.pending_amount)}
            icon="account-cash-outline"
            iconBackground={soraPalette.redSurface}
            iconColor={soraPalette.red}
            meta={row.status}
            title={row.name}
          />
          {row.status === "pending" || row.status === "partially_paid" ? (
            <View style={styles.actionRow}>
              <AppButton compact mode="outlined" loading={settlingShareId === row.share_id} onPress={() => confirmSettle(row)}>
                Mark settled
              </AppButton>
            </View>
          ) : null}
        </SoraCard>
      )) : <SoraEmpty text={loading ? "Loading balances..." : "No pending balances."} />}

      <SoraSectionHeader title="Members" />
      {members.length ? members.map((member) => (
        <SoraCard key={member.id} style={styles.rowCard}>
          <SoraIconRow
            icon={member.role === "owner" ? "crown-outline" : "account-outline"}
            iconBackground={member.status === "active" ? soraPalette.greenSurface : soraPalette.appBackground}
            iconColor={member.status === "active" ? soraPalette.green : soraPalette.iconMuted}
            meta={`${member.role} · ${member.visibility_level}`}
            title={member.user_detail?.email ?? member.person_detail?.name ?? "Member"}
          />
        </SoraCard>
      )) : <SoraEmpty text="No members found." />}

      <SoraSectionHeader title="Top Categories" />
      {report?.category_breakdown.length ? report.category_breakdown.map((row) => (
        <SoraCard key={`${row.category_id}-${row.category_name}`} style={styles.rowCard}>
          <SoraIconRow
            amount={formatCurrencyCompact(row.total)}
            icon="chart-donut"
            iconBackground={soraPalette.purpleSoft}
            iconColor={colors.accent}
            meta={`${row.count} expenses`}
            title={row.category_name}
          />
        </SoraCard>
      )) : <SoraEmpty text={loading ? "Loading report..." : "No category spending."} />}
    </SoraScreen>
  );
}

const styles = StyleSheet.create({
  heroLabel: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 15,
    fontWeight: "800",
  },
  heroAmount: {
    color: "#FFFFFF",
    fontSize: 38,
    fontWeight: "900",
    marginTop: 4,
  },
  heroMeta: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  blockTitle: {
    fontSize: 19,
    fontWeight: "900",
    marginBottom: 12,
  },
  chipRow: {
    gap: 8,
    paddingBottom: 14,
    paddingRight: 18,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  rowCard: {
    marginBottom: 10,
    paddingVertical: 10,
  },
});
