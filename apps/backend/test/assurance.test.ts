// assurance.test.ts: the /verify page keeps the face check and the programme pass apart. A passed
// face check with no verified membership must never read as "Anonymous pass confirmed".

import { test } from "node:test";
import assert from "node:assert/strict";
import { assuranceFromProof, faceCheckLabel, passLabel } from "../lib/assurance.js";

test("regression: a passed face check without a membership is not a confirmed pass", () => {
  // The real demo report: verifiedPerson true, membership null.
  const face = assuranceFromProof({ verifiedPerson: true, verifiedPersonDegraded: false });
  assert.equal(faceCheckLabel(face), "Passed");
  assert.equal(passLabel(null), "This report has not been participant-confirmed");
  assert.notEqual(passLabel(null), "Anonymous pass confirmed");
});

test("passLabel: only a verified membership confirms the pass", () => {
  assert.equal(passLabel("verified"), "Anonymous pass confirmed");
  assert.equal(passLabel(null), "This report has not been participant-confirmed");
});

test("faceCheckLabel: plain wording for every liveness state", () => {
  assert.equal(faceCheckLabel(assuranceFromProof({ verifiedPerson: null })), "Not run");
  assert.equal(faceCheckLabel(assuranceFromProof({ verifiedPerson: false, verifiedPersonDegraded: true })), "Could not be checked");
  assert.equal(faceCheckLabel(assuranceFromProof({ verifiedPerson: false, verifiedPersonDegraded: false })), "Did not pass");
});
