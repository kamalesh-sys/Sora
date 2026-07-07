import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import {
  AppButton,
  AppCard,
  AppScreen,
  AppText,
  CategoryChip,
  EmptyState,
  ErrorState,
  FormField,
  IconButton,
  ListRow,
  SectionHeader,
  SkeletonList,
  useDs,
} from "../design-system";
import { dsRadius, dsSpace, dsTouch } from "../design-system/tokens";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { createCategory, deleteCategory, getCategories, seedDefaultCategories, updateCategory } from "../services/expenseApi";
import { getCategoryVisual } from "../theme/soraTheme";
import type { ExpenseCategory } from "../types/api";

type Props = NativeStackScreenProps<RootStackParamList, "Categories">;

const colorOptions = ["#2563EB", "#16A34A", "#EA580C", "#7C3AED", "#DB2777", "#0F766E", "#475569", "#D97706"];
const iconOptions: Array<{ icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string }> = [
  { icon: "cart-outline", label: "Groceries" },
  { icon: "silverware-fork-knife", label: "Food" },
  { icon: "home-outline", label: "Home" },
  { icon: "lightning-bolt-outline", label: "Utilities" },
  { icon: "car-outline", label: "Transport" },
  { icon: "gas-station-outline", label: "Fuel" },
  { icon: "medical-bag", label: "Health" },
  { icon: "dots-horizontal", label: "Other" },
];

function isHexColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export function CategoriesScreen({ navigation }: Props) {
  const { colors } = useDs();
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<keyof typeof MaterialCommunityIcons.glyphMap>("cart-outline");
  const [color, setColor] = useState(colorOptions[0]);
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
    setColor(colorOptions[0]);
    setError("");
  };

  const startEdit = (category: ExpenseCategory) => {
    const visual = getCategoryVisual(category.name, category.icon, category.color);
    setEditingId(category.id);
    setName(category.name);
    setIcon((category.icon || visual.icon || "cart-outline") as keyof typeof MaterialCommunityIcons.glyphMap);
    setColor(category.color && isHexColor(category.color) ? category.color : visual.color);
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
    if (!editingId) return;
    Alert.alert("Delete category", "Existing expenses will become uncategorized.", [
      { text: "Cancel", style: "cancel" },
      {
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
        style: "destructive",
        text: "Delete",
      },
    ]);
  };

  return (
    <AppScreen>
      <View style={styles.header}>
        <IconButton accessibilityLabel="Go back" icon="arrow-left" onPress={() => navigation.goBack()} />
        <View style={styles.headerText}>
          <AppText variant="title">Categories</AppText>
        </View>
      </View>

      <ErrorState text={error} />

      <AppCard elevated style={styles.formCard}>
        <View style={styles.formHeader}>
          <View style={styles.formHeaderText}>
            <AppText variant="headline">{editingId ? "Edit category" : "Add category"}</AppText>
          </View>
          <View style={[styles.preview, { backgroundColor: `${color}18` }]}>
            <MaterialCommunityIcons name={icon} size={24} color={color} />
          </View>
        </View>

        <FormField label="Name" onChangeText={setName} placeholder="Kitchen, Petrol, D Mart" style={styles.field} value={name} />

        <AppText color="textMuted" style={styles.fieldLabel} variant="label">
          Icon
        </AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {iconOptions.map((item) => (
            <CategoryChip
              active={icon === item.icon}
              icon={item.icon}
              key={item.icon}
              label={item.label}
              onPress={() => setIcon(item.icon)}
            />
          ))}
        </ScrollView>

        <AppText color="textMuted" style={styles.fieldLabel} variant="label">
          Color
        </AppText>
        <View style={styles.colorRow}>
          {colorOptions.map((item) => (
            <Pressable
              accessibilityLabel={`Select ${item} category color`}
              accessibilityRole="button"
              accessibilityState={{ selected: color === item }}
              android_ripple={{ color: "rgba(255,255,255,0.24)", borderless: true }}
              key={item}
              onPress={() => setColor(item)}
              style={[
                styles.colorDot,
                { backgroundColor: item },
                color === item ? { borderColor: colors.text, borderWidth: 2 } : null,
              ]}
            >
              {color === item ? <MaterialCommunityIcons name="check" size={19} color="#FFFFFF" /> : null}
            </Pressable>
          ))}
        </View>

        <View style={styles.actions}>
          <AppButton disabled={saving} loading={saving} onPress={save} style={styles.actionButton}>
            {editingId ? "Save" : "Add"}
          </AppButton>
          {editingId ? (
            <>
              <AppButton disabled={saving} onPress={resetForm} style={styles.actionButton} variant="secondary">
                Cancel
              </AppButton>
              <AppButton disabled={saving} onPress={confirmDelete} style={styles.actionButton} variant="danger">
                Delete
              </AppButton>
            </>
          ) : null}
        </View>
      </AppCard>

      <AppButton disabled={saving} icon="auto-fix" onPress={seedDefaults} variant="secondary">
        Add default Indian categories
      </AppButton>

      <SectionHeader title={`Saved categories (${categories.length})`} />
      {loading && !categories.length ? (
        <SkeletonList rows={4} />
      ) : categories.length ? (
        <AppCard style={styles.listCard}>
          {categories.map((category) => {
            const visual = getCategoryVisual(category.name, category.icon, category.color);
            return (
              <ListRow
                description={category.color || "Default color"}
                icon={visual.icon as keyof typeof MaterialCommunityIcons.glyphMap}
                iconColor={visual.color}
                key={category.id}
                onPress={() => startEdit(category)}
                rightLabel="Edit"
                title={category.name}
              />
            );
          })}
        </AppCard>
      ) : (
        <EmptyState
          action="Add defaults"
          body="Start with everyday Indian categories like groceries, food, utilities and transport."
          icon="shape-outline"
          onAction={seedDefaults}
          title="No categories yet"
        />
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    minWidth: 112,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: dsSpace[1],
  },
  chipRow: {
    gap: dsSpace[1],
    paddingBottom: dsSpace[1.5],
    paddingRight: dsSpace[2],
  },
  colorDot: {
    alignItems: "center",
    borderRadius: dsRadius.pill,
    height: dsTouch.comfortable,
    justifyContent: "center",
    width: dsTouch.comfortable,
  },
  colorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: dsSpace[1],
    marginBottom: dsSpace[2],
  },
  field: {
    marginBottom: dsSpace[1.5],
  },
  fieldLabel: {
    marginBottom: dsSpace[1],
  },
  formCard: {
    marginBottom: dsSpace[2],
  },
  formHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: dsSpace[1.5],
    justifyContent: "space-between",
    marginBottom: dsSpace[2],
  },
  formHeaderText: {
    flex: 1,
    minWidth: 0,
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
  listCard: {
    paddingVertical: 0,
  },
  preview: {
    alignItems: "center",
    borderRadius: dsRadius.pill,
    flexShrink: 0,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
});
