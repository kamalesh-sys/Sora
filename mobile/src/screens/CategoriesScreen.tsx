import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import {
  AppBottomSheet,
  AppButton,
  AppCard,
  AppScreen,
  AppText,
  CategoryChip,
  EmptyState,
  ErrorState,
  FormField,
  IconButton,
  SectionHeader,
  SkeletonList,
  useDs,
} from "../design-system";
import { dsRadius, dsSpace, dsTouch } from "../design-system/tokens";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { createCategory, deleteCategory, getCategories, seedDefaultCategories, updateCategory } from "../services/expenseApi";
import { getCategoryVisual } from "../theme/soraTheme";
import type { ExpenseCategory } from "../types/api";
import { applySavedCategoryOrder } from "../utils/categoryOrder";

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
  { icon: "home-city-outline", label: "Rent" },
  { icon: "shopping-outline", label: "Shopping" },
  { icon: "movie-open-play-outline", label: "Movies" },
  { icon: "coffee-outline", label: "Coffee" },
  { icon: "cup-outline", label: "Tea" },
  { icon: "hamburger", label: "Snacks" },
  { icon: "pizza", label: "Pizza" },
  { icon: "train", label: "Train" },
  { icon: "bus", label: "Bus" },
  { icon: "bike", label: "Bike" },
  { icon: "airplane", label: "Travel" },
  { icon: "school-outline", label: "School" },
  { icon: "book-open-page-variant-outline", label: "Books" },
  { icon: "cellphone", label: "Mobile" },
  { icon: "wifi", label: "Internet" },
  { icon: "water-outline", label: "Water" },
  { icon: "fire", label: "Gas" },
  { icon: "bank-outline", label: "Bank" },
  { icon: "credit-card-outline", label: "Card" },
  { icon: "cash", label: "Cash" },
  { icon: "wallet-outline", label: "Wallet" },
  { icon: "gift-outline", label: "Gifts" },
  { icon: "heart-pulse", label: "Fitness" },
  { icon: "pill", label: "Medicine" },
  { icon: "doctor", label: "Doctor" },
  { icon: "baby-face-outline", label: "Kids" },
  { icon: "account-group-outline", label: "Family" },
  { icon: "face-woman-outline", label: "Salon" },
  { icon: "tshirt-crew-outline", label: "Clothes" },
  { icon: "shoe-sneaker", label: "Shoes" },
  { icon: "dog", label: "Pets" },
  { icon: "flower-outline", label: "Garden" },
  { icon: "tools", label: "Repairs" },
  { icon: "hammer-wrench", label: "Maintenance" },
  { icon: "briefcase-outline", label: "Work" },
  { icon: "store-outline", label: "Store" },
  { icon: "truck-outline", label: "Delivery" },
  { icon: "calendar-clock", label: "Bills" },
  { icon: "receipt-text-outline", label: "Receipts" },
  { icon: "chart-line", label: "Invest" },
  { icon: "piggy-bank-outline", label: "Savings" },
  { icon: "shield-check-outline", label: "Insurance" },
  { icon: "gamepad-variant-outline", label: "Games" },
  { icon: "music-note-outline", label: "Music" },
  { icon: "camera-outline", label: "Camera" },
  { icon: "palette-outline", label: "Hobby" },
  { icon: "church", label: "Prayer" },
  { icon: "charity", label: "Charity" },
  { icon: "dots-horizontal", label: "Other" },
];
const pinnedIconOptions = iconOptions.slice(0, 8);

function isHexColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export function CategoriesScreen({ navigation }: Props) {
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<keyof typeof MaterialCommunityIcons.glyphMap>("cart-outline");
  const [color, setColor] = useState(colorOptions[0]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setCategories(await applySavedCategoryOrder(await getCategories()));
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

  const openAdd = () => {
    resetForm();
    setShowEditor(true);
  };

  const closeEditor = () => {
    setShowEditor(false);
    resetForm();
  };

  const startEdit = (category: ExpenseCategory) => {
    const visual = getCategoryVisual(category.name, category.icon, category.color);
    setEditingId(category.id);
    setName(category.name);
    setIcon((category.icon || visual.icon || "cart-outline") as keyof typeof MaterialCommunityIcons.glyphMap);
    setColor(category.color && isHexColor(category.color) ? category.color : visual.color);
    setError("");
    setShowEditor(true);
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
      closeEditor();
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
      closeEditor();
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
            closeEditor();
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
        <IconButton accessibilityLabel="Add category" icon="plus" onPress={openAdd} tone="primary" />
      </View>

      <ErrorState text={error} />

      <View style={styles.summaryRow}>
        <AppCard style={styles.summaryCard}>
          <AppText color="textMuted" variant="caption">Saved</AppText>
          <AppText variant="headline">{categories.length} categories</AppText>
        </AppCard>
        <AppButton disabled={saving} icon="auto-fix" onPress={seedDefaults} style={styles.defaultsButton} variant="secondary">
          Defaults
        </AppButton>
      </View>

      <SectionHeader title={`Saved categories (${categories.length})`} />
      {loading && !categories.length ? (
        <SkeletonList rows={5} />
      ) : categories.length ? (
        <AppCard style={styles.listCard}>
          {categories.map((category) => (
            <CategoryRow category={category} key={category.id} onPress={() => startEdit(category)} />
          ))}
        </AppCard>
      ) : (
        <EmptyState
          action="Add category"
          body="Create quick labels for groceries, food, rent, fuel and anything you track often."
          icon="shape-outline"
          onAction={openAdd}
          title="No categories yet"
        />
      )}

      <CategoryEditorSheet
        color={color}
        editing={Boolean(editingId)}
        icon={icon}
        name={name}
        onClose={closeEditor}
        onColorChange={setColor}
        onDelete={editingId ? confirmDelete : undefined}
        onIconChange={setIcon}
        onNameChange={setName}
        onSave={save}
        saving={saving}
        visible={showEditor}
      />
    </AppScreen>
  );
}

function CategoryRow({ category, onPress }: { category: ExpenseCategory; onPress: () => void }) {
  const { colors } = useDs();
  const visual = getCategoryVisual(category.name, category.icon, category.color);
  return (
    <Pressable accessibilityRole="button" android_ripple={{ color: colors.press }} onPress={onPress}>
      <View style={[styles.categoryRow, { borderBottomColor: colors.border }]}>
        <View style={[styles.categoryIcon, { backgroundColor: `${visual.color}18` }]}>
          <MaterialCommunityIcons name={visual.icon} size={22} color={visual.color} />
        </View>
        <View style={styles.categoryText}>
          <AppText numberOfLines={1} variant="bodyStrong">{category.name}</AppText>
          <AppText color="textSubtle" numberOfLines={1} variant="caption">{visual.color}</AppText>
        </View>
        <View style={[styles.colorDotSmall, { backgroundColor: visual.color }]} />
        <MaterialCommunityIcons name="pencil-outline" size={22} color={colors.textSubtle} />
      </View>
    </Pressable>
  );
}

function CategoryEditorSheet({
  color,
  editing,
  icon,
  name,
  onClose,
  onColorChange,
  onDelete,
  onIconChange,
  onNameChange,
  onSave,
  saving,
  visible,
}: {
  color: string;
  editing: boolean;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  name: string;
  onClose: () => void;
  onColorChange: (value: string) => void;
  onDelete?: () => void;
  onIconChange: (value: keyof typeof MaterialCommunityIcons.glyphMap) => void;
  onNameChange: (value: string) => void;
  onSave: () => void;
  saving: boolean;
  visible: boolean;
}) {
  const { colors } = useDs();
  const [showIconManager, setShowIconManager] = useState(false);
  const [iconQuery, setIconQuery] = useState("");
  const visibleIcons = useMemo(() => {
    const query = iconQuery.trim().toLowerCase();
    if (!query) return iconOptions;
    return iconOptions.filter((item) => item.label.toLowerCase().includes(query) || item.icon.includes(query));
  }, [iconQuery]);

  return (
    <AppBottomSheet
      footer={
        <View style={styles.sheetActions}>
          <AppButton block disabled={saving} loading={saving} onPress={onSave}>
            {editing ? "Save category" : "Add category"}
          </AppButton>
          {editing && onDelete ? (
            <AppButton block disabled={saving} icon="trash-can-outline" onPress={onDelete} variant="danger">
              Delete category
            </AppButton>
          ) : null}
        </View>
      }
      maxHeight="90%"
      onClose={onClose}
      title={editing ? "Edit category" : "Add category"}
      visible={visible}
    >
      <View style={styles.editorPreview}>
        <View style={[styles.editorPreviewIcon, { backgroundColor: `${color}18` }]}>
          <MaterialCommunityIcons name={icon} size={30} color={color} />
        </View>
      </View>

      <FormField label="Name" onChangeText={onNameChange} placeholder="Kitchen, Petrol, D Mart" style={styles.field} value={name} />

      <View style={styles.iconHeader}>
        <AppText color="textMuted" variant="label">Icon</AppText>
        <AppButton compact icon={showIconManager ? "chevron-up" : "view-grid-outline"} onPress={() => setShowIconManager((current) => !current)} variant="secondary">
          {showIconManager ? "Close" : "Manage"}
        </AppButton>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {pinnedIconOptions.map((item) => (
          <CategoryChip
            active={icon === item.icon}
            icon={item.icon}
            key={item.icon}
            label={item.label}
            onPress={() => onIconChange(item.icon)}
            style={styles.iconChip}
          />
        ))}
      </ScrollView>
      {showIconManager ? (
        <View style={styles.iconManager}>
          <FormField autoCapitalize="none" label="Search" onChangeText={setIconQuery} placeholder="Food, travel, bills" style={styles.field} value={iconQuery} />
          <View style={styles.iconGrid}>
            {visibleIcons.map((item) => (
              <IconOptionButton
                item={item}
                key={item.icon}
                onPress={() => {
                  onIconChange(item.icon);
                  setShowIconManager(false);
                  setIconQuery("");
                }}
                selected={icon === item.icon}
              />
            ))}
          </View>
        </View>
      ) : null}

      <AppText color="textMuted" style={styles.fieldLabel} variant="label">Color</AppText>
      <View style={styles.colorRow}>
        {colorOptions.map((item) => (
          <Pressable
            accessibilityLabel={`Select ${item} category color`}
            accessibilityRole="button"
            accessibilityState={{ selected: color === item }}
            android_ripple={{ color: colors.press, borderless: true }}
            key={item}
            onPress={() => onColorChange(item)}
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
    </AppBottomSheet>
  );
}

function IconOptionButton({
  item,
  onPress,
  selected,
}: {
  item: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string };
  onPress: () => void;
  selected: boolean;
}) {
  const { colors } = useDs();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      android_ripple={{ color: colors.press }}
      onPress={onPress}
      style={[
        styles.iconOption,
        {
          backgroundColor: selected ? colors.bgInverse : colors.surfaceAlt,
          borderColor: selected ? colors.bgInverse : colors.border,
        },
      ]}
    >
      <MaterialCommunityIcons name={item.icon} size={22} color={selected ? colors.textInverse : colors.text} />
      <AppText numberOfLines={1} style={{ color: selected ? colors.textInverse : colors.text }} variant="caption">
        {item.label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  categoryIcon: {
    alignItems: "center",
    borderRadius: dsRadius.pill,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  categoryRow: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: dsSpace[1.5],
    minHeight: 76,
    paddingVertical: dsSpace[1.5],
  },
  categoryText: {
    flex: 1,
    minWidth: 0,
  },
  chipRow: {
    alignItems: "center",
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
  colorDotSmall: {
    borderRadius: dsRadius.pill,
    height: 14,
    width: 14,
  },
  colorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: dsSpace[1],
    marginBottom: dsSpace[1],
  },
  defaultsButton: {
    minWidth: 128,
  },
  editorPreview: {
    alignItems: "center",
    marginBottom: dsSpace[2],
  },
  editorPreviewIcon: {
    alignItems: "center",
    borderRadius: dsRadius.pill,
    height: 72,
    justifyContent: "center",
    width: 72,
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
  iconGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: dsSpace[1],
  },
  iconHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: dsSpace[1],
  },
  iconChip: {
    justifyContent: "center",
    maxWidth: 136,
    minWidth: 112,
  },
  iconManager: {
    marginBottom: dsSpace[1],
  },
  iconOption: {
    alignItems: "center",
    borderRadius: dsRadius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    gap: dsSpace[0.5],
    minHeight: 74,
    paddingHorizontal: dsSpace[1],
    paddingVertical: dsSpace[1],
    width: "30.8%",
  },
  listCard: {
    paddingVertical: 0,
  },
  sheetActions: {
    gap: dsSpace[1],
  },
  summaryCard: {
    flex: 1,
    marginBottom: 0,
    minHeight: 72,
  },
  summaryRow: {
    alignItems: "stretch",
    flexDirection: "row",
    gap: dsSpace[1],
    marginBottom: dsSpace[2],
  },
});
