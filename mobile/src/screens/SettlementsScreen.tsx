import { useCallback, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Text } from "react-native-paper";

import { AppButton } from "../components/AppLayout";
import { SoraCard, SoraChip, SoraEmpty, SoraError, SoraHeader, SoraIconRow, SoraScreen, SoraSectionHeader } from "../components/SoraUI";
import { useAppSettings } from "../context/AppSettingsContext";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { cancelSettlement, getSettlements } from "../services/expenseApi";
import { soraPalette } from "../theme/soraTheme";
import type { Settlement } from "../types/api";
import { formatCurrencyCompact, formatPaymentMethod, formatRelativeDateLabel, parseAmount } from "../utils/format";

type Props = NativeStackScreenProps<RootStackParamList, "Settlements">;
type StatusFilter = "all" | Settlement["status"];

const filters: StatusFilter[] = ["all", "pending", "completed", "cancelled"];

export function SettlementsScreen({ navigation }: Props) {
  const { colors } = useAppSettings();
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setSettlements(await getSettlements());
    } catch {
      setError("Could not load settlements.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const filteredRows = useMemo(
    () => settlements.filter((settlement) => filter === "all" || settlement.status === filter),
    [filter, settlements]
  );
  const total = useMemo(
    () => filteredRows.reduce((sum, settlement) => sum + parseAmount(settlement.amount), 0),
    [filteredRows]
  );

  const confirmCancel = (settlement: Settlement) => {
    Alert.alert("Cancel settlement", "This settlement will be marked cancelled.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel settlement",
        style: "destructive",
        onPress: async () => {
          setSavingId(settlement.id);
          setError("");
          try {
            await cancelSettlement(settlement.id);
            await load();
          } catch {
            setError("Could not cancel settlement.");
          } finally {
            setSavingId(null);
          }
        },
      },
    ]);
  };

  return (
    <SoraScreen>
      <SoraHeader
        onBack={() => navigation.goBack()}
        title="Settlements"
        subtitle={`${filteredRows.length} records - ${formatCurrencyCompact(total)}`}
      />
      <SoraError text={error} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {filters.map((item) => (
          <SoraChip active={filter === item} key={item} onPress={() => setFilter(item)}>
            {item === "all" ? "All" : item}
          </SoraChip>
        ))}
      </ScrollView>

      <SoraSectionHeader title="History" />
      {filteredRows.length ? (
        filteredRows.map((settlement) => (
          <SoraCard key={settlement.id} style={styles.rowCard}>
            <SoraIconRow
              amount={formatCurrencyCompact(settlement.amount)}
              icon={settlement.status === "cancelled" ? "close-circle-outline" : "check-circle-outline"}
              iconBackground={settlement.status === "cancelled" ? soraPalette.redSurface : soraPalette.greenSurface}
              iconColor={settlement.status === "cancelled" ? colors.danger : colors.success}
              meta={`${formatPaymentMethod(settlement.method)} - ${settlement.status}${settlement.settled_at ? ` - ${formatRelativeDateLabel(settlement.settled_at.slice(0, 10))}` : ""}`}
              title={`Settlement #${settlement.id}`}
            />
            {settlement.status !== "cancelled" ? (
              <View style={styles.actionRow}>
                <AppButton compact mode="outlined" loading={savingId === settlement.id} onPress={() => confirmCancel(settlement)}>
                  Cancel
                </AppButton>
              </View>
            ) : null}
          </SoraCard>
        ))
      ) : (
        <SoraEmpty text={loading ? "Loading settlements..." : "No settlements found."} />
      )}

      <SoraCard>
        <Text style={[styles.noteTitle, { color: colors.text }]}>Tip</Text>
        <Text style={[styles.noteText, { color: colors.muted }]}>
          To create a settlement, open a household balance and mark the pending share as settled.
        </Text>
      </SoraCard>
    </SoraScreen>
  );
}

const styles = StyleSheet.create({
  chipRow: {
    gap: 8,
    paddingBottom: 14,
    paddingRight: 18,
  },
  rowCard: {
    marginBottom: 10,
    paddingVertical: 10,
  },
  actionRow: {
    alignItems: "flex-start",
    marginTop: 8,
  },
  noteTitle: {
    fontSize: 17,
    fontWeight: "900",
  },
  noteText: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
});
