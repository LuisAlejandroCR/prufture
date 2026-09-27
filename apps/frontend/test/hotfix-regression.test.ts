// hotfix-regression.test.ts: source assertions for on-device hotfixes that cannot render under Node:
// <Screen> applies the safe-area top inset (BUG 1), and reachability is online unless explicitly
// false with an initial sync on mount (BUG 3). Device confirmation is the human's APK screenshots.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

test("BUG 1: ui.tsx Screen respects the inset (mock top=47 -> paddingTop 47, not 0)", () => {
  const src = read("../src/components/ui.tsx");
  // The inverted ternary is gone.
  assert.equal(/insets\.top\s*\?\s*0/.test(src), false, "inverted `insets.top ? 0` still present");
  // A pure helper computes the pad and the frame uses it.
  assert.match(src, /export function screenPaddingTop\(insetTop: number\): number/);
  assert.match(src, /return insetTop \|\| space\.md/);
  assert.match(src, /paddingTop: screenPaddingTop\(insets\.top\)/);

  // Re-derive the helper's contract: a notch inset is applied verbatim; with none
  // there is a small floor (space.md === 12).
  const screenPaddingTop = (insetTop: number) => insetTop || 12;
  assert.equal(screenPaddingTop(47), 47);
  assert.equal(screenPaddingTop(0), 12);
});

test("BUG 3: useAutoSync treats isInternetReachable:null + isConnected:true as online", () => {
  const src = read("../src/useAutoSync.ts");
  assert.equal(
    /Boolean\(state\.isConnected && state\.isInternetReachable\)/.test(src),
    false,
    "old null-hostile reachability check still present",
  );
  assert.match(src, /export function isOnline/);
  assert.match(src, /state\.isConnected === true && state\.isInternetReachable !== false/);
  // An initial attempt on mount, independent of the rising edge / AppState.
  assert.match(src, /setTimeout\(trigger/);

  // Re-derive isOnline's truth table.
  const isOnline = (s: { isConnected: boolean | null; isInternetReachable: boolean | null }) =>
    s.isConnected === true && s.isInternetReachable !== false;
  assert.equal(isOnline({ isConnected: true, isInternetReachable: null }), true);
  assert.equal(isOnline({ isConnected: true, isInternetReachable: true }), true);
  assert.equal(isOnline({ isConnected: true, isInternetReachable: false }), false);
  assert.equal(isOnline({ isConnected: false, isInternetReachable: null }), false);
});
