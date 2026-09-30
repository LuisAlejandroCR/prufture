// face-check.tsx: the optional one-time live-person check (EXPO_PUBLIC_LIVENESS_PROVIDER=aws), opened
// from Me. AWS runs the capture; this screen only shows the outcome and keeps a passed ticket on the
// phone. Every outcome leaves reporting open: nothing here gates a report.

import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { configureLiveness, livenessModuleAvailable, startLivenessCapture } from "../modules/prufture-liveness";
import { announce, note } from "../src/announce";
import { BackLink, Notice, PrimaryButton, Screen, ScreenTitle, SecondaryButton } from "../src/components/ui";
import {
  loadLivenessPass,
  outcomeCopy,
  passUntilLabel,
  runFaceLiveness,
  saveLivenessPass,
  type FaceLivenessOutcome,
  type LivenessCapture,
} from "../src/face-liveness";
import { success, warn } from "../src/feedback";
import { faceLivenessConfig, livenessProvider } from "../src/flags";
import { color, space, type } from "../src/theme";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8787";

const capture: LivenessCapture = {
  available: livenessModuleAvailable,
  configure: configureLiveness,
  start: startLivenessCapture,
};

export default function FaceCheckScreen() {
  const router = useRouter();
  const [passUntil, setPassUntil] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<FaceLivenessOutcome | null>(null);

  useFocusEffect(
    useCallback(() => {
      void loadLivenessPass().then((p) => setPassUntil(p?.usableUntil ?? null));
    }, []),
  );

  async function start() {
    setBusy(true);
    setOutcome(null);
    const out = await runFaceLiveness({
      provider: livenessProvider(),
      config: faceLivenessConfig(),
      capture: livenessModuleAvailable() ? capture : null,
      apiUrl: API_URL,
    });
    if (out.state === "passed" && (await saveLivenessPass(out.ticket))) {
      const p = await loadLivenessPass();
      setPassUntil(p?.usableUntil ?? null);
      void success();
    } else if (out.state !== "passed") {
      void warn();
    }
    const copy = outcomeCopy(out);
    void announce(note(`${copy.title}. ${copy.body}`));
    setOutcome(out);
    setBusy(false);
  }

  const copy = outcome ? outcomeCopy(outcome) : null;
  const footer = copy ? (
    <View style={styles.footer}>
      {copy.retry ? <PrimaryButton label="Try again" onPress={start} busy={busy} /> : null}
      <SecondaryButton label="Done" onPress={() => router.back()} />
    </View>
  ) : (
    <View style={styles.footer}>
      <PrimaryButton label={passUntil ? "Check again" : "Start face check"} onPress={start} busy={busy} />
      <SecondaryButton label="Not now" onPress={() => router.back()} />
    </View>
  );

  return (
    <Screen footer={footer}>
      <BackLink label="Me" onPress={() => router.back()} />
      <ScreenTitle hint="Optional. Once, not for every report.">Face check</ScreenTitle>

      {copy ? (
        <Notice tone={copy.tone} icon={copy.tone === "success" ? "check" : copy.tone === "warning" ? "warning" : "info"}>
          {`${copy.title}. ${copy.body}`}
        </Notice>
      ) : passUntil ? (
        <Notice tone="success" icon="check">
          {`Done. Your reports show "verified person: yes" until ${passUntilLabel(passUntil)}.`}
        </Notice>
      ) : null}

      <View style={styles.body}>
        <Text style={styles.text}>
          This check asks one question: is a live person holding the phone? It does not identify you
          or match your face against anyone.
        </Text>
        <Text style={styles.text}>
          It is processed by Amazon Web Services (AWS). A short video of your face goes from this phone
          to AWS, and Prufture keeps only whether a live person was there. No image of your face is
          stored by Prufture or returned to this phone.
        </Text>
        <Text style={styles.text}>
          You never need it to send a report. Skipping it only means your reports do not show
          "verified person".
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
  text: { ...type.body, color: color.text },
  footer: { gap: space.sm },
});
