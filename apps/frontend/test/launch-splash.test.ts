// launch-splash.test.ts: the opening moment stays wired. The native splash is held and then handed off
// to the animated LaunchSplash, which shows the same sprout mark and the wordmark, respects reduce
// motion, and the native splash image carries the sprout and "Prufture" rather than the old shield.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

test("root layout holds the native splash and renders LaunchSplash over the app", () => {
  const src = read("../app/_layout.tsx");
  assert.match(src, /SplashScreen\.preventAutoHideAsync\(\)\.catch/);
  assert.match(src, /SplashScreen\.hideAsync\(\)\.catch/);
  assert.match(src, /\{launching \? <LaunchSplash onDone=\{done\} \/> : null\}/);
});

test("LaunchSplash draws the sprout, the wordmark, and honours reduce motion", () => {
  const src = read("../src/components/LaunchSplash.tsx");
  assert.match(src, /RIGHT_LEAF/);
  assert.match(src, /LEFT_LEAF/);
  assert.match(src, />Prufture</);
  assert.match(src, /celebrationsAllowed\(\)/);
});

test("native splash image is the sprout with the wordmark, not the old shield", () => {
  const svg = read("../assets/splash-icon.svg");
  assert.match(svg, />Prufture</);
  assert.match(svg, /M12 12\.3c0-4 2\.6-6\.8 7\.5-7/);
  assert.doesNotMatch(svg, /polygon/);
});
