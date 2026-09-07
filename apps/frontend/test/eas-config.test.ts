// eas-config.test.ts: unit + fuzz + invariant checks for the Block 3 demo-rig config
// (apps/frontend/eas.json and apps/frontend/app.json). Guards the preview APK profile
// against silent drift; it does not exercise any runtime code.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

// --- unit: files parse and carry the expected shape ---
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

test("app.json: android.package + versionCode set, eas.projectId placeholder empty", () => {
  assert.equal(app.expo.android.package, "ai.proofatcapture.app");
  assert.equal(typeof app.expo.android.versionCode, "number");
  assert.equal(app.expo.extra.eas.projectId, "");
  assert.equal(app.expo.name, "Prufture");
});

// --- invariants ---
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

// --- fuzz: the preview profile stays an installable-APK profile under key reordering ---
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
