import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Text, TextInput } from "react-native-paper";

import { AppButton } from "../components/AppLayout";
import { SoraDonutChart } from "../components/SoraDonutChart";
import { SoraCard, SoraChip, SoraEmpty, SoraError, SoraHeader, SoraIconRow, SoraScreen, SoraSectionHeader } from "../components/SoraUI";
import { useAppSettings } from "../context/AppSettingsContext";
import { useAuth } from "../context/AuthContext";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { getHouseholdReport, getHouseholds, getMonthlySummary } from "../services/expenseApi";
import { exportMonthlyReport } from "../services/reportExport";
import { soraPalette } from "../theme/soraTheme";
import type { Household, HouseholdMonthlyReport, MonthlySummary } from "../types/api";
import { getCurrentMonth, isValidMonth } from "../utils/date";
import { formatCurrencyCompact } from "../utils/format";

type Props = NativeStackScreenProps<RootStackParamList, "Reports">;
type Scope = "personal" | "household";

export function ReportsScreen({ navigation }: Props) {
  const { colors } = useAppSettings();
  const { token } = useAuth();
  const [scope, setScope] = useState<Scope>("personal");
  const [month, setMonth] = useState(getCurrentMonth());
  const [households, setHouseholds] = useState<Household[]>([]);
  const [householdId, setHouseholdId] = useState<number | null>(null);
  const [personal, setPersonal] = useState<MonthlySummary | null>(null);
  const [householdReport, setHouseholdReport] = useState<HouseholdMonthlyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!isValidMonth(month)) {
      setError("Month must use YYYY-MM format.");
      setLoading(false);
      return;
    }
    setError("");
    try {
      const householdRows = await getHouseholds();
      setHouseholds(householdRows);
      const activeHousehold = householdId ?? householdRows[0]?.id ?? null;
      if (!householdId && activeHousehold) {
        setHouseholdId(activeHousehold);
      }

      if (scope === "household" && activeHousehold) {
        setHouseholdReport(await getHouseholdReport(activeHousehold, month));
      } else {
        setPersonal(await getMonthlySummary(month));
      }
    } catch {
      setError("Could not load report.");
    } finally {
      setLoading(false);
    }
  }, [householdId, month, scope]);

  useFocusEffect(
    useCallback(() => {
      setLoading(!personal && !householdReport);
      load();
    }, [householdReport, load, personal])
  );

  const summary = useMemo(() => {
    if (scope === "household") {
      return {
        balance: householdReport?.remaining ?? "0.00",
        budget: householdReport?.household_budget ?? "0.00",
        categories: householdReport?.category_breakdown ?? [],
        count: householdReport?.expense_count ?? 0,
        total: householdReport?.total_spent ?? "0.00",
      };
    }
    return {
      balance: personal?.balance ?? "0.00",
      budget: personal?.total_budget ?? "0.00",
      categories: personal?.category_breakdown ?? [],
      count: personal?.expense_count ?? 0,
      total: personal?.total_expense ?? "0.00",
    };
  }, [householdReport, personal, scope]);

  const exportReport = async (type: "csv" | "pdf") => {
    if (!token) {
      setError("Login required.");
      return;
    }
    if (!isValidMonth(month)) {
      setError("Month must use YYYY-MM format.");
      return;
    }
    setExporting(true);
    setError("");
    try {
      await exportMonthlyReport({
        householdId: scope === "household" && householdId ? householdId : undefined,
        month,
        token,
        type,
      });
    } catch {
      setError(`Could not export ${type.toUpperCase()} report.`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <SoraScreen bottomNavCurrent="Profile">
      <SoraHeader
        actionIcon={showExport ? "close" : "download-outline"}
        onAction={() => setShowExport((current) => !current)}
        title="Reports"
        subtitle={`${month} · ${summary.count} expenses`}
      />
      <SoraError text={error} />

      {showExport ? (
        <SoraCard>
          <Text style={[styles.blockTitle, { color: colors.text }]}>Download report</Text>
          <Text style={[styles.exportCopy, { color: colors.muted }]}>
            Choose a file for {month}. PDF is best for sharing, CSV is best for spreadsheets.
          </Text>
          <View style={styles.actionRow}>
            <AppButton icon="file-pdf-box" mode="contained" loading={exporting} disabled={exporting} onPress={() => exportReport("pdf")}>
              PDF
            </AppButton>
            <AppButton icon="file-delimited-outline" mode="outlined" loading={exporting} disabled={exporting} onPress={() => exportReport("csv")}>
              CSV
            </AppButton>
          </View>
        </SoraCard>
      ) : null}

      <SoraCard tone="purple" style={styles.heroCard}>
        <Text style={styles.heroLabel}>{scope === "personal" ? "Personal Total" : "Household Total"}</Text>
        <Text style={styles.heroAmount}>{formatCurrencyCompact(summary.total)}</Text>
        <Text style={styles.heroMeta}>Budget {formatCurrencyCompact(summary.budget)} · Balance {formatCurrencyCompact(summary.balance)}</Text>
      </SoraCard>

      <SoraCard>
        <Text style={[styles.blockTitle, { color: colors.text }]}>Category Chart</Text>
        <SoraDonutChart
          rows={summary.categories.map((row) => ({
            count: row.count,
            label: row.category_name,
            value: row.total,
          }))}
        />
      </SoraCard>

      <SoraCard>
        <Text style={[styles.blockTitle, { color: colors.text }]}>Report Settings</Text>
        <TextInput label="Month" mode="outlined" value={month} onChangeText={setMonth} style={styles.input} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <SoraChip active={scope === "personal"} onPress={() => setScope("personal")}>Personal</SoraChip>
          <SoraChip active={scope === "household"} onPress={() => setScope("household")}>Household</SoraChip>
        </ScrollView>
        {scope === "household" ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {households.map((household) => (
              <SoraChip active={householdId === household.id} key={household.id} onPress={() => setHouseholdId(household.id)}>
                {household.name}
              </SoraChip>
            ))}
            <SoraChip onPress={() => navigation.navigate("Households")}>+ Household</SoraChip>
          </ScrollView>
        ) : null}
      </SoraCard>

      <SoraSectionHeader title="Category Breakdown" />
      {summary.categories.length ? summary.categories.map((row) => (
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
      )) : <SoraEmpty text={loading ? "Loading report..." : "No report data yet."} />}

      {scope === "household" && householdReport?.pending_settlements.length ? (
        <>
          <SoraSectionHeader title="Pending Settlements" />
          {householdReport.pending_settlements.map((row) => (
            <SoraCard key={row.share_id} style={styles.rowCard}>
              <SoraIconRow
                amount={formatCurrencyCompact(row.pending_amount)}
                icon="account-cash-outline"
                iconBackground={soraPalette.redSurface}
                iconColor={soraPalette.red}
                meta={row.status}
                title={row.name}
              />
            </SoraCard>
          ))}
        </>
      ) : null}
    </SoraScreen>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    paddingVertical: 22,
  },
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
    fontSize: 15,
    marginTop: 8,
  },
  blockTitle: {
    fontSize: 19,
    fontWeight: "900",
    marginBottom: 12,
  },
  input: {
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
  },
  exportCopy: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  rowCard: {
    marginBottom: 10,
    paddingVertical: 10,
  },
});
