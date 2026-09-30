// support.tsx: a native, first-party support destination for reporter next steps. It collects
// nothing itself: it points to Help, the inviting programme team, and the Prufture team's WhatsApp
// and email (opened in their own apps) plus the public support page (opened in-app).

import { useRouter } from "expo-router";
import { Linking, StyleSheet, Text, View } from "react-native";
import { openInApp, siteUrl } from "../src/links";
import { SUPPORT_EMAIL, SUPPORT_WHATSAPP, mailtoUrl, whatsappUrl } from "../src/support-contact";
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
        <Text style={styles.body}>
          For a problem with the app itself, message us on WhatsApp or send an email. Say which screen you were on and
          what you expected to happen.
        </Text>
        <SecondaryButton label="WhatsApp" icon="community" onPress={() => void openExternal(whatsappUrl())} />
        <SecondaryButton label="Email" icon="info" onPress={() => void openExternal(mailtoUrl())} />
        <Text style={styles.contact} selectable>
          {SUPPORT_WHATSAPP} · {SUPPORT_EMAIL}
        </Text>
        <SecondaryButton label="Support page" icon="help" onPress={() => void openInApp(siteUrl("support"))} />
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

// WhatsApp and mail compose belong to their own apps; the address stays visible (and selectable) if
// neither app is installed.
async function openExternal(url: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    // No handler for this link on this phone; the contact is shown as text below.
  }
}

const styles = StyleSheet.create({
  title: { ...type.subtitle, color: color.text },
  body: { ...type.body, color: color.muted },
  contact: { ...type.meta, color: color.text },
  privacyLink: { gap: space.sm },
});
