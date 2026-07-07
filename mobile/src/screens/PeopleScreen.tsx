import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import {
  AppButton,
  AppBottomSheet,
  AppCard,
  AppScreen,
  AppSegmentedControl,
  AppText,
  CategoryChip,
  ErrorState,
  FormField,
  IconButton,
  ListRow,
  SectionHeader,
  SkeletonBlock,
  SkeletonList,
  useDs,
} from "../design-system";
import { dsRadius, dsSpace } from "../design-system/tokens";
import { useAuth } from "../context/AuthContext";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { createExpense, createPerson, createSettlement, deletePerson, getPeopleOverview, getPersonHistory } from "../services/expenseApi";
import type { Expense, Person, PersonLedger } from "../types/api";
import { getTodayDate } from "../utils/date";
import { formatCurrencyCompact, formatDateLabel, formatPaymentMethod, parseAmount } from "../utils/format";

type Props = NativeStackScreenProps<RootStackParamList, "People">;
type PeopleTab = "all" | "owes_me" | "i_owe";
type DebtMode = "owes_me" | "i_owe";

const relations: Array<{ label: string; value: Person["relation_type"]; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = [
  { icon: "account-heart-outline", label: "Family", value: "family" },
  { icon: "account-outline", label: "Friend", value: "friend" },
  { icon: "home-account", label: "Roommate", value: "roommate" },
  { icon: "account-group-outline", label: "Relative", value: "relative" },
  { icon: "broom", label: "Helper", value: "helper" },
  { icon: "dots-horizontal", label: "Other", value: "other" },
];

const tabs: Array<{ label: string; value: PeopleTab }> = [
  { label: "All", value: "all" },
  { label: "Owes me", value: "owes_me" },
  { label: "I owe", value: "i_owe" },
];

const emptyLedger: PersonLedger = {
  pending_balance: "0.00",
  settlements_count: 0,
  total_i_owe: "0.00",
  total_owed_to_me: "0.00",
};

const avatarColors = ["#2563EB", "#16A34A", "#EA580C", "#7C3AED", "#DB2777", "#0F766E", "#475569"];

function sanitizeAmount(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  const decimal = rest.join("").slice(0, 2);
  return rest.length ? `${whole}.${decimal}` : whole;
}

function getPendingShares(history: Expense[], personId: number, userId: number, mode: DebtMode) {
  return history.flatMap((expense) =>
    (expense.shares ?? [])
      .filter((share) => {
        if (parseAmount(share.pending_amount) <= 0) return false;
        if (mode === "owes_me") {
          return share.person === personId && expense.paid_by_user === userId;
        }
        return share.user === userId && expense.paid_by_person === personId;
      })
      .map((share) => ({ id: share.id, pending: parseAmount(share.pending_amount) }))
  );
}

export function PeopleScreen({ navigation }: Props) {
  const { colors } = useDs();
  const { user } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [ledgers, setLedgers] = useState<Record<string, PersonLedger>>({});
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [history, setHistory] = useState<Expense[]>([]);
  const [activeTab, setActiveTab] = useState<PeopleTab>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState("");
  const [relation, setRelation] = useState<Person["relation_type"]>("friend");
  const [debtMode, setDebtMode] = useState<DebtMode>("owes_me");
  const [debtAmount, setDebtAmount] = useState("");
  const [debtTitle, setDebtTitle] = useState("");
  const [settleMode, setSettleMode] = useState<DebtMode>("owes_me");
  const [settleAmount, setSettleAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState("");

  const ledgerFor = useCallback((personId: number) => ledgers[String(personId)] ?? emptyLedger, [ledgers]);

  const load = useCallback(async () => {
    setError("");
    try {
      const overview = await getPeopleOverview();
      setPeople(overview.people);
      setLedgers(overview.ledgers);
    } catch {
      setError("Could not load people.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(people.length === 0);
      load();
    }, [load, people.length])
  );

  const totals = useMemo(
    () =>
      people.reduce(
        (sum, person) => {
          const ledger = ledgerFor(person.id);
          return {
            iOwe: sum.iOwe + parseAmount(ledger.total_i_owe),
            owesMe: sum.owesMe + parseAmount(ledger.total_owed_to_me),
          };
        },
        { iOwe: 0, owesMe: 0 }
      ),
    [ledgerFor, people]
  );

  const filteredPeople = useMemo(() => {
    const query = search.trim().toLowerCase();
    return people.filter((person) => {
      const ledger = ledgerFor(person.id);
      const owed = parseAmount(ledger.total_owed_to_me);
      const owe = parseAmount(ledger.total_i_owe);
      const matchesQuery =
        !query ||
        person.name.toLowerCase().includes(query) ||
        person.phone?.toLowerCase().includes(query) ||
        person.relation_type.includes(query);

      if (!matchesQuery) return false;
      if (activeTab === "owes_me") return owed > 0;
      if (activeTab === "i_owe") return owe > 0;
      return true;
    });
  }, [activeTab, ledgerFor, people, search]);

  const savePerson = async () => {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await createPerson({
        email: null,
        name: name.trim(),
        phone: "",
        relation_type: relation,
      });
      setName("");
      setRelation("friend");
      setShowAddForm(false);
      await load();
    } catch {
      setError("Could not save person.");
    } finally {
      setSaving(false);
    }
  };

  const openPerson = async (person: Person) => {
    const ledger = ledgerFor(person.id);
    setSettleMode(parseAmount(ledger.total_i_owe) > parseAmount(ledger.total_owed_to_me) ? "i_owe" : "owes_me");
    setSettleAmount("");
    setDebtAmount("");
    setDebtTitle("");
    setSelectedPerson(person);
    setHistory([]);
    setHistoryLoading(true);
    setError("");
    try {
      setHistory(await getPersonHistory(person.id));
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const saveDebt = async () => {
    if (!selectedPerson || !user) {
      setError("Login session is missing. Please reopen the app.");
      return;
    }

    const amount = Number(debtAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Amount must be greater than 0.");
      return;
    }

    const title = debtTitle.trim() || (debtMode === "owes_me" ? `${selectedPerson.name} owes me` : `I owe ${selectedPerson.name}`);

    setSaving(true);
    setError("");
    try {
      await createExpense({
        amount: amount.toFixed(2),
        category: null,
        expense_date: getTodayDate(),
        expense_type: "shared",
        household: null,
        note: "",
        paid_by_person: debtMode === "i_owe" ? selectedPerson.id : null,
        paid_by_user: debtMode === "owes_me" ? "me" : null,
        payment_method: "upi",
        split_type: "custom_amount",
        title,
        visibility: "shared",
        participants:
          debtMode === "owes_me"
            ? [{ person: selectedPerson.id, share_amount: amount.toFixed(2) }]
            : [{ user: user.id, share_amount: amount.toFixed(2) }],
      });
      setDebtAmount("");
      setDebtTitle("");
      await load();
      await openPerson(selectedPerson);
    } catch {
      setError("Could not save this entry.");
    } finally {
      setSaving(false);
    }
  };

  const settleBalance = async (amountOverride?: number) => {
    if (!selectedPerson || !user) {
      setError("Login session is missing. Please reopen the app.");
      return;
    }

    const shares = getPendingShares(history, selectedPerson.id, user.id, settleMode);
    const available = shares.reduce((sum, share) => sum + share.pending, 0);
    const amount = amountOverride ?? Number(settleAmount);

    if (!shares.length || available <= 0) {
      setError("No pending balance to settle for this direction.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Settlement amount must be greater than 0.");
      return;
    }
    if (amount > available) {
      setError(`Settlement can be at most ${formatCurrencyCompact(available)}.`);
      return;
    }

    setSettling(true);
    setError("");
    try {
      let remaining = amount;
      for (const share of shares) {
        if (remaining <= 0) break;
        const nextAmount = Math.min(share.pending, remaining);
        await createSettlement({
          amount: nextAmount.toFixed(2),
          expense_share: share.id,
          method: "upi",
          note: settleMode === "owes_me" ? `${selectedPerson.name} paid me` : `I paid ${selectedPerson.name}`,
          status: "completed",
        });
        remaining = Number((remaining - nextAmount).toFixed(2));
      }
      setSettleAmount("");
      await load();
      await openPerson(selectedPerson);
    } catch {
      setError("Could not update this balance.");
    } finally {
      setSettling(false);
    }
  };

  const confirmDeletePerson = () => {
    if (!selectedPerson) return;
    Alert.alert("Remove person", "This removes the person from your people list. Existing linked dues may be affected.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setSaving(true);
          setError("");
          try {
            await deletePerson(selectedPerson.id);
            setSelectedPerson(null);
            await load();
          } catch {
            setError("Could not remove person.");
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const settleAvailable =
    selectedPerson && user
      ? getPendingShares(history, selectedPerson.id, user.id, settleMode).reduce((sum, share) => sum + share.pending, 0)
      : 0;

  return (
    <AppScreen>
      <View style={styles.header}>
        <IconButton accessibilityLabel="Go back" icon="arrow-left" onPress={() => navigation.goBack()} />
        <View style={styles.headerText}>
          <AppText variant="title">People</AppText>
        </View>
        <IconButton accessibilityLabel={searchOpen ? "Close search" : "Search people"} icon={searchOpen ? "close" : "magnify"} onPress={() => setSearchOpen((current) => !current)} />
      </View>

      <View style={styles.heroRow}>
        <BalanceTile amount={totals.owesMe} icon="trending-up" label="Owes you" tone="success" />
        <BalanceTile amount={totals.iOwe} icon="trending-down" label="You owe" tone="danger" />
      </View>

      <AppButton icon="account-plus-outline" onPress={() => setShowAddForm(true)}>
        Add person
      </AppButton>

      {searchOpen ? (
        <FormField
          autoCapitalize="none"
          onChangeText={setSearch}
          placeholder="Search by name, phone or relation"
          style={styles.searchField}
          value={search}
        />
      ) : null}

      <ErrorState text={error} />

      <AppSegmentedControl accessibilityLabel="People filter" items={tabs} onChange={setActiveTab} style={styles.tabs} value={activeTab} />

      <SectionHeader title={`People (${filteredPeople.length})`} />
      {loading && !filteredPeople.length ? (
        <SkeletonList rows={3} />
      ) : filteredPeople.length ? (
        <AppCard style={styles.listCard}>
          {filteredPeople.map((person) => (
            <PersonRow key={person.id} ledger={ledgerFor(person.id)} onPress={() => openPerson(person)} person={person} />
          ))}
        </AppCard>
      ) : (
        <EmptyPeople onAdd={() => setShowAddForm(true)} />
      )}

      <AddPersonSheet
        name={name}
        onClose={() => setShowAddForm(false)}
        onNameChange={setName}
        onRelationChange={setRelation}
        onSave={savePerson}
        relation={relation}
        saving={saving}
        visible={showAddForm}
      />

      {selectedPerson ? (
        <AppBottomSheet maxHeight="90%" onClose={() => setSelectedPerson(null)} visible={Boolean(selectedPerson)}>
          <PersonDetail
            debtAmount={debtAmount}
            debtMode={debtMode}
            debtTitle={debtTitle}
            history={history}
            historyLoading={historyLoading}
            ledger={ledgerFor(selectedPerson.id)}
            onClose={() => setSelectedPerson(null)}
            onDebtAmountChange={setDebtAmount}
            onDebtModeChange={setDebtMode}
            onDebtTitleChange={setDebtTitle}
            onDelete={confirmDeletePerson}
            onSaveDebt={saveDebt}
            onSettleAll={() => settleBalance(settleAvailable)}
            onSettleAmountChange={(value) => setSettleAmount(sanitizeAmount(value))}
            onSettleBalance={() => settleBalance()}
            onSettleModeChange={setSettleMode}
            person={selectedPerson}
            saving={saving}
            settleAmount={settleAmount}
            settleAvailable={settleAvailable}
            settleMode={settleMode}
            settling={settling}
          />
        </AppBottomSheet>
      ) : null}
    </AppScreen>
  );
}

function AddPersonSheet({
  name,
  onClose,
  onNameChange,
  onRelationChange,
  onSave,
  relation,
  saving,
  visible,
}: {
  name: string;
  onClose: () => void;
  onNameChange: (value: string) => void;
  onRelationChange: (value: Person["relation_type"]) => void;
  onSave: () => void;
  relation: Person["relation_type"];
  saving: boolean;
  visible: boolean;
}) {
  return (
    <AppBottomSheet
      footer={<AppButton block disabled={saving} loading={saving} onPress={onSave}>Save person</AppButton>}
      onClose={onClose}
      title="Add person"
      visible={visible}
    >
      <View style={styles.addPreview}>
        <Avatar name={name || "New"} size={64} />
      </View>
      <FormField label="Name" onChangeText={onNameChange} placeholder="Rahul, Mom, Roommate" style={styles.field} value={name} />
      <AppText color="textMuted" style={styles.fieldLabel} variant="label">
        Relation
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {relations.map((item) => (
          <CategoryChip
            active={relation === item.value}
            icon={item.icon}
            key={item.value}
            label={item.label}
            onPress={() => onRelationChange(item.value)}
          />
        ))}
      </ScrollView>
    </AppBottomSheet>
  );
}

function BalanceTile({
  amount,
  icon,
  label,
  tone,
}: {
  amount: number;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  tone: "danger" | "success";
}) {
  const { colors } = useDs();
  const color = tone === "success" ? colors.success : colors.danger;
  const background = tone === "success" ? colors.successBg : colors.dangerBg;
  return (
    <AppCard style={[styles.balanceTile, { backgroundColor: background, borderColor: background }]}>
      <View style={styles.balanceTop}>
        <AppText color="textMuted" variant="caption">
          {label}
        </AppText>
        <View style={[styles.balanceIcon, { backgroundColor: colors.surface }]}>
          <MaterialCommunityIcons name={icon} size={20} color={color} />
        </View>
      </View>
      <AppText numberOfLines={1} style={{ color }} variant="headline">
        {formatCurrencyCompact(amount)}
      </AppText>
    </AppCard>
  );
}

function Avatar({ name, size = 48 }: { name: string; size?: number }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "S";
  const color = avatarColors[name.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) % avatarColors.length];
  return (
    <View style={[styles.avatar, { backgroundColor: color, borderRadius: size / 2, height: size, width: size }]}>
      <AppText style={styles.avatarText} variant="bodyStrong">
        {initials}
      </AppText>
    </View>
  );
}

function PersonRow({ ledger, onPress, person }: { ledger: PersonLedger; onPress: () => void; person: Person }) {
  const { colors } = useDs();
  const owed = parseAmount(ledger.total_owed_to_me);
  const owe = parseAmount(ledger.total_i_owe);
  const status =
    owed > 0
      ? { color: colors.success, text: `Owes you ${formatCurrencyCompact(owed)}` }
      : owe > 0
        ? { color: colors.danger, text: `You owe ${formatCurrencyCompact(owe)}` }
        : ledger.settlements_count > 0
          ? { color: colors.textSubtle, text: "Settled" }
          : { color: colors.textSubtle, text: "No dues" };

  return (
    <Pressable accessibilityRole="button" android_ripple={{ color: colors.press }} onPress={onPress}>
      <View style={[styles.personRow, { borderBottomColor: colors.border }]}>
        <Avatar name={person.name} />
        <View style={styles.personText}>
          <AppText numberOfLines={1} variant="bodyStrong">
            {person.name}
          </AppText>
          <AppText numberOfLines={1} style={{ color: status.color }} variant="caption">
            {status.text}
          </AppText>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={24} color={colors.textSubtle} />
      </View>
    </Pressable>
  );
}

function PersonDetail({
  debtAmount,
  debtMode,
  debtTitle,
  history,
  historyLoading,
  ledger,
  onClose,
  onDebtAmountChange,
  onDebtModeChange,
  onDebtTitleChange,
  onDelete,
  onSaveDebt,
  onSettleAll,
  onSettleAmountChange,
  onSettleBalance,
  onSettleModeChange,
  person,
  saving,
  settleAmount,
  settleAvailable,
  settleMode,
  settling,
}: {
  debtAmount: string;
  debtMode: DebtMode;
  debtTitle: string;
  history: Expense[];
  historyLoading: boolean;
  ledger: PersonLedger;
  onClose: () => void;
  onDebtAmountChange: (value: string) => void;
  onDebtModeChange: (value: DebtMode) => void;
  onDebtTitleChange: (value: string) => void;
  onDelete: () => void;
  onSaveDebt: () => void;
  onSettleAll: () => void;
  onSettleAmountChange: (value: string) => void;
  onSettleBalance: () => void;
  onSettleModeChange: (value: DebtMode) => void;
  person: Person;
  saving: boolean;
  settleAmount: string;
  settleAvailable: number;
  settleMode: DebtMode;
  settling: boolean;
}) {
  const { colors } = useDs();
  return (
    <View style={styles.detailPanel}>
      <View style={styles.detailHeader}>
        <Avatar name={person.name} size={60} />
        <View style={styles.detailIdentity}>
          <AppText variant="headline">{person.name}</AppText>
          <AppText color="textMuted" style={styles.capitalize} variant="caption">
            {person.relation_type}
          </AppText>
        </View>
        <IconButton accessibilityLabel="Remove person" icon="trash-can-outline" onPress={onDelete} tone="danger" />
        <IconButton accessibilityLabel="Close person detail" icon="close" onPress={onClose} />
      </View>

      <View style={styles.ledgerRow}>
        <LedgerValue label="Owes you" tone="success" value={ledger.total_owed_to_me} />
        <LedgerValue label="You owe" tone="danger" value={ledger.total_i_owe} />
      </View>

      <AppCard style={styles.detailActionCard}>
        <View style={styles.actionCardHeader}>
          <View>
            <AppText variant="bodyStrong">Add entry</AppText>
            <AppText color="textMuted" variant="caption">Create a new due with {person.name}.</AppText>
          </View>
          <MaterialCommunityIcons name="plus-circle-outline" size={22} color={colors.textMuted} />
        </View>
        <View style={styles.debtModeRow}>
          <CategoryChip active={debtMode === "owes_me"} icon="arrow-down-left" label="They owe me" onPress={() => onDebtModeChange("owes_me")} />
          <CategoryChip active={debtMode === "i_owe"} icon="arrow-up-right" label="I owe them" onPress={() => onDebtModeChange("i_owe")} />
        </View>
        <FormField keyboardType="decimal-pad" label="Amount" onChangeText={onDebtAmountChange} placeholder="0" style={styles.field} value={debtAmount} />
        <FormField label="Reason optional" onChangeText={onDebtTitleChange} placeholder="Tea, cab, groceries" style={styles.field} value={debtTitle} />
        <AppButton disabled={saving} loading={saving} onPress={onSaveDebt}>
          Save entry
        </AppButton>
      </AppCard>

      <AppCard style={styles.detailActionCard}>
        <View style={styles.actionCardHeader}>
          <View>
            <AppText variant="bodyStrong">Record payment</AppText>
            <AppText color="textMuted" variant="caption">
              {settleAvailable > 0 ? `Available ${formatCurrencyCompact(settleAvailable)}` : "No pending amount in this direction"}
            </AppText>
          </View>
          <MaterialCommunityIcons name="cash-check" size={22} color={colors.textMuted} />
        </View>
        <View style={styles.debtModeRow}>
          <CategoryChip active={settleMode === "owes_me"} icon="cash-plus" label="They paid me" onPress={() => onSettleModeChange("owes_me")} />
          <CategoryChip active={settleMode === "i_owe"} icon="cash-minus" label="I paid them" onPress={() => onSettleModeChange("i_owe")} />
        </View>
        <FormField
          keyboardType="decimal-pad"
          label="Amount paid"
          onChangeText={onSettleAmountChange}
          placeholder={settleAvailable > 0 ? `Up to ${formatCurrencyCompact(settleAvailable)}` : "0"}
          style={styles.field}
          value={settleAmount}
        />
        <View style={styles.settleActions}>
          <AppButton disabled={settling || settleAvailable <= 0} loading={settling} onPress={onSettleBalance} style={styles.settleActionButton}>
            Save payment
          </AppButton>
          <AppButton disabled={settling || settleAvailable <= 0} onPress={onSettleAll} style={styles.settleActionButton} variant="secondary">
            Settle all
          </AppButton>
        </View>
      </AppCard>

      <AppCard style={styles.historyPanel}>
        <View style={styles.actionCardHeader}>
          <AppText variant="bodyStrong">History</AppText>
          <AppText color="textSubtle" variant="caption">{history.length} entries</AppText>
        </View>
        {historyLoading ? (
          <PersonHistorySkeleton />
        ) : history.length ? (
          history.map((expense) => <HistoryRow expense={expense} key={expense.id} person={person} />)
        ) : (
          <View style={styles.historyEmpty}>
            <MaterialCommunityIcons name="history" size={24} color={colors.textMuted} />
            <AppText color="textMuted" variant="body">No history with this person yet.</AppText>
          </View>
        )}
      </AppCard>
    </View>
  );
}

function PersonHistorySkeleton() {
  return (
    <View>
      {[0, 1, 2].map((item) => (
        <View key={item} style={styles.historySkeletonRow}>
          <SkeletonBlock height={14} width="64%" />
          <SkeletonBlock height={12} style={styles.historySkeletonLine} width="42%" />
        </View>
      ))}
    </View>
  );
}

function LedgerValue({ label, tone, value }: { label: string; tone: "danger" | "success"; value: string }) {
  const { colors } = useDs();
  const color = tone === "success" ? colors.success : colors.danger;
  return (
    <View style={styles.ledgerValue}>
      <AppText color="textMuted" variant="caption">
        {label}
      </AppText>
      <AppText style={{ color }} variant="headline">
        {formatCurrencyCompact(value)}
      </AppText>
    </View>
  );
}

function HistoryRow({ expense, person }: { expense: Expense; person: Person }) {
  const { colors } = useDs();
  const paidByPerson = expense.paid_by_person === person.id;
  const tone = paidByPerson ? colors.danger : colors.success;
  const direction = paidByPerson ? "You owe" : "Owes you";
  return (
    <ListRow
      amount={formatCurrencyCompact(expense.amount)}
      description={`${direction} | ${formatDateLabel(expense.expense_date)} | ${formatPaymentMethod(expense.payment_method)}`}
      icon={paidByPerson ? "arrow-up-right" : "arrow-down-left"}
      iconColor={tone}
      title={expense.title}
    />
  );
}

function EmptyPeople({ onAdd }: { onAdd: () => void }) {
  return (
    <AppCard>
      <View style={styles.emptyPeople}>
        <MaterialCommunityIcons name="account-group-outline" size={36} color="#64748B" />
        <AppText style={styles.emptyTitle} variant="headline">
          No people yet
        </AppText>
        <AppText color="textMuted" style={styles.emptyBody} variant="body">
          Add people you share daily expenses with. No email invites required.
        </AppText>
        <AppButton icon="account-plus-outline" onPress={onAdd} variant="secondary">
          Add person
        </AppButton>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  actionCardHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: dsSpace[1.5],
  },
  addPreview: {
    alignItems: "center",
    marginBottom: dsSpace[2],
  },
  avatar: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#FFFFFF",
  },
  balanceIcon: {
    alignItems: "center",
    borderRadius: dsRadius.pill,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  balanceTile: {
    flex: 1,
    marginBottom: 0,
  },
  balanceTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: dsSpace[1],
  },
  capitalize: {
    textTransform: "capitalize",
  },
  chipRow: {
    gap: dsSpace[1],
    paddingBottom: dsSpace[1.5],
    paddingRight: dsSpace[2],
  },
  detailActionCard: {
    marginBottom: dsSpace[1.5],
  },
  debtModeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: dsSpace[1],
    marginBottom: dsSpace[1.5],
  },
  detailPanel: {
    paddingBottom: dsSpace[1],
  },
  detailHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: dsSpace[1.5],
    marginBottom: dsSpace[2],
  },
  detailIdentity: {
    flex: 1,
    minWidth: 0,
  },
  emptyBody: {
    marginBottom: dsSpace[2],
    maxWidth: 260,
    textAlign: "center",
  },
  emptyPeople: {
    alignItems: "center",
    paddingVertical: dsSpace[3],
  },
  emptyTitle: {
    marginTop: dsSpace[1],
  },
  field: {
    marginBottom: dsSpace[1.5],
  },
  fieldLabel: {
    marginBottom: dsSpace[1],
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: dsSpace[1],
    marginBottom: dsSpace[2],
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  heroRow: {
    flexDirection: "row",
    gap: dsSpace[1],
    marginBottom: dsSpace[2],
  },
  historyEmpty: {
    alignItems: "center",
    gap: dsSpace[1],
    paddingVertical: dsSpace[2],
  },
  historyPanel: {
    paddingVertical: dsSpace[1.5],
  },
  historySkeletonLine: {
    marginTop: dsSpace[1],
  },
  historySkeletonRow: {
    paddingVertical: dsSpace[1.5],
  },
  ledgerRow: {
    flexDirection: "row",
    gap: dsSpace[1],
    marginBottom: dsSpace[2],
  },
  ledgerValue: {
    flex: 1,
  },
  listCard: {
    paddingVertical: 0,
  },
  personRow: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: dsSpace[1.5],
    minHeight: 76,
    paddingVertical: dsSpace[1.5],
  },
  personText: {
    flex: 1,
    minWidth: 0,
  },
  searchField: {
    marginTop: dsSpace[2],
  },
  settleActionButton: {
    flex: 1,
  },
  settleActions: {
    flexDirection: "row",
    gap: dsSpace[1],
  },
  tabs: {
    marginBottom: dsSpace[2],
    marginTop: dsSpace[2],
  },
});
