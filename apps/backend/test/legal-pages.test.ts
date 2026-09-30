// legal-pages.test.ts: static guards on /privacy and /support — the two URLs app review checks.
// Prose silently loses properties, so this pins them: banned claims never appear, and the legally
// material disclosures (blockchain permanence, selfie default-off, free reporting) stay present.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** Source with `//` comments stripped: the header comments legitimately NAME the banned claims
 *  in order to forbid them, and only what ships to the reader is under test here. */
function prose(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

const PRIVACY = prose("../app/privacy/page.tsx");
const SUPPORT = prose("../app/support/page.tsx");
const PAGES: [string, string][] = [
  ["privacy", PRIVACY],
  ["support", SUPPORT],
];

// Honesty rule: never claim a guarantee the code does not implement.
const BANNED = [
  "gdpr-compliant",
  "gdpr compliant",
  "fully compliant",
  "zero-knowledge",
  "zero knowledge",
  "hardware attestation",
  "deepfake-proof",
  "deepfake proof",
  "tamper-proof",
  "military-grade",
  "bank-grade",
  "unhackable",
  "100% secure",
  "completely anonymous",
];

test("neither page makes a claim the implementation does not support", () => {
  for (const [name, body] of PAGES) {
    const lower = body.toLowerCase();
    for (const claim of BANNED) {
      assert.ok(!lower.includes(claim), `${name} page claims "${claim}"`);
    }
  }
});

test("neither page claims a UNICEF partnership, endorsement or adoption", () => {
  for (const [name, body] of PAGES) {
    const lower = body.toLowerCase();
    assert.ok(lower.includes("unicef"), `${name} must state the relationship, not hide it`);
    for (const claim of [
      "unicef partner",
      "in partnership with unicef",
      "endorsed by unicef",
      "official unicef",
      "adopted by unicef",
      "a unicef app",
    ]) {
      assert.ok(!lower.includes(claim), `${name} page claims "${claim}"`);
    }
    assert.ok(
      lower.includes("not a unicef product"),
      `${name} must carry the explicit disclaimer`,
    );
  }
});

test("privacy page discloses that on-chain records cannot be deleted", () => {
  const lower = PRIVACY.toLowerCase();
  assert.ok(lower.includes("blockchain"), "permanence disclosure must name the mechanism");
  assert.ok(
    lower.includes("cannot be edited or deleted") || lower.includes("cannot be deleted"),
    "the page must say plainly that the record cannot be deleted",
  );
  // Deletion is the one right we genuinely cannot honour; promising it would be false.
  for (const promise of ["delete your data on request", "we will delete", "right to erasure"]) {
    assert.ok(!lower.includes(promise), `privacy page promises "${promise}"`);
  }
});

test("privacy page states the photo leaves only by the reporter's choice, and the key never leaves", () => {
  const lower = PRIVACY.toLowerCase().replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
  // The production build offers opt-in photo sharing (PR #87), so "never uploaded" would be false.
  assert.ok(!lower.includes("never uploaded"), "the photo can be shared by choice; never is false");
  assert.ok(lower.includes("not uploaded unless you choose"), "sharing must be stated as opt-in");
  assert.ok(lower.includes("deleted after 90 days"), "the retention period must be stated");
  assert.ok(lower.includes("never shown on the public"), "a shared photo is never public");
  assert.ok(lower.includes("never leaves the device"), "the signing key must be stated as on-device");
});

test("privacy page describes the selfie step as off by default and non-biometric", () => {
  const lower = PRIVACY.toLowerCase();
  assert.ok(lower.includes("switched off by default"));
  assert.ok(lower.includes("not stored"), "frames must be stated as not stored");
  assert.ok(lower.includes("biometric"), "the page must address biometric data explicitly");
});

test("privacy page discloses the AWS face check: optional, processed by AWS, no image stored, yes/no only", () => {
  // As read: tags dropped and JSX line wrapping collapsed.
  const lower = PRIVACY.toLowerCase().replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
  assert.ok(lower.includes("amazon web services") && lower.includes("amazon rekognition face liveness"), "the processor must be named");
  // The production build turns the check on (PR #97); calling it off would be false.
  assert.ok(!lower.includes("switched off in the current app"), "the check is on in the store build");
  assert.ok(lower.includes("optional"), "the check must be stated as optional");
  assert.ok(lower.includes("no face image is stored"));
  assert.ok(lower.includes("one pass/fail value"), "only a pass/fail value is kept");
  assert.ok(lower.includes("never required to send a report"), "the check must never gate reporting");
  // A liveness verdict is not identification or uniqueness; the page must not imply either.
  assert.ok(lower.includes("does not identify"));
  for (const claim of ["proves you are unique", "guarantees a unique", "identity verified", "verifies your identity"]) {
    assert.ok(!lower.includes(claim), `privacy page claims "${claim}"`);
  }
});

test("privacy page discloses the programme pass: code kept on the phone, only a list check sent", () => {
  const lower = PRIVACY.toLowerCase().replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
  assert.ok(lower.includes("programme pass"));
  assert.ok(lower.includes("in person"), "enrolment must be stated as in person");
  assert.ok(lower.includes("does not send the code"), "the code itself must be stated as not sent");
  assert.ok(lower.includes("does not reveal which"), "the check must not identify the member");
});

test("both pages state that reporting is free", () => {
  assert.ok(PRIVACY.toLowerCase().includes("reporting is free"));
  assert.ok(SUPPORT.toLowerCase().includes("free"));
});

test("support page covers the topics app review looks for", () => {
  const lower = SUPPORT.toLowerCase();
  for (const topic of ["cancel", "refund", "offline", "restore purchases"]) {
    assert.ok(lower.includes(topic), `support page does not cover "${topic}"`);
  }
});

test("support page never prints a fabricated contact address", () => {
  // The address comes from NEXT_PUBLIC_SUPPORT_EMAIL; a literal one hard-coded here would ship
  // as a dead link and fail review.
  const literalEmails = SUPPORT.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? [];
  assert.deepEqual(literalEmails, [], `hard-coded address: ${literalEmails.join(", ")}`);
  assert.ok(SUPPORT.includes("NEXT_PUBLIC_SUPPORT_EMAIL"));
});

test("neither page leaks an internal field name, key or endpoint", () => {
  for (const [name, body] of PAGES) {
    for (const leak of [
      "preciseLocationCipher",
      "mediaUri",
      "publicKey",
      "proofHash",
      "REVENUECAT_SECRET",
      "sk_live",
      "sk_test",
      "onrender.com",
      "PROGRAMME_PUBKEY",
    ]) {
      assert.ok(!body.includes(leak), `${name} page leaks ${leak}`);
    }
  }
});
