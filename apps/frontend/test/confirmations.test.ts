// confirmations.test.ts: a second nearby reporter's independent report counts as a community
// confirmation ("2 of 3"), far or malformed reports never count, and on a high-assurance task only
// participant-confirmed reports count. Also covers parsing and the fetch wrapper's degradation.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  confirmationInvite,
  confirmationsLabel,
  confirmationsNote,
  countsAsConfirmation,
  fetchConfirmations,
  liveConfirmations,
  parseConfirmations,
  type ConfirmationReport,
} from "../src/confirmations.js";
import { getTask, itemTaskId } from "../src/tasks.js";

const solar = getTask("solar-panel-install"); // cell kzdwb, need 3, standard assurance
const fridge = getTask("cold-chain-bogota"); // cell d2g38, need 3, high assurance

function rep(p: Partial<ConfirmationReport> = {}): ConfirmationReport {
  return { own: false, geohashRegion: "kzdwb", verifiedPerson: null, verifiedPersonDegraded: null, membershipVerified: true, ...p };
}

test("a second nearby reporter's report makes it 2 of 3 on a standard task", () => {
  const p = liveConfirmations(solar, [rep({ own: true }), rep()], false)!;
  assert.equal(p.have, 2);
  assert.equal(p.need, 3);
  assert.equal(p.ownCounts, true);
  assert.equal(confirmationsLabel(p), "2 of 3 confirmations");
  assert.equal(confirmationsNote(p), null);
});

test("regression: nearby reports without a programme pass never count (one tester, one phone)", () => {
  const noPass = [rep({ own: true, membershipVerified: false }), ...Array.from({ length: 5 }, () => rep({ membershipVerified: false }))];
  const p = liveConfirmations(solar, noPass, false)!;
  assert.equal(p.have, 0);
  assert.equal(p.notConfirmed, 6);
  assert.equal(p.ownCounts, false);
  assert.equal(confirmationsLabel(p), "0 of 3 confirmations");
  assert.equal(confirmationsNote(p), "6 nearby reports have no programme pass, so they do not count.");
  // A face check alone is not a programme pass.
  assert.equal(countsAsConfirmation(solar, rep({ membershipVerified: false, verifiedPerson: true }), false), false);
});

test("a report far from the assignment or with an unreadable region never counts", () => {
  assert.equal(countsAsConfirmation(solar, rep({ geohashRegion: "sb8v1" }), false), false);
  assert.equal(countsAsConfirmation(solar, rep({ geohashRegion: "not!" }), false), false);
  assert.equal(countsAsConfirmation(solar, rep({ geohashRegion: "" }), false), false);
  assert.equal(liveConfirmations(solar, [rep({ own: true }), rep({ geohashRegion: "sb8v1" })], false)!.have, 1);
});

test("high-assurance task: only participant-confirmed reports count", () => {
  const near = { geohashRegion: "d2g38" };
  const reports = [
    rep({ ...near, own: true }), // no verdict: not_enrolled
    rep({ ...near, verifiedPerson: true, verifiedPersonDegraded: false }), // verified
    rep({ ...near, verifiedPerson: false, verifiedPersonDegraded: true }), // unavailable
    rep({ ...near, verifiedPerson: false, verifiedPersonDegraded: false }), // invalid
  ];
  for (const identityOn of [false, true]) {
    const p = liveConfirmations(fridge, reports, identityOn)!;
    assert.equal(p.have, 1);
    assert.equal(p.notConfirmed, 3);
    assert.equal(p.ownCounts, false);
    assert.equal(confirmationsLabel(p), "1 of 3 confirmations");
    assert.match(confirmationsNote(p)!, /3 nearby reports are not participant-confirmed/);
  }
  // The same unconfirmed reports DO count on a standard task.
  assert.equal(liveConfirmations(solar, reports.map((r) => ({ ...r, geohashRegion: "kzdwb" })), false)!.have, 4);
});

test("label never claims more than the target; notes stay plain", () => {
  const done = liveConfirmations(solar, [rep(), rep(), rep(), rep()], false)!;
  assert.equal(confirmationsLabel(done), "3 of 3 confirmations");
  assert.match(confirmationsNote(done)!, /has the confirmations/);
  const fridgeEmpty = liveConfirmations(fridge, [], false)!;
  assert.equal(confirmationsNote(fridgeEmpty), "Only participant-confirmed reports count for this task.");
  assert.match(
    confirmationsNote(liveConfirmations(fridge, [rep({ geohashRegion: "d2g38" })], false)!)!,
    /1 nearby report is not participant-confirmed, so it does not count/,
  );
});

test("self-started reports and assignments without a target have no community progress", () => {
  assert.equal(liveConfirmations(getTask(itemTaskId("school-solar")), [rep()], false), null);
  assert.equal(liveConfirmations(getTask("latrine-construction"), [rep()], false), null);
});

test("invite only shows to a reporter near an assignment that asks for confirmations", () => {
  assert.match(confirmationInvite(solar, "kzdwb")!, /once it carries your programme pass\.$/);
  assert.match(confirmationInvite(fridge, "d2g38")!, /programme pass and is participant-confirmed/);
  assert.equal(confirmationInvite(solar, "sb8v1"), null);
  assert.equal(confirmationInvite(solar, null), null);
  assert.equal(confirmationInvite(getTask("latrine-construction"), "kzujq"), null);
});

test("parseConfirmations drops malformed rows and rejects malformed bodies", () => {
  assert.equal(parseConfirmations(null), null);
  assert.equal(parseConfirmations({ reports: "x" }), null);
  const rows = parseConfirmations({
    reports: [
      { own: true, geohashRegion: "kzdwb", verifiedPerson: null, verifiedPersonDegraded: null, membershipVerified: true, extra: "dropped" },
      { own: false, geohashRegion: "kzdwb", verifiedPerson: null, verifiedPersonDegraded: null },
      { own: "yes", geohashRegion: "kzdwb", verifiedPerson: null, verifiedPersonDegraded: null },
      { own: false, geohashRegion: "kzdwb", verifiedPerson: "true", verifiedPersonDegraded: null },
    ],
  });
  assert.deepEqual(rows, [
    { own: true, geohashRegion: "kzdwb", verifiedPerson: null, verifiedPersonDegraded: null, membershipVerified: true },
    // An older api without the field: reads as no pass, never as a confirmation.
    { own: false, geohashRegion: "kzdwb", verifiedPerson: null, verifiedPersonDegraded: null, membershipVerified: false },
  ]);
});

test("fetchConfirmations calls the exact endpoint and degrades to null", async () => {
  let asked = "";
  const ok = (async (url: string) => {
    asked = url;
    return new Response(JSON.stringify({ reports: [rep({ own: true })] }), { status: 200 });
  }) as unknown as typeof fetch;
  const rows = await fetchConfirmations("https://api.example/", "ab/c", ok);
  assert.equal(asked, "https://api.example/proof/ab%2Fc/confirmations");
  assert.equal(rows?.length, 1);

  const notFound = (async () => new Response("{}", { status: 404 })) as unknown as typeof fetch;
  assert.equal(await fetchConfirmations("https://api.example", "h", notFound), null);
  const offline = (async () => {
    throw new Error("offline");
  }) as unknown as typeof fetch;
  assert.equal(await fetchConfirmations("https://api.example", "h", offline), null);
});
