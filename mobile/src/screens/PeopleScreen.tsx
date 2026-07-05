import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Text, TextInput } from "react-native-paper";

import { AppButton } from "../components/AppLayout";
import { SoraCard, SoraChip, SoraEmpty, SoraError, SoraScreen, SoraSectionHeader } from "../components/SoraUI";
import { useAppSettings } from "../context/AppSettingsContext";
import { useAuth } from "../context/AuthContext";
import type { RootStackParamList } from "../navigation/RootNavigator";
import {
  acceptInvitationById,
  cancelInvitation,
  createPerson,
  declineInvitation,
  getInvitations,
  getPeople,
  getPersonLedger,
  getPersonShareSummary,
  invitePerson,
} from "../services/expenseApi";
import type { PeopleInvitation, Person, PersonLedger } from "../types/api";
import { formatCurrencyCompact, parseAmount } from "../utils/format";

type Props = NativeStackScreenProps<RootStackParamList, "People">;
type PeopleTab = "all" | "owes_me" | "i_owe" | "settled";

const relations: Person["relation_type"][] = ["family", "friend", "roommate", "relative", "helper", "other"];
const tabs: Array<{ label: string; value: PeopleTab }> = [
  { label: "All", value: "all" },
  { label: "Owes me", value: "owes_me" },
  { label: "I owe", value: "i_owe" },
  { label: "Settled", value: "settled" },
];
const emptyLedger: PersonLedger = {
  pending_balance: "0.00",
  settlements_count: 0,
  total_i_owe: "0.00",
  total_owed_to_me: "0.00",
};

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "P";
}

function getInviteOwner(invite: PeopleInvitation) {
  return invite.invited_by_detail?.first_name || invite.invited_by_detail?.email || "Someone";
}

