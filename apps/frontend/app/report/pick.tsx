// report/pick.tsx: "What are you reporting?" — nearest programme assignments first, then every
// catalog item by programme area with search. Picking an item starts a self-started report located
// by the phone, so no place is hardcoded for it.

import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Icon } from "../../src/components/icons/Icon";
import { BackLink, Screen, ScreenTitle, SectionLabel } from "../../src/components/ui";
import { itemsByCategory, searchItems } from "../../src/items";
import { categoryAccent, distanceLabel, itemTaskId, listTasks, sortByDistance } from "../../src/tasks";
import { color, radius, space, target, type } from "../../src/theme";
import { useApproxArea } from "../../src/useApproxArea";

export default function PickItemScreen() {
  const router = useRouter();
  const { cell } = useApproxArea();
  const [query, setQuery] = useState("");

  const nearby = useMemo(
    () => sortByDistance(listTasks(), cell).filter((t) => distanceLabel(cell, t) !== "Far from you").slice(0, 2),
    [cell],
  );
  const groups = useMemo(() => itemsByCategory(searchItems(query)), [query]);

  const start = (id: string) => router.push({ pathname: "/report/intro", params: { id } });

  return (
    <Screen>
      <BackLink label="Back" onPress={() => router.back()} />
      <ScreenTitle hint="Pick what you are standing in front of. You can finish without signal.">
        What are you reporting?
      </ScreenTitle>

      <View style={styles.search}>
        <Icon name="search" size={18} color={color.faint} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search: pump, toilets, fridge..."
          placeholderTextColor={color.faint}
          style={styles.searchInput}
          accessibilityLabel="Search what to report"
        />
      </View>

      {nearby.length > 0 && !query ? (
        <View style={styles.group}>
          <SectionLabel>Assigned near you</SectionLabel>
          {nearby.map((t) => (
            <Option
              key={t.id}
              accent={color[categoryAccent[t.category]]}
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
                accent={color[categoryAccent[item.category]]}
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

function Option({ accent, title, meta, onPress }: { accent: string; title: string; meta: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${meta}`}
      style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
    >
      <View style={[styles.accent, { backgroundColor: accent }]} />
      <View style={styles.optionText}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionMeta}>{meta}</Text>
      </View>
      <Icon name="chevron" size={18} color={color.faint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  optionPressed: { backgroundColor: color.primarySoft },
  accent: { width: 4, alignSelf: "stretch", borderRadius: radius.pill },
  optionText: { flex: 1, gap: 2 },
  optionTitle: { ...type.body, color: color.text, fontWeight: "600" },
  optionMeta: { ...type.meta, color: color.muted },
  empty: { alignItems: "center", gap: space.sm, paddingVertical: space.xl },
  emptyTitle: { ...type.title, color: color.text },
  emptyBody: { ...type.body, color: color.muted, textAlign: "center" },
});
