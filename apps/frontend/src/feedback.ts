// feedback.ts: the single haptics + celebration-gating module for the report flow.
// Wraps expo-haptics (loaded lazily so unit tests and haptic-less devices never
// break), exposes tap/bump/thud/success/warn, a persisted hapticsEnabled flag, a
// reduce-motion-aware celebrationsAllowed(), and the moment timing constants.
// Distinct from src/theme.ts (visual tokens) and the report screens (composition).
//
// reduceMotionOn() lazy-loads the AccessibilityInfo SUBMODULE, never `import("react-native")`:
// the barrel form makes Metro asyncRequire + metroImportAll enumerate every react-native
// export, which fires the deprecated PushNotificationIOS getter and crashes Expo Go with an
// Invariant Violation. Importing the one submodule keeps this file Node-loadable for tests.

/** How long each guided "moment" holds before the actions settle in. */
export const MOMENT_SAVED_MS = 2000;
export const MOMENT_SENT_MS = 2500;
export const MOMENT_IDENTITY_MS = 1500;

const KEY_HAPTICS = "prufture.feedback.haptics";
const KEY_CELEBRATIONS = "prufture.feedback.celebrations";

let hapticsEnabled = true;
let celebrationsEnabled = true;
let hydrated = false;

type HapticsModule = typeof import("expo-haptics");
type StoreModule = typeof import("expo-secure-store");

let hapticsMod: HapticsModule | null | undefined;
let hapticsOverride: Partial<HapticsModule> | null = null;

async function loadHaptics(): Promise<Partial<HapticsModule> | null> {
  if (hapticsOverride) return hapticsOverride;
  if (hapticsMod !== undefined) return hapticsMod;
  try {
    hapticsMod = await import("expo-haptics");
  } catch {
    hapticsMod = null;
  }
  return hapticsMod;
}

async function loadStore(): Promise<StoreModule | null> {
  try {
    return await import("expo-secure-store");
  } catch {
    return null;
  }
}

/**
 * Read the persisted toggles once. Safe to call repeatedly and from anywhere;
 * a missing or throwing secure store just leaves the defaults (both on).
 */
export async function hydrateFeedbackSettings(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  const store = await loadStore();
  if (!store) return;
  try {
    const h = await store.getItemAsync(KEY_HAPTICS);
    if (h != null) hapticsEnabled = h !== "0";
    const c = await store.getItemAsync(KEY_CELEBRATIONS);
    if (c != null) celebrationsEnabled = c !== "0";
  } catch {
    // Keep defaults.
  }
}

export function isHapticsEnabled(): boolean {
  return hapticsEnabled;
}

export function isCelebrationsEnabled(): boolean {
  return celebrationsEnabled;
}

export async function setHapticsEnabled(value: boolean): Promise<void> {
  hapticsEnabled = value;
  const store = await loadStore();
  try {
    await store?.setItemAsync(KEY_HAPTICS, value ? "1" : "0");
  } catch {
    // Non-fatal: the in-memory flag still applies this session.
  }
}

export async function setCelebrationsEnabled(value: boolean): Promise<void> {
  celebrationsEnabled = value;
  const store = await loadStore();
  try {
    await store?.setItemAsync(KEY_CELEBRATIONS, value ? "1" : "0");
  } catch {
    // Non-fatal.
  }
}

let reduceMotionOverride: (() => boolean | Promise<boolean>) | null = null;

async function reduceMotionOn(): Promise<boolean> {
  if (reduceMotionOverride) return reduceMotionOverride();
  try {
    // Submodule path only — NOT `import("react-native")` (see the file header).
    type ReduceMotion = { isReduceMotionEnabled(): Promise<boolean> };
    const mod = (await import(
      "react-native/Libraries/Components/AccessibilityInfo/AccessibilityInfo"
    )) as unknown as { AccessibilityInfo?: ReduceMotion; default?: ReduceMotion } & Partial<ReduceMotion>;
    const ai: Partial<ReduceMotion> = mod.AccessibilityInfo ?? mod.default ?? mod;
    return typeof ai.isReduceMotionEnabled === "function" ? await ai.isReduceMotionEnabled() : false;
  } catch {
    return false;
  }
}

/**
 * True when confetti and scale/slide animations are welcome. False when the
 * reporter turned celebrations off OR the OS reduce-motion setting is on.
 * Haptics do NOT consult this: a reduce-motion reporter still feels the buzz.
 */
export async function celebrationsAllowed(): Promise<boolean> {
  await hydrateFeedbackSettings();
  if (!celebrationsEnabled) return false;
  return !(await reduceMotionOn());
}

async function impact(level: "Light" | "Medium" | "Heavy"): Promise<void> {
  await hydrateFeedbackSettings();
  if (!hapticsEnabled) return;
  try {
    const mod = await loadHaptics();
    if (mod?.impactAsync && mod.ImpactFeedbackStyle) {
      await mod.impactAsync(mod.ImpactFeedbackStyle[level]);
    }
  } catch {
    // Emulators and devices without a haptic engine: never break the flow.
  }
}

async function notify(kind: "Success" | "Warning"): Promise<void> {
  await hydrateFeedbackSettings();
  if (!hapticsEnabled) return;
  try {
    const mod = await loadHaptics();
    if (mod?.notificationAsync && mod.NotificationFeedbackType) {
      await mod.notificationAsync(mod.NotificationFeedbackType[kind]);
    }
  } catch {
    // Never break the flow.
  }
}

/** Light confirmation on small actions (photo accepted, next step). */
export const tap = (): Promise<void> => impact("Light");
/** Medium bump for finishing a step (Finish report). */
export const bump = (): Promise<void> => impact("Medium");
/** Heavy thud for the big moment (report sent). */
export const thud = (): Promise<void> => impact("Heavy");
/** Success notification pattern for a completed moment. */
export const success = (): Promise<void> => notify("Success");
/** Warning notification pattern for a recoverable problem. */
export const warn = (): Promise<void> => notify("Warning");

/**
 * Test seam only. Injects a fake expo-haptics and resets the load cache so a
 * unit test can observe that the enabled flag gates the calls. Pass null to
 * clear the override.
 */
export function __setHapticsForTest(mod: Partial<HapticsModule> | null): void {
  hapticsOverride = mod;
  hapticsMod = undefined;
}

/** Test seam only: forget the persisted-settings hydration. */
export function __resetFeedbackForTest(): void {
  hydrated = false;
  hapticsEnabled = true;
  celebrationsEnabled = true;
  reduceMotionOverride = null;
}

/** Test seam only: force the reduce-motion answer. Pass null to clear. */
export function __setReduceMotionForTest(fn: (() => boolean | Promise<boolean>) | null): void {
  reduceMotionOverride = fn;
}
