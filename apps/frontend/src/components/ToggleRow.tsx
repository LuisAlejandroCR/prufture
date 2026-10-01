// ToggleRow.tsx: one labelled switch in a card row (icon, title, one-line explanation). Shared by the
// Accessibility and Notifications settings screens. The switch carries the title as its VoiceOver label.

import { StyleSheet, Switch, Text, View } from "react-native";
import { color, radius, space, target, type } from "../theme";
import { Icon, type IconName } from "./icons/Icon";

export function ToggleRow({
  icon,
  title,
  subtitle,
  value,
  onValueChange,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.icon}>
        <Icon name={icon} size={20} color={color.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        accessibilityLabel={title}
        trackColor={{ false: color.border, true: color.primary }}
        thumbColor={color.surface}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    minHeight: target.min + 12,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { ...type.subtitle, color: color.text },
  sub: { ...type.meta, color: color.muted },
});
