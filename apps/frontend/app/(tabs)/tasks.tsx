// (tabs)/tasks.tsx: find a task without scanning a portal — nearest assignments first, category
// filter, List/Map toggle (cells, never exact points) and a way into the full item catalog.
// Works from the cached catalog when offline; the map falls back to text without signal.

import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Icon } from "../../src/components/icons/Icon";
import { CellMap, type MapCell } from "../../src/components/CellMap";
import { Card, Screen, ScreenTitle } from "../../src/components/ui";
import { CATEGORIES } from "../../src/items";
import { categoryAccent, distanceLabel, listTasks, sortByDistance, type Category } from "../../src/tasks";
import { color, radius, space, target, type } from "../../src/theme";
import { useApproxArea } from "../../src/useApproxArea";

export default function TasksScreen() {
  const router = useRouter();
  const { cell, name } = useApproxArea();
  const all = useMemo(() => sortByDistance(listTasks(), cell), [cell]);
  const [category, setCategory] = useState<Category | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"list" | "map">("list");

  const showSearch = all.length >= 6;

  const tasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter(
      (t) =>
        (!category || t.category === category) &&
        (!q || t.title.toLowerCase().includes(q) || t.area.toLowerCase().includes(q)),
    );
  }, [all, category, query]);

  const open = (id: string) => router.push({ pathname: "/task/[id]", params: { id } });
  const mapCells: MapCell[] = [
    ...(cell ? [{ key: "me", cell, tone: "self" as const }] : []),
    ...tasks.map((t) => ({
      key: t.id,
      cell: t.cell,
      title: t.title,
      subtitle: t.area,
      tone: "task" as const,
      onPress: () => open(t.id),
    })),
  ];

  return (
    <Screen>
      <ScreenTitle
        hint={`${tasks.length} ${tasks.length === 1 ? "task" : "tasks"} assigned${name ? ` · you are near ${name}` : ""}`}
      >
        Tasks
      </ScreenTitle>

      <View style={styles.toggle} accessibilityRole="tablist">
        {(["list", "map"] as const).map((v) => (
          <Pressable
            key={v}
            onPress={() => setView(v)}
            accessibilityRole="tab"
            accessibilityState={{ selected: view === v }}
            style={[styles.toggleItem, view === v && styles.toggleItemActive]}
          >
            <Text style={[styles.toggleText, view === v && styles.toggleTextActive]}>
              {v === "list" ? "List" : "Map"}
            </Text>
          </Pressable>
        ))}
      </View>

      {showSearch ? (
        <View style={styles.search}>
          <Icon name="search" size={18} color={color.faint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search tasks"
            placeholderTextColor={color.faint}
            style={styles.searchInput}
            accessibilityLabel="Search tasks"
          />
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        <FilterChip label="All" active={category === null} onPress={() => setCategory(null)} />
        {CATEGORIES.map((c) => (
          <FilterChip key={c} label={c} active={category === c} onPress={() => setCategory(c)} />
        ))}
      </ScrollView>

      {view === "map" ? (
        <CellMap
          cells={mapCells}
          height={320}
          offlineLabel="The map needs signal. Your tasks are still listed below and work offline."
        />
      ) : null}

      <Card onPress={() => router.push("/report/pick")} accessibilityLabel="Report something else. Choose from water points, schools, clinics and more.">
        <View style={styles.tag}>
          <Icon name="report" size={16} color={color.primary} />
          <Text style={[styles.tagText, { color: color.primary }]}>Not on the list?</Text>
        </View>
        <Text style={styles.title}>Report something else near you</Text>
        <Text style={styles.need}>Water points, toilets, classrooms, vaccine fridges and more.</Text>
      </Card>

      {tasks.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="tasks" size={32} color={color.faint} />
          <Text style={styles.emptyTitle}>No tasks match this filter</Text>
          <Text style={styles.emptyBody}>Try another category, or check back later.</Text>
        </View>
      ) : (
        tasks.map((t) => (
          <Card
            key={t.id}
            onPress={() => open(t.id)}
            accessibilityLabel={`${t.category}. ${t.title}. ${t.area}. ${t.progressLabel ?? ""}`}
          >
            <View style={styles.tag}>
              <View style={[styles.dot, { backgroundColor: color[categoryAccent[t.category]] }]} />
              <Text style={styles.tagText}>{t.category}</Text>
            </View>
            <Text style={styles.title}>{t.title}</Text>
            <View style={styles.metaRow}>
              <Icon name="location" size={15} color={color.faint} />
              <Text style={styles.meta}>
                {distanceLabel(cell, t) ? `${t.area} · ${distanceLabel(cell, t)}` : t.area}
              </Text>
              <Icon name="clock" size={15} color={color.faint} />
              <Text style={styles.meta}>About {t.minutes} min</Text>
            </View>
            <Text style={styles.need}>
              {t.photos.length} photos, {t.questions.length}{" "}
              {t.questions.length === 1 ? "question" : "questions"}
            </Text>
            {t.progressLabel ? <Text style={styles.progress}>{t.progressLabel}</Text> : null}
          </Card>
        ))
      )}
    </Screen>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`Filter by ${label}`}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toggle: {
    flexDirection: "row",
    padding: space.xs,
    gap: space.xs,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceSoft,
  },
  toggleItem: {
    flex: 1,
    minHeight: target.min - space.sm,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  toggleItemActive: { backgroundColor: color.surface },
  toggleText: { ...type.meta, color: color.muted, fontWeight: "600" },
  toggleTextActive: { color: color.text, fontWeight: "700" },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: target.min,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  searchInput: { flex: 1, ...type.body, color: color.text },
  filters: { gap: space.sm, paddingRight: space.lg },
  chip: {
    minHeight: target.min,
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  chipActive: { backgroundColor: color.primarySoft, borderColor: color.primary },
  chipText: { ...type.meta, color: color.muted, fontWeight: "600" },
  chipTextActive: { color: color.primary, fontWeight: "700" },
  tag: { flexDirection: "row", alignItems: "center", gap: space.xs },
  dot: { width: 8, height: 8, borderRadius: radius.pill },
  tagText: { ...type.meta, color: color.muted, fontWeight: "700" },
  title: { ...type.title, color: color.text },
  metaRow: { flexDirection: "row", alignItems: "center", gap: space.xs, flexWrap: "wrap" },
  meta: { ...type.meta, color: color.muted, marginRight: space.sm },
  need: { ...type.meta, color: color.muted },
  progress: { ...type.meta, color: color.primary, fontWeight: "700" },
  empty: { alignItems: "center", gap: space.sm, paddingVertical: space.xxl },
  emptyTitle: { ...type.title, color: color.text },
  emptyBody: { ...type.body, color: color.muted, textAlign: "center" },
});
