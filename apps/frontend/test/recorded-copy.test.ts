// recorded-copy.test.ts: reporter-facing copy never calls an on-chain record "confirmed". Confirmed
// means the community count was met (status/[id]); the public record alone is "recorded publicly".
// Reads screen sources as text, so no react-native import runs under node --test.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { friendlyStatus, statusStyle } from "../src/theme.js";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("the on-chain record is labelled recorded publicly, never confirmed", () => {
  assert.equal(statusStyle[friendlyStatus("attested")].label, "Recorded publicly");
  assert.equal(statusStyle[friendlyStatus("synced", 0)].label, "Being recorded");
});

test("Home, Me and My reports count recorded reports, not confirmed ones", () => {
  for (const p of ["app/(tabs)/index.tsx", "app/(tabs)/me.tsx", "app/(tabs)/updates.tsx"]) {
    const s = src(p);
    assert.doesNotMatch(s, /reports?"\} confirmed|"report" : "reports"\} confirmed|\{" "\}confirmed/, p);
    assert.match(s, /recorded/, p);
  }
});

test("the status pill never turns an attestation count into people", () => {
  assert.doesNotMatch(src("src/components/ui.tsx"), /Confirmed by \$\{count\} people/);
});

test("the local notification does not claim the programme team confirmed the report", () => {
  assert.doesNotMatch(src("src/notifications.ts"), /confirmed by the programme team/);
});
