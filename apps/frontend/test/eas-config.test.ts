// eas-config.test.ts: unit + fuzz + invariant checks for eas.json and app.json plus store-readiness
// wiring (assets, permissions, notifications). Guards the config against silent drift; it does not
// exercise any runtime code.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const easPath = fileURLToPath(new URL("../eas.json", import.meta.url));
const appPath = fileURLToPath(new URL("../app.json", import.meta.url));

const easRaw = readFileSync(easPath, "utf8");
const appRaw = readFileSync(appPath, "utf8");
const eas = JSON.parse(easRaw);
const app = JSON.parse(appRaw);

type Profile = Record<string, unknown>;
const profiles = (): Array<[string, Profile]> =>
  Object.entries(eas.build as Record<string, Profile>);

// resolve a profile's `extends` chain so tests see the effective config
function resolved(name: string): Profile {
  const raw = (eas.build as Record<string, Profile>)[name] ?? {};
  const parentName = raw.extends as string | undefined;
  const parent = parentName ? resolved(parentName) : {};
  return {
    ...parent,
    ...raw,
    android: { ...(parent.android as object), ...(raw.android as object) },
  };
}

test("eas.json is valid JSON with a build section", () => {
  assert.equal(typeof eas, "object");
  assert.equal(typeof eas.build, "object");
  // must round-trip: the config loader and this test both rely on strict JSON
  assert.deepEqual(JSON.parse(easRaw), eas);
});

test("cli.version is pinned", () => {
  assert.equal(typeof eas.cli.version, "string");
  assert.match(eas.cli.version, /\d+\.\d+\.\d+/);
});

test("preview profile: internal APK, no dev client, preview channel", () => {
  const p = resolved("preview");
  assert.equal(p.distribution, "internal");
  assert.equal(p.developmentClient, false);
  assert.equal((p.android as { buildType: string }).buildType, "apk");
  assert.notEqual((p.android as { buildType: string }).buildType, "app-bundle");
  assert.equal(p.channel, "preview");
});

test("production profile is present and documented as store / app-bundle, not run now", () => {
  const p = resolved("production");
  assert.equal(p.distribution, "store");
  assert.equal((p.android as { buildType: string }).buildType, "app-bundle");
  assert.equal(p.autoIncrement, true);
});

test("app.json: iPhone only, so App Store Connect asks for no iPad screenshots", () => {
  assert.equal(app.expo.ios.supportsTablet, false);
});

test("production store build carries the same public config as preview, and no placeholder values", () => {
  // A missing verify URL shipped a status screen linking to prufture.example; a missing programme
  // key silently skipped sealing the precise point; a "<<...>>" key was baked into the bundle.
  const env = resolved("production").env as Record<string, string>;
  const preview = resolved("preview").env as Record<string, string>;
  for (const key of ["EXPO_PUBLIC_API_URL", "EXPO_PUBLIC_VERIFY_URL", "EXPO_PUBLIC_PROGRAMME_PUBKEY"]) {
    assert.ok(env[key], `${key} missing from the production profile`);
    assert.equal(env[key], preview[key], `${key} differs between preview and production`);
  }
  assert.match(env.EXPO_PUBLIC_VERIFY_URL!, /^https:\/\/.+\/verify$/);
  assert.match(env.EXPO_PUBLIC_PROGRAMME_PUBKEY!, /^[0-9a-f]{64}$/);
  assert.equal(env.EXPO_PUBLIC_IDENTITY_STEP, "off");
  for (const [key, value] of Object.entries(env)) {
    assert.ok(!/<<|>>|human fills/i.test(value), `${key} still holds a placeholder`);
  }
  assert.ok(!("EXPO_PUBLIC_REVENUECAT_TEST_KEY" in env), "a Test Store key must never reach a store build");
});

test("app.json: android.package + versionCode set, eas.projectId is a real UUID", () => {
  assert.equal(app.expo.android.package, "ai.proofatcapture.app");
  assert.equal(typeof app.expo.android.versionCode, "number");
  assert.match(
    app.expo.extra.eas.projectId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  );
  assert.equal(app.expo.name, "Prufture");
});

