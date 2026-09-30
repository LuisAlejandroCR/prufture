// paywall.tsx: coordinator subscription screen, reachable only from the coordinator review screen —
// never from the reporter capture flow. Shows the two RevenueCat packages via src/purchases.ts with an
// honest degraded state, price per period, Terms and Privacy links (App Store 3.1.2) and Restore.

import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { BackLink, Card, Notice, PrimaryButton, Screen, ScreenTitle } from "../src/components/ui";
import {
  TERMS_OF_USE_URL,
  getOfferings,
  purchasePackage,
  restorePurchases,
  presentOfferCodeSheet,
  type Offering,
} from "../src/purchases";
import { color, radius, space, target, type } from "../src/theme";

const PRIVACY_URL =
  (Constants.expoConfig?.extra?.privacyPolicyUrl as string | undefined) || "https://prufture.vercel.app/privacy";

type LoadState =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "ready"; offering: Offering };

export default function PaywallScreen() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [selected, setSelected] = useState<"monthly" | "annual">("annual");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    const result = await getOfferings();
    if (!result.available) {
      setState({ kind: "unavailable" });
      return;
    }
    setState({ kind: "ready", offering: result.data });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pkgFor = (offering: Offering, plan: "monthly" | "annual"): PurchasesPackage | null =>
    plan === "monthly" ? offering.monthly : offering.annual;

  const handlePurchase = async () => {
    if (state.kind !== "ready") return;
    const pkg = pkgFor(state.offering, selected);
    if (!pkg) return;
    setBusy(true);
    setNotice(null);
    const result = await purchasePackage(pkg);
    setBusy(false);
    if (!result.available) {
      setNotice("Something went wrong completing the purchase. Please try again.");
      return;
    }
    if (result.data.entitled) {
      router.replace("/coordinator");
    }
  };

  const handleRestore = async () => {
    setBusy(true);
    setNotice(null);
    const result = await restorePurchases();
    setBusy(false);
    if (!result.available) {
      setNotice("Couldn't restore purchases right now. Please try again later.");
      return;
    }
    if (result.data.entitled) {
      router.replace("/coordinator");
      return;
    }
    setNotice("No active subscription was found for this account.");
  };

  // iOS offer codes (e.g. for reviewers and judges): Apple's sheet redeems them; RevenueCat then
  // reflects the entitlement, which Restore picks up.
  const handleRedeem = async () => {
    setNotice(null);
    const result = await presentOfferCodeSheet();
    setNotice(
      result.available
        ? "After you redeem the code, tap Restore purchases to unlock Coordinator review."
        : "Couldn't open code redemption right now. Please try again later.",
    );
  };

  return (
    <Screen
      footer={
        // Restore and Redeem stay reachable even when plans fail to load: an existing subscriber, or a
        // reviewer with an offer code, must never be stuck behind "Plans aren't available".
        state.kind !== "loading" ? (
          <View style={{ gap: space.sm }}>
            {state.kind === "ready" ? (
              <>
                <PrimaryButton label="Continue" onPress={handlePurchase} busy={busy} />
                <Text style={styles.legal}>
                  Payment is charged to your {Platform.OS === "android" ? "Google Play" : "Apple ID"} account at
                  confirmation. The subscription renews{" "}
                  {selected === "monthly" ? "every month" : "every year"} at the same price unless you
                  cancel at least 24 hours before the period ends. Manage or cancel it in your account
                  settings.
                </Text>
              </>
            ) : null}
            <View style={styles.links}>
              <LegalLink label="Terms of Use" url={TERMS_OF_USE_URL} />
              <Text style={styles.legal}>·</Text>
              <LegalLink label="Privacy Policy" url={PRIVACY_URL} />
            </View>
            <Pressable
              onPress={handleRestore}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Restore purchases"
              style={styles.restore}
            >
              <Text style={styles.restoreText}>Restore purchases</Text>
            </Pressable>
            {Platform.OS === "ios" ? (
              <Pressable
                onPress={handleRedeem}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Redeem an offer code"
                style={styles.restore}
              >
                <Text style={styles.restoreText}>Redeem offer code</Text>
              </Pressable>
            ) : null}
          </View>
        ) : undefined
      }
    >
      <BackLink label="Back" onPress={() => router.back()} />
      <ScreenTitle hint="Support the programme's coordination tools for your team.">
        Coordinator plan
      </ScreenTitle>

      {notice ? <Notice tone="info">{notice}</Notice> : null}

      {state.kind === "loading" ? (
        <View style={styles.loading}>
          <ActivityIndicator color={color.primary} />
        </View>
      ) : state.kind === "unavailable" ? (
        <Notice tone="warning">Plans aren't available right now. Try again later.</Notice>
      ) : (
        <View style={{ gap: space.md }}>
          {state.offering.monthly ? (
            <PlanOption
              plan="monthly"
              pkg={state.offering.monthly}
              selected={selected === "monthly"}
              onSelect={() => setSelected("monthly")}
            />
          ) : null}
          {state.offering.annual ? (
            <PlanOption
              plan="annual"
              pkg={state.offering.annual}
              selected={selected === "annual"}
              onSelect={() => setSelected("annual")}
            />
          ) : null}
          <Card>
            <Text style={styles.fundsTitle}>What the plan includes</Text>
            <Text style={styles.fundsBody}>
              Coordinator review: every report your programme received, an accepted or rejected
              verdict on each, and a summary you can email. Reporting stays free for everyone.
            </Text>
          </Card>
        </View>
      )}
    </Screen>
  );
}

function LegalLink({ label, url }: { label: string; url: string }) {
  return (
    <Pressable
      onPress={() => Linking.openURL(url).catch(() => undefined)}
      accessibilityRole="link"
      accessibilityLabel={label}
      hitSlop={8}
    >
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}

function PlanOption({
  plan,
  pkg,
  selected,
  onSelect,
}: {
  plan: "monthly" | "annual";
  pkg: PurchasesPackage;
  selected: boolean;
  onSelect: () => void;
}) {
  const label = plan === "monthly" ? "Monthly" : "Annual";
  const price = `${pkg.product.priceString} / ${plan === "monthly" ? "month" : "year"}`;
  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label} plan, ${price}`}
      style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.pressed]}
    >
      <View style={styles.optionRadio}>
        {selected ? <View style={styles.optionRadioFill} /> : null}
      </View>
      <View style={styles.flex}>
        <Text style={styles.optionLabel}>{label}</Text>
        <Text style={styles.optionPrice}>{price}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.8 },
  loading: { paddingVertical: space.xxl, alignItems: "center" },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    minHeight: target.min,
  },
  optionSelected: {
    borderColor: color.primary,
    backgroundColor: color.primarySoft,
  },
  optionRadio: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: color.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  optionRadioFill: {
    width: 12,
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: color.primary,
  },
  optionLabel: { ...type.subtitle, color: color.text },
  optionPrice: { ...type.body, color: color.muted },
  fundsTitle: { ...type.subtitle, color: color.text, marginBottom: space.xs },
  fundsBody: { ...type.body, color: color.muted },
  legal: { ...type.meta, color: color.muted, textAlign: "center" },
  links: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: space.sm },
  link: { ...type.meta, color: color.primary, fontWeight: "700", textDecorationLine: "underline" },
  restore: {
    minHeight: target.min,
    alignItems: "center",
    justifyContent: "center",
  },
  restoreText: { ...type.action, color: color.primary },
});
