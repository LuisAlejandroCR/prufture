// tab-press.test.ts: the iOS convention that tapping the tab you are already on scrolls that page
// back to the top. The custom tab bar must emit React Navigation's `tabPress` event (which
// useScrollToTop listens for) and navigate only when switching tabs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tabPressAction } from "../src/tab-press.js";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

test("tabPressAction navigates only to another tab, and respects preventDefault", () => {
  assert.equal(tabPressAction({ focused: false, defaultPrevented: false }), "navigate");
  assert.equal(tabPressAction({ focused: true, defaultPrevented: false }), "scroll-to-top");
  assert.equal(tabPressAction({ focused: false, defaultPrevented: true }), "none");
});

test("the custom tab bar emits tabPress for the pressed route", () => {
  const src = read("../app/(tabs)/_layout.tsx");
  assert.match(src, /navigation\.emit\(\{\s*type: "tabPress",\s*target: route\.key,\s*canPreventDefault: true/);
  assert.match(src, /tabPressAction\(/);
});

test("the shared Screen and the My reports list scroll to top on a repeated tab tap", () => {
  const ui = read("../src/components/ui.tsx");
  assert.match(ui, /useScrollToTop\(scrollRef\)/);
  assert.match(ui, /<ScrollView\s+ref=\{scrollRef\}/);
  const updates = read("../app/(tabs)/updates.tsx");
  assert.match(updates, /useScrollToTop\(listRef\)/);
  assert.match(updates, /<ScrollView\s+ref=\{listRef\}/);
});
