// paywall.tsx: coordinator subscription screen. Reachable only from a coordinator surface
// (programme/admin navigation) — never linked from the reporter capture flow. Shows the
// two RevenueCat packages via src/purchases.ts (never imports the vendor SDK directly),
// with an honest degraded state, legal recurring-price copy, and a Restore action.

import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { BackLink, Card, Notice, PrimaryButton, Screen, ScreenTitle } from "../src/components/ui";
import { getOfferings, purchasePackage, restorePurchases, type Offering } from "../src/purchases";
import { color, radius, space, target, type } from "../src/theme";

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
      router.back();
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
    setNotice(
      result.data.entitled
        ? "Your subscription was restored."
        : "No active subscription was found for this account.",
    );
  };

  return (
    <Screen
      footer={
        state.kind === "ready" ? (
          <View style={{ gap: space.sm }}>
            <PrimaryButton label="Continue" onPress={handlePurchase} busy={busy} />
            <Text style={styles.legal}>
              Renews {selected === "monthly" ? "monthly" : "annually"} until cancelled. Cancel
              anytime in the App Store / Play Store.
            </Text>
            <Pressable
              onPress={handleRestore}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Restore purchases"
              style={styles.restore}
            >
              <Text style={styles.restoreText}>Restore purchases</Text>
            </Pressable>
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
            <Text style={styles.fundsTitle}>What this funds</Text>
            <Text style={styles.fundsBody}>
              A coordinator subscription unlocks programme dashboards, task assignment, and
              cross-team reporting tools for your organization.
            </Text>
          </Card>
        </View>
      )}
    </Screen>
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
  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label} plan, ${pkg.product.priceString}`}
      style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.pressed]}
    >
      <View style={styles.optionRadio}>
        {selected ? <View style={styles.optionRadioFill} /> : null}
      </View>
      <View style={styles.flex}>
        <Text style={styles.optionLabel}>{label}</Text>
        <Text style={styles.optionPrice}>{pkg.product.priceString}</Text>
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
  restore: {
    minHeight: target.min,
    alignItems: "center",
    justifyContent: "center",
  },
  restoreText: { ...type.action, color: color.primary },
});
