// links.test.ts: every public page the app opens is built from one configured verify base — the public
// record of a report and the site's about, privacy and support pages — so an in-app browser never
// receives a hand-typed or malformed URL, and only https (or a local dev http) links are opened.

import { test } from "node:test";
import assert from "node:assert/strict";
import { isOpenable, publicRecordUrl, siteUrl } from "../src/links.js";

const BASE = "https://prufture.vercel.app/verify";

test("public record URL is the verify base plus the proof hash", () => {
  assert.equal(publicRecordUrl("abc123", BASE), "https://prufture.vercel.app/verify/abc123");
  assert.equal(publicRecordUrl("abc123", `${BASE}/`), "https://prufture.vercel.app/verify/abc123");
});

test("site pages hang off the same origin as the verify base", () => {
  assert.equal(siteUrl("privacy", BASE), "https://prufture.vercel.app/privacy");
  assert.equal(siteUrl("support", BASE), "https://prufture.vercel.app/support");
  assert.equal(siteUrl("", BASE), "https://prufture.vercel.app/");
});

test("only https, or http on a local dev host, may be opened", () => {
  assert.equal(isOpenable("https://prufture.vercel.app/verify/x"), true);
  assert.equal(isOpenable("http://localhost:3000/verify/x"), true);
  assert.equal(isOpenable("http://192.168.68.53:3000/verify/x"), true);
  assert.equal(isOpenable("http://example.com/x"), false);
  assert.equal(isOpenable("javascript:alert(1)"), false);
  assert.equal(isOpenable("not a url"), false);
});
