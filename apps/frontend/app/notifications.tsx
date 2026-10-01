// notifications.tsx: which local notices this phone shows, opened from Me. Every notice is worked out
// on the phone and shown by the phone: no server or push service learns who to notify.

import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ToggleRow } from "../src/components/ToggleRow";
import { BackLink, Screen, ScreenTitle } from "../src/components/ui";
import { registerBackgroundNotices } from "../src/background-notices";
import { DEFAULT_PREFS, loadNoticePrefs, setNoticePref, type NoticePrefs } from "../src/local-notices";
import { color, space, type } from "../src/theme";

export default function NotificationsScreen() {
  const router = useRouter();
  const [prefs, setPrefs] = useState<NoticePrefs>(DEFAULT_PREFS);

  useFocusEffect(
    useCallback(() => {
      void loadNoticePrefs().then(setPrefs);
    }, []),
  );

  const toggle = (key: keyof NoticePrefs, value: boolean) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    // After the switch is stored, keep the background run in line with what is on.
    setTimeout(() => void registerBackgroundNotices(), 0);
    return value;
  };

  return (
    <Screen>
      <BackLink label="Me" onPress={() => router.back()} />
      <ScreenTitle>Notifications</ScreenTitle>
      <Text style={styles.note}>
        These are worked out only on this phone. No server or notification service learns which
        reports are yours. Your phone's own notification permission still applies.
      </Text>
      <View style={{ gap: space.sm }}>
        <ToggleRow
          icon="map"
          title="Missions near you"
          subtitle="A weekly reminder when there are missions in your area"
          value={prefs.missions}
          onValueChange={(v) => void setNoticePref("missions", toggle("missions", v))}
        />
        <ToggleRow
          icon="community"
          title="Confirmed by the community"
          subtitle="When enough nearby programme members back a report you sent"
          value={prefs.confirmations}
          onValueChange={(v) => void setNoticePref("confirmations", toggle("confirmations", v))}
        />
        <ToggleRow
          icon="photo"
          title="Photo requests"
          subtitle="When the programme team asks for a photo of one of your reports"
          value={prefs.photoRequests}
          onValueChange={(v) => void setNoticePref("photoRequests", toggle("photoRequests", v))}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { ...type.meta, color: color.muted },
});
