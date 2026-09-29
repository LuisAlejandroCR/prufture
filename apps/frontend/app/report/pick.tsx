// report/pick.tsx: "What would you like to report?" — search, a grid of programme categories (tap to
// filter), nearest assignments, then catalog items as rows with category circles (Alternative A/C
// catalog). Picking an item starts a self-started report located by the phone.

import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Icon } from "../../src/components/icons/Icon";
import { BackLink, CategoryBadge, Screen, ScreenTitle, SectionLabel } from "../../src/components/ui";
import { tap } from "../../src/feedback";
import { CATEGORIES, itemsByCategory, searchItems, type Category } from "../../src/items";
import { distanceLabel, itemTaskId, listTasks, sortByDistance } from "../../src/tasks";
import { color, radius, shadow, space, target, type } from "../../src/theme";
import { useApproxArea } from "../../src/useApproxArea";

const SHORT: Record<Category, string> = {
  Education: "Education",
  "Water and sanitation": "Water & sanitation",
  Health: "Health",
  Nutrition: "Nutrition",
  "Child protection": "Protection",
  Climate: "Climate & energy",
};

export default function PickItemScreen() {
  const router = useRouter();
  const { cell } = useApproxArea();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | null>(null);

  const nearby = useMemo(
    () => sortByDistance(listTasks(), cell).filter((t) => distanceLabel(cell, t) !== "Far from you").slice(0, 2),
    [cell],
  );
  const groups = useMemo(
    () => itemsByCategory(searchItems(query)).filter((g) => !category || g.category === category),
    [query, category],
  );

  const start = (id: string) => router.push({ pathname: "/report/intro", params: { id } });

  return (
    <Screen>
      <BackLink label="Back" onPress={() => router.back()} />
      <ScreenTitle hint="Choose a category to get started. You can finish without signal.">
        What would you like to report?
      </ScreenTitle>

      <View style={styles.search}>
        <Icon name="search" size={18} color={color.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search for an item or topic"
          placeholderTextColor={color.muted}
          style={styles.searchInput}
          accessibilityLabel="Search what to report"
        />
      </View>

      {!query ? (
        <View style={styles.grid}>
          {CATEGORIES.map((c) => {
            const active = category === c;
            return (
              <Pressable
                key={c}
                onPress={() => {
                  void tap();
                  setCategory(active ? null : c);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${c}${active ? ", selected. Tap to show all." : ""}`}
                style={({ pressed }) => [styles.tile, active && styles.tileActive, pressed && styles.pressed]}
              >
                <CategoryBadge category={c} size={48} />
                <Text style={styles.tileText} numberOfLines={2}>
                  {SHORT[c]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {nearby.length > 0 && !query && !category ? (
        <View style={styles.group}>
          <SectionLabel>Assigned near you</SectionLabel>
          {nearby.map((t) => (
            <Option
              key={t.id}
              category={t.category}
              title={t.title}
              meta={`${t.area} · ${distanceLabel(cell, t) ?? ""}`}
              onPress={() => start(t.id)}
            />
          ))}
        </View>
      ) : null}

      {groups.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing matches “{query}”</Text>
          <Text style={styles.emptyBody}>Try a simpler word, like “water” or “school”.</Text>
        </View>
      ) : (
        groups.map((g) => (
          <View key={g.category} style={styles.group}>
            <SectionLabel>{g.category}</SectionLabel>
            {g.items.map((item) => (
              <Option
                key={item.id}
                category={item.category}
                title={item.name}
                meta={`${item.photos.length} photos · about ${item.minutes} min`}
                onPress={() => start(itemTaskId(item.id))}
              />
            ))}
          </View>
        ))
      )}
    </Screen>
  );
}

function Option({
  category,
  title,
  meta,
  onPress,
}: {
  category: Category;
  title: string;
  meta: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${meta}`}
      style={({ pressed }) => [styles.option, pressed && styles.pressed]}
    >
      <CategoryBadge category={category} size={40} />
      <View style={styles.optionText}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionMeta}>{meta}</Text>
      </View>
      <Icon name="chevron" size={18} color={color.faint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: target.min + space.xs,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  searchInput: { flex: 1, ...type.body, color: color.text },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  tile: {
    width: "31.5%",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.md,
    paddingHorizontal: space.xs,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.border,
    backgroundColor: color.surface,
    ...shadow.card,
  },
  tileActive: { borderColor: color.primary, backgroundColor: color.primarySoft },
  tileText: { ...type.meta, color: color.text, fontWeight: "700", textAlign: "center" },
  group: { gap: space.sm },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: target.min + space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  optionText: { flex: 1, gap: 2 },
  optionTitle: { ...type.body, color: color.text, fontWeight: "600" },
  optionMeta: { ...type.meta, color: color.muted },
  empty: { alignItems: "center", gap: space.sm, paddingVertical: space.xl },
  emptyTitle: { ...type.title, color: color.text },
  emptyBody: { ...type.body, color: color.muted, textAlign: "center" },
});
