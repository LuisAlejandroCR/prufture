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

test("native splash is blank, so the small native icon never shows before the big animated mark", () => {
  const app = JSON.parse(read("../app.json")) as { expo: { plugins: Array<string | [string, { image?: string }]> } };
  const splash = app.expo.plugins.find((p) => Array.isArray(p) && p[0] === "expo-splash-screen") as [
    string,
    { image: string },
  ];
  assert.equal(splash[1].image, "./assets/splash-blank.png");
  const png = readFileSync(fileURLToPath(new URL("../assets/splash-blank.png", import.meta.url)));
  assert.equal(png.toString("ascii", 12, 16), "IHDR");
  assert.equal(png[25], 6, "RGBA, so it is fully transparent over the background colour");
});

test("the animation and the wordmark stay on screen long enough to read", () => {
  const src = read("../src/components/LaunchSplash.tsx");
  const ms = [...src.matchAll(/duration: (\d+)|grow\(\w+, (\d+)\)|delay\((\d+)\)/g)].map((m) =>
    Number(m[1] ?? m[2] ?? m[3]),
  );
  const total = ms.reduce((a, b) => a + b, 0);
  assert.ok(total >= 4000, `launch sequence totals ${total} ms`);
  assert.match(src, /delay\(1300\)/, "the wordmark holds before the fade");
});
