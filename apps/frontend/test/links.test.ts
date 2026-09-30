// links.test.ts: every public page the app opens is built from one configured verify base — the public
// record of a report and the site's about, privacy and support pages — so an in-app browser never
// receives a hand-typed or malformed URL, and only https (or a local dev http) links are opened.

import { test } from "node:test";
import assert from "node:assert/strict";
import { isOpenable, publicRecordUrl, siteUrl } from "../src/links.js";

const BASE = "https://prufture.voltarut.com/verify";

test("public record URL is the verify base plus the proof hash", () => {
  assert.equal(publicRecordUrl("abc123", BASE), "https://prufture.voltarut.com/verify/abc123");
  assert.equal(publicRecordUrl("abc123", `${BASE}/`), "https://prufture.voltarut.com/verify/abc123");
});

test("site pages hang off the same origin as the verify base", () => {
  assert.equal(siteUrl("privacy", BASE), "https://prufture.voltarut.com/privacy");
  assert.equal(siteUrl("support", BASE), "https://prufture.voltarut.com/support");
  assert.equal(siteUrl("", BASE), "https://prufture.voltarut.com/");
  // A base without a scheme must not throw inside a tap handler; it falls back to the default site.
  assert.equal(siteUrl("privacy", "prufture.voltarut.com/verify"), "https://prufture.voltarut.com/privacy");
  assert.equal(siteUrl("support", "/verify"), "https://prufture.voltarut.com/support");
});

test("only https, or http on a local dev host, may be opened", () => {
  assert.equal(isOpenable("https://prufture.voltarut.com/verify/x"), true);
  assert.equal(isOpenable("http://localhost:3000/verify/x"), true);
  assert.equal(isOpenable("http://192.168.68.53:3000/verify/x"), true);
  assert.equal(isOpenable("http://example.com/x"), false);
  assert.equal(isOpenable("javascript:alert(1)"), false);
  assert.equal(isOpenable("not a url"), false);
});
