// accessibility.tsx: the two feedback switches (haptics, celebrations and motion), opened from Me.
// Text size is not a setting here: it follows the phone's own Dynamic Type.

import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { Icon, type IconName } from "../src/components/icons/Icon";
import { BackLink, Screen, ScreenTitle } from "../src/components/ui";
import {
  hydrateFeedbackSettings,
  isCelebrationsEnabled,
  isHapticsEnabled,
  setCelebrationsEnabled,
  setHapticsEnabled,
} from "../src/feedback";
import { color, radius, space, target, type } from "../src/theme";

export default function AccessibilityScreen() {
  const router = useRouter();
  const [haptics, setHaptics] = useState(true);
  const [celebrations, setCelebrations] = useState(true);

  useFocusEffect(
    useCallback(() => {
      void hydrateFeedbackSettings().then(() => {
        setHaptics(isHapticsEnabled());
        setCelebrations(isCelebrationsEnabled());
      });
    }, []),
  );

  return (
    <Screen>
      <BackLink label="Me" onPress={() => router.back()} />
      <ScreenTitle>Accessibility</ScreenTitle>
      <Text style={styles.note}>Text size follows your phone settings.</Text>
      <View style={{ gap: space.sm }}>
        <ToggleRow
          icon="accessibility"
          title="Haptics"
          subtitle="A short vibration on key actions"
          value={haptics}
          onValueChange={(v) => {
            setHaptics(v);
            void setHapticsEnabled(v);
          }}
        />
        <ToggleRow
          icon="review"
          title="Celebrations and motion"
          subtitle="Confetti and animations. Off also follows your phone reduce motion setting."
          value={celebrations}
          onValueChange={(v) => {
            setCelebrations(v);
            void setCelebrationsEnabled(v);
          }}
        />
      </View>
    </Screen>
  );
}

function ToggleRow({
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
  note: { ...type.meta, color: color.muted },
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
