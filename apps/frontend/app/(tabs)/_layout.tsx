// (tabs)/_layout.tsx: the five reporter destinations with a custom bottom bar.
// Home, Tasks, [Report], Updates, Me. Report is a raised terracotta control that
// opens the guided flow, not a normal tab. Selected icons are filled and sit on a
// soft tinted pill; unselected icons are outlined. Every control has a label.

import { Tabs, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "../../src/components/icons/Icon";
import { recommendedTask } from "../../src/tasks";
import { color, navSelectedTint, radius, shadow, space, target, type } from "../../src/theme";

const ITEMS: { name: string; label: string; icon: IconName }[] = [
  { name: "index", label: "Home", icon: "home" },
  { name: "tasks", label: "Tasks", icon: "tasks" },
  { name: "updates", label: "Updates", icon: "updates" },
  { name: "me", label: "Me", icon: "profile" },
];

interface TabBarShape {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void };
}

function TabBar({ state, navigation }: TabBarShape) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const activeRoute = state.routes[state.index]?.name;

  const left = ITEMS.slice(0, 2);
  const right = ITEMS.slice(2);

  const renderItem = (item: { name: string; label: string; icon: IconName }) => {
    const focused = activeRoute === item.name;
    return (
      <Pressable
        key={item.name}
        onPress={() => navigation.navigate(item.name)}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={item.label}
        style={styles.item}
      >
        <View style={[styles.iconWrap, focused && { backgroundColor: navSelectedTint }]}>
          <Icon
            name={item.icon}
            size={24}
            filled={focused}
            color={focused ? color.primary : color.faint}
          />
        </View>
        <Text style={[styles.label, focused && styles.labelActive]}>{item.label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + space.sm }]}>
      {left.map(renderItem)}

      <Pressable
        onPress={() => router.push({ pathname: "/report/intro", params: { id: recommendedTask().id } })}
        accessibilityRole="button"
        accessibilityLabel="Start a report"
        accessibilityHint="Opens the guided report for your recommended task"
        style={({ pressed }) => [styles.report, pressed && styles.reportPressed]}
      >
        <Icon name="report" size={28} filled color={color.onPrimary} />
        <Text style={styles.reportLabel}>Report</Text>
      </Pressable>

      {right.map(renderItem)}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...(props as unknown as TabBarShape)} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="tasks" />
      <Tabs.Screen name="updates" />
      <Tabs.Screen name="me" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-around",
    backgroundColor: color.surface,
    borderTopWidth: 1,
    borderTopColor: color.border,
    paddingTop: space.sm,
    paddingHorizontal: space.sm,
  },
  item: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    minHeight: target.min,
    paddingTop: space.xs,
  },
  iconWrap: {
    width: 52,
    height: 30,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { ...type.meta, fontSize: 11, color: color.faint },
  labelActive: { color: color.primary, fontWeight: "700" },
  report: {
    width: 60,
    marginTop: -18,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderRadius: radius.lg,
    backgroundColor: color.primary,
    paddingVertical: space.sm,
    ...shadow.raised,
  },
  reportPressed: { backgroundColor: color.primaryPressed },
  reportLabel: { ...type.meta, fontSize: 11, fontWeight: "700", color: color.onPrimary },
});
