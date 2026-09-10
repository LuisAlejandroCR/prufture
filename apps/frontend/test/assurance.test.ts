// assurance.test.ts: the explicit personhood-assurance states and their mapping from
// /proof/:hash. The one invariant that must never break: "unavailable" (provider degraded)
// must never collapse into "invalid" (an actual failed check).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assuranceFromProof,
  assuranceLabel,
  countsAsParticipantConfirmed,
  type Assurance,
} from "../src/assurance.js";

test("assuranceLabel: exact reporter copy for every state", () => {
  const cases: Array<[Assurance, string]> = [
    ["verified", "Anonymous pass confirmed"],
    ["invalid", "Anonymous pass could not be confirmed"],
    ["reused", "This pass was already used for this task"],
    ["unavailable", "Anonymous pass could not be checked"],
    ["not_enrolled", "This report has not been participant-confirmed"],
  ];
  for (const [state, label] of cases) assert.equal(assuranceLabel(state), label);
});

test("assuranceFromProof: verifiedPerson null maps to not_enrolled or unavailable by flag", () => {
  assert.equal(assuranceFromProof({ verifiedPerson: null }, false), "not_enrolled");
  assert.equal(assuranceFromProof({ verifiedPerson: null }, true), "unavailable");
});

test("assuranceFromProof: true is always verified", () => {
  assert.equal(assuranceFromProof({ verifiedPerson: true }, false), "verified");
  assert.equal(assuranceFromProof({ verifiedPerson: true }, true), "verified");
});

test("assuranceFromProof: a degraded false verdict is unavailable, never invalid", () => {
  const a = assuranceFromProof({ verifiedPerson: false, verifiedPersonDegraded: true }, true);
  assert.equal(a, "unavailable");
  assert.notEqual(a, "invalid");
});

test("assuranceFromProof: a real failed check (false, not degraded) is invalid", () => {
  assert.equal(assuranceFromProof({ verifiedPerson: false, verifiedPersonDegraded: false }, true), "invalid");
  assert.equal(assuranceFromProof({ verifiedPerson: false }, true), "invalid");
});

test("countsAsParticipantConfirmed: only verified counts", () => {
  assert.equal(countsAsParticipantConfirmed("verified"), true);
  for (const other of ["invalid", "reused", "unavailable", "not_enrolled"] as const) {
    assert.equal(countsAsParticipantConfirmed(other), false);
  }
});