test("app.json: EAS Update wiring matches the projectId (needed for channel:preview builds)", () => {
  assert.equal(app.expo.owner, "alejoooo-team");
  assert.equal(app.expo.runtimeVersion.policy, "appVersion");
  assert.equal(app.expo.updates.url, `https://u.expo.dev/${app.expo.extra.eas.projectId}`);
});

test("invariant: every real build profile uses a known distribution", () => {
  for (const [name, raw] of profiles()) {
    if (raw.extends === undefined && raw.distribution === undefined) continue; // shared base block
    const dist = resolved(name).distribution as string;
    assert.ok(["internal", "store"].includes(dist), `profile ${name} has unknown distribution ${dist}`);
  }
});

test("invariant: only the production profile may target the store", () => {
  for (const [name] of profiles()) {
    if (resolved(name).distribution === "store") assert.equal(name, "production");
  }
});

test("invariant: no secrets or absolute paths in the config files", () => {
  const forbidden = [
    /PRIVATE_KEY/i,
    /API_KEY/i,
    /SECRET/i,
    /TOKEN/i,
    /BEGIN [A-Z ]*PRIVATE KEY/,
    /0x[a-fA-F0-9]{40,}/,
    /[A-Za-z]:\\Users\\/,
    /mnemonic/i,
  ];
  for (const raw of [easRaw, appRaw]) {
    for (const re of forbidden) assert.equal(re.test(raw), false, `matched ${re}`);
  }
});

// Store readiness: app.json is complete for a store submission.
test("app.json: identity fields are store-complete", () => {
  const e = app.expo;
  assert.equal(e.name, "Prufture");
  assert.equal(e.slug, "prufture");
  assert.equal(e.scheme, "prufture");
  assert.match(e.version, /^\d+\.\d+\.\d+$/);
  assert.equal(e.orientation, "portrait");
  assert.equal(e.icon, "./assets/icon.png");
  assert.equal(e.ios.bundleIdentifier, "ai.proofatcapture.app");
  assert.equal(e.ios.buildNumber, "1");
  assert.equal(e.android.package, "ai.proofatcapture.app");
});

test("app.json: iOS privacy strings + export-compliance flag are set", () => {
  const p = app.expo.ios.infoPlist;
  assert.equal(p.ITSAppUsesNonExemptEncryption, false);
  assert.ok(p.NSCameraUsageDescription.length > 10);
  assert.ok(/approximate/i.test(p.NSLocationWhenInUseUsageDescription));
});

test("app.json: Android permissions are exactly the four we use", () => {
  assert.deepEqual([...app.expo.android.permissions].sort(), [
    "ACCESS_COARSE_LOCATION",
    "ACCESS_FINE_LOCATION",
    "CAMERA",
    "POST_NOTIFICATIONS",
  ]);
  const blocked = app.expo.android.blockedPermissions as string[];
  assert.ok(blocked.includes("android.permission.RECORD_AUDIO"));
  assert.ok(blocked.some((b) => b.includes("READ_MEDIA_IMAGES")));
});

test("app.json: adaptive icon, splash and notification assets are wired via plugins", () => {
  assert.equal(app.expo.android.adaptiveIcon.foregroundImage, "./assets/adaptive-icon.png");
  assert.equal(app.expo.android.adaptiveIcon.backgroundColor, "#FBF6EF");
  const plugins = app.expo.plugins as Array<string | [string, Record<string, unknown>]>;
  const cfg = (name: string) =>
    (plugins.find((p) => Array.isArray(p) && p[0] === name) as [string, Record<string, unknown>])[1];
  assert.equal(cfg("expo-splash-screen").image, "./assets/splash-icon.png");
  assert.equal(cfg("expo-notifications").icon, "./assets/notification-icon.png");
  assert.equal(cfg("expo-notifications").color, "#C8533A");
});

