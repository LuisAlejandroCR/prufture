// accessibility.tsx: the two feedback switches (haptics, celebrations and motion), opened from Me.
// Text size is not a setting here: it follows the phone's own Dynamic Type.

import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ToggleRow } from "../src/components/ToggleRow";
import { BackLink, Screen, ScreenTitle } from "../src/components/ui";
import {
  hydrateFeedbackSettings,
  isCelebrationsEnabled,
  isHapticsEnabled,
  setCelebrationsEnabled,
  setHapticsEnabled,
} from "../src/feedback";
import { color, space, type } from "../src/theme";

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

const styles = StyleSheet.create({
  note: { ...type.meta, color: color.muted },
});
