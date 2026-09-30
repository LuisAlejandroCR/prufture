// me-navigation.test.ts: guards the Me hub against dead rows and duplicated Help/privacy routes.
// These assertions are static because Expo Router screens are not mounted in Node tests.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const me = readFileSync(new URL("../app/(tabs)/me.tsx", import.meta.url), "utf8");
const help = readFileSync(new URL("../app/help.tsx", import.meta.url), "utf8");
const support = readFileSync(new URL("../app/support.tsx", import.meta.url), "utf8");
const ui = readFileSync(new URL("../src/components/ui.tsx", import.meta.url), "utf8");

test("Me routes privacy and about to dedicated screens and has no dead press handlers", () => {
  assert.match(me, /router\.push\("\/data-privacy"\)/);
  assert.match(me, /router\.push\("\/about"\)/);
  assert.doesNotMatch(me, /onPress=\{\(\) => undefined\}/);
});

test("Help stays focused on guidance instead of repeating the privacy screen", () => {
  assert.doesNotMatch(help, /title: "My privacy"/);
  assert.doesNotMatch(help, /title: "Why approximate location is used"/);
});

test("Contact support opens a native destination with safe next steps", () => {
  assert.match(me, /router\.push\("\/support"\)/);
  assert.doesNotMatch(me, /siteUrl\("support"\)/);
  assert.match(me, /siteUrl\("privacy"\)/, "the full privacy policy stays reachable in the app (App Store 5.1.1)");
  assert.match(support, /siteUrl\("support"\)/, "support keeps a real contact route");
  assert.match(support, /router\.push\("\/help"\)/);
  assert.match(support, /router\.push\("\/data-privacy"\)/);
  assert.match(support, /Do not send photos of people/);
});

test("the brand mark uses the approved app icon, once, and it is not announced twice", () => {
  assert.match(ui, /assets\/icon\.png/);
  assert.doesNotMatch(ui, /screenAppIcon/, "no floating icon on every screen: it overlapped header actions");
  assert.match(ui, /accessibilityLabel="Prufture"/);
  assert.match(ui, /accessible=\{false\}/);
});

const privacy = readFileSync(new URL("../app/data-privacy.tsx", import.meta.url), "utf8");
const about = readFileSync(new URL("../app/about.tsx", import.meta.url), "utf8");

test("Data and privacy discloses the sealed precise point, not just the public area", () => {
  // src/location-seal.ts + sync.attachPreciseLocation send it whenever a programme key is configured.
  assert.match(privacy, /encrypted/i);
  assert.match(privacy, /only the programme team can open it/);
  assert.match(privacy, /never shown publicly/);
});

test("new screens keep DESIGN.md copy rules: no em-dash in UI strings", () => {
  const strip = (src: string) => src.replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(strip(privacy), /—/);
  assert.doesNotMatch(strip(about), /—/);
});

test("Me stays compact: no English-only Language row, no second waiting-to-send banner", () => {
  assert.doesNotMatch(me, /Language/);
  assert.doesNotMatch(me, /waiting to send\./, "Offline storage already says what is waiting");
  assert.doesNotMatch(me, /<Illustration/);
  assert.doesNotMatch(me, /<Switch/, "toggles live on the Accessibility screen");
});

const accessibility = readFileSync(new URL("../app/accessibility.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/_layout.tsx", import.meta.url), "utf8");

test("Accessibility is one row on Me and keeps both toggles on its own screen", () => {
  assert.match(me, /router\.push\("\/accessibility"\)/);
  assert.match(layout, /<Stack\.Screen name="accessibility" \/>/);
  assert.match(accessibility, /setHapticsEnabled\(v\)/);
  assert.match(accessibility, /setCelebrationsEnabled\(v\)/);
  assert.match(accessibility, /hydrateFeedbackSettings\(\)/);
  assert.match(accessibility, /Text size follows your phone settings\./);
  assert.match(accessibility, /accessibilityLabel=\{title\}/, "each switch is named for VoiceOver");
  assert.doesNotMatch(accessibility.replace(/^\s*\/\/.*$/gm, ""), /—/);
});

test("About shows the app version only", () => {
  assert.match(about, /Constants\.expoConfig\?\.version/);
  assert.doesNotMatch(about, /Illustration|Project|open-source|Community evidence/);
  assert.match(about, /accessible accessibilityLabel=\{`Version \$\{version\}`\}/);
  assert.match(me, /title="About Prufture" subtitle="Version"/);
});
