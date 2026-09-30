// support.tsx: a native, first-party support destination for reporter next steps. It does not
// collect a message, identity or report detail; contact remains through the inviting programme team.

import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { openInApp, siteUrl } from "../src/links";
import { BackLink, Card, Notice, Screen, ScreenTitle, SecondaryButton } from "../src/components/ui";
import { color, space, type } from "../src/theme";

export default function SupportScreen() {
  const router = useRouter();
  return (
    <Screen>
      <BackLink label="Me" onPress={() => router.back()} />
      <ScreenTitle hint="Clear next steps when something does not go as planned.">Contact support</ScreenTitle>

      <Card>
        <Text style={styles.title}>Start with Help</Text>
        <Text style={styles.body}>
          Find step-by-step guidance for reporting, safe photos, offline use and reports that are waiting to send.
        </Text>
        <SecondaryButton label="Open Help" icon="help" onPress={() => router.push("/help")} />
      </Card>

      <Card>
        <Text style={styles.title}>Contact your programme team</Text>
        <Text style={styles.body}>
          If Help does not resolve the issue, contact the organisation or programme focal point that invited you to Prufture. They can help with the task or local programme process.
        </Text>
      </Card>

      <Card>
        <Text style={styles.title}>Contact the Prufture team</Text>
        <Text style={styles.body}>For a problem with the app itself, our support page lists how to reach us.</Text>
        <SecondaryButton label="Open support page" icon="community" onPress={() => void openInApp(siteUrl("support"))} />
      </Card>

      <Notice tone="info" icon="privacy">
        Do not send photos of people, names, identity documents, exact locations or report references when asking for help.
      </Notice>

      <View style={styles.privacyLink}>
        <Text style={styles.body}>Questions about what a report keeps or shares?</Text>
        <SecondaryButton label="Data and privacy" icon="privacy" onPress={() => router.push("/data-privacy")} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...type.subtitle, color: color.text },
  body: { ...type.body, color: color.muted },
  privacyLink: { gap: space.sm },
});