export function PeopleScreen({ navigation }: Props) {
  const { colors } = useAppSettings();
  const { user } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [invitations, setInvitations] = useState<PeopleInvitation[]>([]);
  const [ledgers, setLedgers] = useState<Record<number, PersonLedger>>({});
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [activeTab, setActiveTab] = useState<PeopleTab>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [relation, setRelation] = useState<Person["relation_type"]>("family");
  const [inviteEmail, setInviteEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isReceivedInvite = useCallback(
    (invite: PeopleInvitation) => {
      const emailMatch = invite.email.toLowerCase() === user?.email.toLowerCase();
      return invite.direction === "received" || (emailMatch && invite.invited_by !== user?.id);
    },
    [user?.email, user?.id]
  );

  const load = useCallback(async () => {
    setError("");
    try {
      const [peopleRows, inviteRows] = await Promise.all([getPeople(), getInvitations()]);
      const ledgerEntries = await Promise.all(
        peopleRows.map(async (person) => {
          try {
            return [person.id, await getPersonLedger(person.id)] as const;
          } catch {
            return [person.id, emptyLedger] as const;
          }
        })
      );
      setPeople(peopleRows);
      setInvitations(inviteRows);
      setLedgers(Object.fromEntries(ledgerEntries));
    } catch {
      setError("Could not load people.");
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

  const receivedInvites = useMemo(
    () => invitations.filter((invite) => invite.status === "pending" && isReceivedInvite(invite)),
    [invitations, isReceivedInvite]
  );
  const sentInvites = useMemo(
    () => invitations.filter((invite) => !isReceivedInvite(invite)),
    [invitations, isReceivedInvite]
  );

  const filteredPeople = useMemo(() => {
    const query = search.trim().toLowerCase();
    return people.filter((person) => {
      const ledger = ledgers[person.id] ?? emptyLedger;
      const owed = parseAmount(ledger.total_owed_to_me);
      const owe = parseAmount(ledger.total_i_owe);
      const matchesQuery =
        !query ||
        person.name.toLowerCase().includes(query) ||
        person.email?.toLowerCase().includes(query) ||
        person.relation_type.includes(query);

      if (!matchesQuery) {
        return false;
      }
      if (activeTab === "owes_me") {
        return owed > 0;
      }
      if (activeTab === "i_owe") {
        return owe > 0;
      }
      if (activeTab === "settled") {
        return owed <= 0 && owe <= 0;
      }
      return true;
    });
  }, [activeTab, ledgers, people, search]);

  const savePerson = async () => {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await createPerson({
        email: email.trim() || null,
        name: name.trim(),
        phone: phone.trim(),
        relation_type: relation,
      });
      setName("");
      setEmail("");
      setPhone("");
      setShowAddForm(false);
      await load();
    } catch {
      setError("Could not save person.");
    } finally {
      setSaving(false);
    }
  };

  const sendInvite = async () => {
    const target = inviteEmail.trim();
    if (!target) {
      setError("Invite email is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await invitePerson({ email: target, relation_type: relation });
      setInviteEmail("");
      setShowInviteForm(false);
      await load();
    } catch {
      setError("Could not send invite. Check SMTP settings.");
    } finally {
      setSaving(false);
    }
  };

  const acceptInvite = async (invite: PeopleInvitation) => {
    setSaving(true);
    setError("");
    try {
      await acceptInvitationById(invite.id);
      await load();
    } catch {
      setError("Could not accept invitation.");
    } finally {
      setSaving(false);
    }
  };

  const declineInvite = async (invite: PeopleInvitation) => {
    setSaving(true);
    setError("");
    try {
      await declineInvitation(invite.id);
      await load();
    } catch {
      setError("Could not decline invitation.");
    } finally {
      setSaving(false);
    }
  };

  const cancelSentInvite = async (invite: PeopleInvitation) => {
    setSaving(true);
    setError("");
    try {
      await cancelInvitation(invite.id);
      await load();
    } catch {
      setError("Could not cancel invitation.");
    } finally {
      setSaving(false);
    }
  };

  const showSummary = async () => {
    if (!selectedPerson) {
      return;
    }
    try {
      const result = await getPersonShareSummary(selectedPerson.id);
      Alert.alert("Share Summary", result.text);
    } catch {
      setError("Could not load share summary.");
    }
  };

  return (
    <SoraScreen>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>People</Text>
        <View style={styles.headerActions}>
          <Pressable android_ripple={{ color: `${colors.accent}22`, borderless: true }} onPress={() => setSearchOpen((current) => !current)} style={styles.headerIcon}>
            <MaterialCommunityIcons name={searchOpen ? "close" : "magnify"} size={28} color={colors.text} />
          </Pressable>
          <Pressable android_ripple={{ color: "rgba(255,255,255,0.22)", borderless: true }} onPress={() => setShowAddForm((current) => !current)} style={[styles.plusButton, { backgroundColor: colors.accent }]}>
            <MaterialCommunityIcons name="plus" size={28} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      <View style={styles.tabs}>
        {tabs.map((tab) => (
          <Pressable key={tab.value} onPress={() => setActiveTab(tab.value)} style={styles.tab}>
            <Text style={[styles.tabText, { color: activeTab === tab.value ? colors.accent : colors.muted }]}>{tab.label}</Text>
            {activeTab === tab.value ? <View style={[styles.tabLine, { backgroundColor: colors.accent }]} /> : null}
          </Pressable>
        ))}
      </View>

      {searchOpen ? (
        <TextInput
          autoCapitalize="none"
          label="Search people"
          mode="outlined"
          onChangeText={setSearch}
          style={styles.input}
          value={search}
        />
      ) : null}

      <SoraError text={error} />

      {receivedInvites.length ? (
        <SoraCard style={[styles.notificationCard, { backgroundColor: `${colors.accent}12`, borderColor: `${colors.accent}32` }]}>
          <View style={styles.notificationHeader}>
            <MaterialCommunityIcons name="bell-badge-outline" size={24} color={colors.accent} />
            <Text style={[styles.notificationTitle, { color: colors.text }]}>Pending invitations</Text>
          </View>
          {receivedInvites.map((invite) => (
            <InviteRequestRow
              disabled={saving}
              invite={invite}
              key={invite.id}
              onAccept={() => acceptInvite(invite)}
              onDecline={() => declineInvite(invite)}
            />
          ))}
        </SoraCard>
      ) : null}

      <InviteBanner onInvite={() => setShowInviteForm((current) => !current)} />

      {showInviteForm ? (
        <SoraCard>
          <Text style={[styles.blockTitle, { color: colors.text }]}>Invite by email</Text>
          <TextInput label="Email" mode="outlined" value={inviteEmail} onChangeText={setInviteEmail} keyboardType="email-address" autoCapitalize="none" style={styles.input} />
          <RelationPicker relation={relation} onChange={setRelation} />
          <AppButton mode="contained" loading={saving} onPress={sendInvite}>Send invite</AppButton>
        </SoraCard>
      ) : null}

      {showAddForm ? (
        <SoraCard>
          <Text style={[styles.blockTitle, { color: colors.text }]}>Add person</Text>
          <TextInput label="Name" mode="outlined" value={name} onChangeText={setName} style={styles.input} />
          <TextInput label="Email" mode="outlined" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" style={styles.input} />
          <TextInput label="Phone" mode="outlined" value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={styles.input} />
          <RelationPicker relation={relation} onChange={setRelation} />
          <AppButton mode="contained" loading={saving} onPress={savePerson}>Save person</AppButton>
        </SoraCard>
      ) : null}

      <View style={styles.peopleTitleRow}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>People</Text>
        <Text style={[styles.sectionCount, { color: colors.success }]}>({filteredPeople.length})</Text>
      </View>

      {filteredPeople.length ? (
        <View style={styles.peopleList}>
          {filteredPeople.map((person) => (
            <PersonRow
              key={person.id}
              ledger={ledgers[person.id] ?? emptyLedger}
              onPress={() => setSelectedPerson(person)}
              person={person}
            />
          ))}
        </View>
      ) : (
        <SoraEmpty text={loading ? "Loading people..." : "No people found."} />
      )}

      {selectedPerson ? (
        <SelectedPersonCard
          ledger={ledgers[selectedPerson.id] ?? emptyLedger}
          onClose={() => setSelectedPerson(null)}
          onSummary={showSummary}
          person={selectedPerson}
        />
      ) : null}

      {sentInvites.length ? (
        <>
          <SoraSectionHeader title="Sent Invites" />
          {sentInvites.map((invite) => (
            <SentInviteRow
              disabled={saving}
              invite={invite}
              key={invite.id}
              onCancel={() => cancelSentInvite(invite)}
            />
          ))}
        </>
      ) : null}
    </SoraScreen>
  );
}

function RelationPicker({ relation, onChange }: { relation: Person["relation_type"]; onChange: (value: Person["relation_type"]) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {relations.map((item) => (
        <SoraChip active={relation === item} key={item} onPress={() => onChange(item)}>
          {item}
        </SoraChip>
      ))}
    </ScrollView>
  );
}

function InviteBanner({ onInvite }: { onInvite: () => void }) {
  const { colors } = useAppSettings();
  return (
    <View style={styles.inviteBanner}>
      <View style={styles.inviteText}>
        <Text style={styles.inviteTitle}>Invite your friends or family</Text>
        <Text style={styles.inviteCopy}>Track and settle expenses together</Text>
        <AppButton compact mode="contained" onPress={onInvite} style={styles.inviteButton}>Invite</AppButton>
      </View>
      <View style={styles.avatarStack}>
        {["account", "account-heart", "account-star"].map((icon, index) => (
          <View key={icon} style={[styles.smallAvatar, { backgroundColor: index === 0 ? "#DBEAFE" : index === 1 ? "#DCFCE7" : "#EDE9FE", marginLeft: index ? -8 : 0 }]}>
            <MaterialCommunityIcons name={icon as keyof typeof MaterialCommunityIcons.glyphMap} size={24} color={index === 0 ? colors.accent : index === 1 ? colors.success : "#7C3AED"} />
          </View>
        ))}
      </View>
    </View>
  );
}

function InviteRequestRow({
  disabled,
  invite,
  onAccept,
  onDecline,
}: {
  disabled: boolean;
  invite: PeopleInvitation;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { colors } = useAppSettings();
  return (
    <View style={[styles.inviteRequest, { borderColor: colors.border }]}>
      <View style={styles.inviteRequestText}>
        <Text style={[styles.inviteRequestTitle, { color: colors.text }]}>{getInviteOwner(invite)} invited you</Text>
        <Text style={[styles.inviteRequestMeta, { color: colors.muted }]}>{invite.relation_type} connection for shared expenses</Text>
      </View>
      <View style={styles.inviteActions}>
        <AppButton compact mode="contained" disabled={disabled} onPress={onAccept}>Accept</AppButton>
        <AppButton compact mode="text" disabled={disabled} onPress={onDecline}>Decline</AppButton>
      </View>
    </View>
  );
}

function PersonRow({ ledger, onPress, person }: { ledger: PersonLedger; onPress: () => void; person: Person }) {
  const { colors } = useAppSettings();
  const owed = parseAmount(ledger.total_owed_to_me);
  const owe = parseAmount(ledger.total_i_owe);
  const status =
    owed > 0
      ? { color: colors.success, text: `Owes you ${formatCurrencyCompact(owed)}` }
      : owe > 0
        ? { color: colors.danger, text: `You owe ${formatCurrencyCompact(owe)}` }
        : { color: colors.muted, text: "No dues" };

  return (
    <Pressable android_ripple={{ color: `${colors.accent}14` }} onPress={onPress} style={styles.personRow}>
      <View style={[styles.avatar, { backgroundColor: person.linked_user ? `${colors.success}18` : `${colors.accent}16` }]}>
        <Text style={[styles.avatarText, { color: person.linked_user ? colors.success : colors.accent }]}>{getInitials(person.name)}</Text>
      </View>
      <View style={styles.personText}>
        <Text numberOfLines={1} style={[styles.personName, { color: colors.text }]}>{person.name}</Text>
        <Text numberOfLines={1} style={[styles.personMeta, { color: status.color }]}>{status.text}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={26} color={colors.border} />
    </Pressable>
  );
}

function SelectedPersonCard({
  ledger,
  onClose,
  onSummary,
  person,
}: {
  ledger: PersonLedger;
  onClose: () => void;
  onSummary: () => void;
  person: Person;
}) {
  const { colors } = useAppSettings();
  return (
    <SoraCard tone="purple" style={styles.selectedCard}>
      <View style={styles.selectedHeader}>
        <View>
          <Text style={styles.selectedName}>{person.name}</Text>
          <Text style={styles.selectedMeta}>{person.email || person.relation_type}</Text>
        </View>
        <Pressable android_ripple={{ color: "rgba(255,255,255,0.2)", borderless: true }} onPress={onClose}>
          <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
        </Pressable>
      </View>
      <View style={styles.ledgerGrid}>
        <View>
          <Text style={styles.ledgerLabel}>Owes you</Text>
          <Text style={styles.ledgerValue}>{formatCurrencyCompact(ledger.total_owed_to_me)}</Text>
        </View>
        <View>
          <Text style={styles.ledgerLabel}>You owe</Text>
          <Text style={styles.ledgerValue}>{formatCurrencyCompact(ledger.total_i_owe)}</Text>
        </View>
      </View>
      <AppButton mode="contained-tonal" textColor={colors.accent} onPress={onSummary}>Share summary</AppButton>
    </SoraCard>
  );
}

function SentInviteRow({ disabled, invite, onCancel }: { disabled: boolean; invite: PeopleInvitation; onCancel: () => void }) {
  const { colors } = useAppSettings();
  return (
    <SoraCard style={styles.sentInviteCard}>
      <View style={styles.sentInviteRow}>
        <View style={[styles.mailIcon, { backgroundColor: invite.status === "pending" ? `${colors.accent}14` : colors.background }]}>
          <MaterialCommunityIcons name="email-outline" size={22} color={invite.status === "pending" ? colors.accent : colors.muted} />
        </View>
        <View style={styles.personText}>
          <Text numberOfLines={1} style={[styles.personName, { color: colors.text }]}>{invite.email}</Text>
          <Text style={[styles.personMeta, { color: colors.muted }]}>{invite.relation_type} - {invite.status}</Text>
        </View>
        {invite.status === "pending" ? <AppButton compact mode="text" disabled={disabled} onPress={onCancel}>Cancel</AppButton> : null}
      </View>
    </SoraCard>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    borderRadius: 26,
    height: 52,
    justifyContent: "center",
    marginRight: 14,
    width: 52,
  },
  avatarStack: {
    alignItems: "center",
    flexDirection: "row",
  },
  avatarText: {
    fontSize: 16,
    fontWeight: "900",
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
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  headerActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  headerIcon: {
    alignItems: "center",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  input: {
    marginBottom: 12,
  },
  inviteActions: {
    alignItems: "flex-end",
    gap: 4,
  },
  inviteBanner: {
    alignItems: "flex-end",
    backgroundColor: "#FEF9C3",
    borderRadius: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
    padding: 18,
  },
  inviteButton: {
    alignSelf: "flex-start",
    marginTop: 12,
  },
  inviteCopy: {
    color: "#64748B",
    fontSize: 14,
    lineHeight: 19,
    marginTop: 5,
  },
  inviteRequest: {
    alignItems: "center",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingTop: 12,
  },
  inviteRequestMeta: {
    fontSize: 13,
    marginTop: 3,
  },
  inviteRequestText: {
    flex: 1,
    minWidth: 0,
  },
  inviteRequestTitle: {
    fontSize: 15,
    fontWeight: "900",
  },
  inviteText: {
    flex: 1,
    minWidth: 0,
  },
  inviteTitle: {
    color: "#0F172A",
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 22,
  },
  ledgerGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  ledgerLabel: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 13,
    fontWeight: "800",
  },
  ledgerValue: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
    marginTop: 3,
  },
  mailIcon: {
    alignItems: "center",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    marginRight: 12,
    width: 44,
  },
  notificationCard: {
    gap: 12,
  },
  notificationHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  notificationTitle: {
    fontSize: 17,
    fontWeight: "900",
  },
  peopleList: {
    marginBottom: 18,
  },
  peopleTitleRow: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
    marginTop: 8,
  },
  personMeta: {
    fontSize: 14,
    marginTop: 4,
  },
  personName: {
    fontSize: 17,
    fontWeight: "900",
  },
  personRow: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 72,
    paddingVertical: 10,
  },
  personText: {
    flex: 1,
    minWidth: 0,
  },
  plusButton: {
    alignItems: "center",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  sectionCount: {
    fontSize: 18,
    fontWeight: "900",
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "900",
  },
  selectedCard: {
    marginTop: 4,
  },
  selectedHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  selectedMeta: {
    color: "rgba(255,255,255,0.76)",
    fontSize: 15,
    marginTop: 3,
  },
  selectedName: {
    color: "#FFFFFF",
    fontSize: 25,
    fontWeight: "900",
  },
  sentInviteCard: {
    marginBottom: 10,
    paddingVertical: 10,
  },
  sentInviteRow: {
    alignItems: "center",
    flexDirection: "row",
  },
  smallAvatar: {
    alignItems: "center",
    borderColor: "#FFFFFF",
    borderRadius: 23,
    borderWidth: 3,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  tab: {
    alignItems: "center",
    minHeight: 38,
    paddingHorizontal: 4,
  },
  tabLine: {
    borderRadius: 999,
    height: 2,
    marginTop: 8,
    width: 24,
  },
  tabText: {
    fontSize: 15,
    fontWeight: "800",
  },
  tabs: {
    borderBottomColor: "#E5E7EB",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 26,
    marginBottom: 18,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
  },
});
