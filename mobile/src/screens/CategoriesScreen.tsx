import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Text, TextInput } from "react-native-paper";

import { AppButton } from "../components/AppLayout";
import { SoraCard, SoraChip, SoraEmpty, SoraError, SoraHeader, SoraIconRow, SoraScreen } from "../components/SoraUI";
import { useAppSettings } from "../context/AppSettingsContext";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { createCategory, deleteCategory, getCategories, seedDefaultCategories, updateCategory } from "../services/expenseApi";
import { getCategoryVisual } from "../theme/soraTheme";
import type { ExpenseCategory } from "../types/api";

type Props = NativeStackScreenProps<RootStackParamList, "Categories">;

const colorOptions = ["#6C48F5", "#2F9E55", "#D94841", "#F79009", "#5B7BEF", "#D95FA7", "#0F766E"];
const iconOptions = [
  "cart-outline",
  "silverware-fork-knife",
  "home-outline",
  "lightning-bolt-outline",
  "car-outline",
  "gas-station-outline",
  "dots-horizontal",
] as const;

function isHexColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export function CategoriesScreen({ navigation }: Props) {
  const { colors } = useAppSettings();
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string>("cart-outline");
  const [color, setColor] = useState("#6C48F5");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setCategories(await getCategories());
    } catch {
      setError("Could not load categories.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(categories.length === 0);
      load();
    }, [categories.length, load])
  );

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setIcon("cart-outline");
    setColor("#6C48F5");
  };

  const startEdit = (category: ExpenseCategory) => {
    setEditingId(category.id);
    setName(category.name);
    setIcon(category.icon || "cart-outline");
    setColor(category.color && isHexColor(category.color) ? category.color : "#6C48F5");
  };

  const save = async () => {
    const cleanName = name.trim();
    if (!cleanName) {
      setError("Category name is required.");
      return;
    }
    if (!isHexColor(color)) {
      setError("Choose a valid color.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = { color, icon, name: cleanName };
      if (editingId) {
        await updateCategory(editingId, payload);
      } else {
        await createCategory(payload);
      }
      resetForm();
      await load();
    } catch {
      setError("Could not save category. Names must be unique.");
    } finally {
      setSaving(false);
    }
  };

  const seedDefaults = async () => {
    setSaving(true);
    setError("");
    try {
      setCategories(await seedDefaultCategories());
      resetForm();
    } catch {
      setError("Could not create default categories.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    if (!editingId) {
      return;
    }
    Alert.alert("Delete category", "Existing expenses will become uncategorized.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setSaving(true);
          try {
            await deleteCategory(editingId);
            resetForm();
            await load();
          } catch {
            setError("Could not delete category.");
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  return (
    <SoraScreen>
      <SoraHeader onBack={() => navigation.goBack()} title="Categories" subtitle="Reusable colors and icons for expenses" />
      <SoraError text={error} />

      <SoraCard>
        <Text style={[styles.blockTitle, { color: colors.text }]}>{editingId ? "Edit Category" : "Add Category"}</Text>
        <TextInput label="Name" mode="outlined" value={name} onChangeText={setName} disabled={saving} style={styles.input} />

        <Text style={[styles.label, { color: colors.text }]}>Icon</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {iconOptions.map((item) => (
            <SoraChip active={icon === item} key={item} onPress={() => setIcon(item)}>
              <MaterialCommunityIcons name={item} size={15} color={icon === item ? "#FFFFFF" : colors.accent} /> Icon
            </SoraChip>
          ))}
        </ScrollView>

        <Text style={[styles.label, { color: colors.text }]}>Color</Text>
        <View style={styles.colorRow}>
          {colorOptions.map((item) => (
            <Pressable
              android_ripple={{ color: "rgba(255,255,255,0.18)", borderless: true }}
              key={item}
              onPress={() => setColor(item)}
              style={[styles.colorDot, { backgroundColor: item }, color === item && styles.colorDotActive]}
            >
              {color === item ? <MaterialCommunityIcons name="check" size={20} color="#FFFFFF" /> : null}
            </Pressable>
          ))}
        </View>

        <View style={styles.actions}>
          <AppButton mode="contained" onPress={save} loading={saving} disabled={saving}>
            {editingId ? "Save" : "Add"}
          </AppButton>
          {editingId ? (
            <>
              <AppButton mode="outlined" onPress={resetForm} disabled={saving}>
                Cancel
              </AppButton>
              <AppButton mode="outlined" textColor={colors.danger} onPress={confirmDelete} disabled={saving}>
                Delete
              </AppButton>
            </>
          ) : null}
        </View>
      </SoraCard>

      <AppButton mode="outlined" onPress={seedDefaults} disabled={saving} style={styles.defaultsButton}>
        Seed Default Indian Household Categories
      </AppButton>

      {categories.length ? (
        categories.map((category) => {
          const visual = getCategoryVisual(category.name, category.icon, category.color);
          return (
            <SoraCard key={category.id} style={styles.categoryCard}>
              <SoraIconRow
                icon={visual.icon}
                iconBackground={visual.background}
                iconColor={visual.color}
                meta={`${category.icon || "auto icon"} - ${category.color || "default color"}`}
                onPress={() => startEdit(category)}
                title={category.name}
              />
            </SoraCard>
          );
        })
      ) : (
        <SoraEmpty text={loading ? "Loading categories..." : "No categories yet."} />
      )}
    </SoraScreen>
  );
}

const styles = StyleSheet.create({
  blockTitle: {
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 12,
  },
  input: {
    marginBottom: 12,
  },
  label: {
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 8,
  },
  chipRow: {
    gap: 8,
    paddingBottom: 14,
    paddingRight: 18,
  },
  colorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  colorDot: {
    alignItems: "center",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  colorDotActive: {
    borderColor: "#FFFFFF",
    borderWidth: 2,
    elevation: 3,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  defaultsButton: {
    marginBottom: 14,
  },
  categoryCard: {
    marginBottom: 10,
    paddingVertical: 10,
  },
});