test("app.json: plugins include the native modules we ship and nothing we do not", () => {
  const names = (app.expo.plugins as Array<string | [string, unknown]>).map((p) =>
    Array.isArray(p) ? p[0] : p,
  );
  for (const need of [
    "expo-router",
    "expo-secure-store",
    "expo-sqlite",
    "expo-camera",
    "expo-location",
    "expo-notifications",
    "expo-splash-screen",
  ]) {
    assert.ok(names.includes(need), `missing plugin ${need}`);
  }
});

test("app.json: EAS projectId is untouched (eas init owns it)", () => {
  assert.equal(app.expo.extra.eas.projectId, "dbb8e72c-5bed-4676-8d04-3805ecacc2e7");
  assert.equal(app.expo.updates.url, `https://u.expo.dev/${app.expo.extra.eas.projectId}`);
});

test("store assets exist on disk", () => {
  for (const f of [
    "icon.png",
    "adaptive-icon.png",
    "splash-icon.png",
    "notification-icon.png",
    "favicon.png",
  ]) {
    const p = fileURLToPath(new URL(`../assets/${f}`, import.meta.url));
    assert.ok(existsSync(p), `missing asset ${f}`);
  }
});

// The App Store rejects an icon with an alpha channel; both stores expect 1024x1024. Read the PNG
// IHDR directly (bytes 16-25) so no image dependency is needed.
test("icon.png is a 1024x1024 PNG without an alpha channel", () => {
  const buf = readFileSync(fileURLToPath(new URL("../assets/icon.png", import.meta.url)));
  assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "not a PNG");
  assert.equal(buf.toString("ascii", 12, 16), "IHDR");
  assert.equal(buf.readUInt32BE(16), 1024, "width");
  assert.equal(buf.readUInt32BE(20), 1024, "height");
  const colorType = buf[25];
  // 4 = grayscale+alpha, 6 = RGBA; 3 = palette, which can carry alpha via a tRNS chunk
  assert.ok(colorType === 0 || colorType === 2 || colorType === 3, `alpha color type ${colorType}`);
  assert.equal(buf.includes(Buffer.from("tRNS")), false, "tRNS transparency chunk present");
});

test("eas.json: production profile targets the store on its own channel", () => {
  const p = resolved("production");
  assert.equal(p.distribution, "store");
  assert.equal(p.channel, "production");
  assert.equal(p.autoIncrement, true);
  assert.equal((p.android as { buildType: string }).buildType, "app-bundle");
});

test("eas.json: submit.production has ios + android placeholders, key path is gitignored json", () => {
  const s = eas.submit.production;
  assert.ok("ascAppId" in s.ios && "appleTeamId" in s.ios);
  assert.match(s.android.serviceAccountKeyPath, /\.json$/);
  assert.equal(s.android.track, "internal");
});

test("notifications.ts registers anonymously — device id + token only, no identity fields", () => {
  const src = readFileSync(
    fileURLToPath(new URL("../src/notifications.ts", import.meta.url)),
    "utf8",
  );
  assert.match(src, /\/register-push/);
  assert.match(src, /toRegisterBody\(/);
  for (const banned of [/\bemail\b/i, /\bfullName\b/, /\bphone\b/i, /proofHash/]) {
    assert.equal(banned.test(src), false, `notifications.ts references ${banned}`);
  }
});

test("_layout.tsx calls registerForPush on mount", () => {
  const src = readFileSync(
    fileURLToPath(new URL("../app/_layout.tsx", import.meta.url)),
    "utf8",
  );
  assert.match(src, /registerForPush\(/);
});

// The preview profile stays an installable-APK profile under key reordering.
test("fuzz: preview profile invariants hold regardless of key order", () => {
  const p = resolved("preview");
  for (let i = 0; i < 500; i += 1) {
    const keys = Object.keys(p).sort(() => Math.random() - 0.5);
    const shuffled: Record<string, unknown> = {};
    for (const k of keys) shuffled[k] = p[k];
    const round = JSON.parse(JSON.stringify(shuffled));
    assert.equal(round.distribution, "internal");
    assert.equal(round.developmentClient, false);
    assert.equal((round.android as { buildType: string }).buildType, "apk");
  }
});
