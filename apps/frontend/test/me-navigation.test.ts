// me-navigation.test.ts: guards the Me hub against dead rows and duplicated Help/privacy routes.
// These assertions are static because Expo Router screens are not mounted in Node tests.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const me = readFileSync(new URL("../app/(tabs)/me.tsx", import.meta.url), "utf8");
const help = readFileSync(new URL("../app/help.tsx", import.meta.url), "utf8");

test("Me routes privacy and about to dedicated screens and has no dead press handlers", () => {
  assert.match(me, /router\.push\("\/data-privacy"\)/);
  assert.match(me, /router\.push\("\/about"\)/);
  assert.doesNotMatch(me, /onPress=\{\(\) => undefined\}/);
});

test("Help stays focused on guidance instead of repeating the privacy screen", () => {
  assert.doesNotMatch(help, /title: "My privacy"/);
  assert.doesNotMatch(help, /title: "Why approximate location is used"/);
});
