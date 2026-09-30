// programme-pass-copy.test.ts: source checks on the screens that show the programme pass — Me explains
// in-person enrolment and shows list status, Data and privacy discloses the pass, status shows the
// per-report line — and none of them uses personhood, zero-knowledge or hardware claims in UI copy.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const me = read("../app/(tabs)/me.tsx");
const privacy = read("../app/data-privacy.tsx");
const status = read("../app/status/[id].tsx");
const stripComments = (src: string) => src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

test("Me explains how a reporter joins: in person, the coordinator adds the code", () => {
  assert.match(me, /meet your programme coordinator in person/);
  assert.match(me, /They add it to the programme list/);
  assert.match(me, /A new phone\s+or a reinstall gives a new code/);
  assert.match(me, /This phone is on the programme list\./);
  assert.match(me, /This phone is not on the programme list yet\./);
  assert.match(me, /getEnrolment\(API_URL\)/);
});

test("Data and privacy lists the pass only when it is on", () => {
  assert.match(privacy, /personhoodProvider\(\) === "semaphore" \? \[\.\.\.ITEMS, PASS_ITEM\] : ITEMS/);
  assert.match(privacy, /does not send the code, your name, phone number or location/);
});

test("status shows the pass line only when the pass is on and a check was attempted", () => {
  assert.match(status, /if \(personhoodOn\(\)\) \{\s*getOutcomes\(/);
  assert.match(status, /\{pass && passCopy \? \(/);
});

test("no screen copy claims personhood, zero-knowledge, anonymity or hardware guarantees", () => {
  for (const [name, src] of Object.entries({ me, privacy, status })) {
    const text = stripComments(src).toLowerCase();
    for (const banned of ["proof of personhood", "zero-knowledge", "zero knowledge", "unique human", "sybil", "anonymous", "hardware", "secure enclave"]) {
      assert.ok(!text.includes(banned), `${name}: "${banned}"`);
    }
    assert.doesNotMatch(stripComments(src), /—/, `${name}: em-dash in UI copy`);
  }
});
