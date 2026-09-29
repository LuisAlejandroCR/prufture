// (tabs)/_layout.tsx: the reporter destinations (Missions, [Report], My reports, Me) with a custom
// bottom bar. Report is a raised terracotta control that opens the item picker, not a normal tab;
// selected icons are filled on a tinted pill, and every control has a label.

import { Tabs, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "../../src/components/icons/Icon";
import { color, navSelectedTint, radius, space, target, type } from "../../src/theme";
import { select } from "../../src/feedback";

const ITEMS: { name: string; label: string; icon: IconName }[] = [
  { name: "index", label: "Missions", icon: "home" },
  { name: "updates", label: "My reports", icon: "review" },
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

  const renderItem = (item: { name: string; label: string; icon: IconName }) => {
    const focused = activeRoute === item.name;
    return (
      <Pressable
        key={item.name}
        onPress={() => {
          if (!focused) void select();
          navigation.navigate(item.name);
        }}
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

  const [first, ...rest] = ITEMS;

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + space.sm }]}>
      {first ? renderItem(first) : null}

      <Pressable
        onPress={() => router.push("/report/pick")}
        accessibilityRole="button"
        accessibilityLabel="Start a report"
        accessibilityHint="Choose what you are reporting, then follow the guided steps"
        style={({ pressed }) => [styles.item, pressed && styles.reportPressed]}
      >
        <View style={styles.iconWrap}>
          <View style={styles.reportDot}>
            <Text style={styles.plus}>+</Text>
          </View>
        </View>
        <Text style={styles.label}>Report</Text>
      </Pressable>

      {rest.map(renderItem)}
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
  reportPressed: { opacity: 0.7 },
  reportDot: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: color.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  plus: { fontSize: 20, lineHeight: 22, fontWeight: "700", color: color.onPrimary },
});
