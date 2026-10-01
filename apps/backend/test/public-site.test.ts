// public-site.test.ts: the public site's links must work for a visitor on the live deploy — the sample
// report opens a report the store holds, and share links never point at localhost.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { ProofSummary } from "../lib/api.js";
import { pickSampleHash } from "../lib/sample.js";
import { verifyBase } from "../lib/site.js";

const p = (proofHash: string, capturedAt: string, extra: Partial<ProofSummary> = {}): ProofSummary => ({
  proofHash,
  taskId: "water-pump-repair",
  geohashRegion: "d2g62",
  capturedAt,
  attestationCount: 0,
  ...extra,
});

test("pickSampleHash: the preferred hash only while the store holds it", () => {
  const list = [p("a", "2026-09-01T00:00:00Z"), p("b", "2026-09-02T00:00:00Z")];
  assert.equal(pickSampleHash(list, "a"), "a");
  assert.equal(pickSampleHash(list, "gone"), "b");
});

test("pickSampleHash: newest confirmed, then newest anchored, then newest; null when empty", () => {
  const confirmedOld = p("c-old", "2026-09-01T00:00:00Z", { attestationCount: 1, communityConfirmed: true });
  const confirmedNew = p("c-new", "2026-09-03T00:00:00Z", { attestationCount: 1, communityConfirmed: true });
  const anchored = p("anchored", "2026-09-05T00:00:00Z", { attestationCount: 1 });
  const fresh = p("fresh", "2026-09-09T00:00:00Z");
  assert.equal(pickSampleHash([confirmedOld, anchored, confirmedNew, fresh]), "c-new");
  assert.equal(pickSampleHash([anchored, fresh]), "anchored");
  assert.equal(pickSampleHash([fresh, p("bad-date", "nope")]), "fresh");
  assert.equal(pickSampleHash([]), null);
});

test("verifyBase: explicit override, else the site URL, else the live domain; never localhost by default", () => {
  assert.equal(verifyBase({ verify: "https://x.example/", site: "https://y.example" }), "https://x.example");
  assert.equal(verifyBase({ verify: "", site: "https://y.example/" }), "https://y.example");
  assert.equal(verifyBase({}), "https://prufture.voltarut.com");
});

test("the landing links its sample report through /verify/sample, never a fixed hash", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /\/verify\/\$\{/);
  assert.match(page, /"\/verify\/sample"/);
});

test("an unknown report is a real 404, and the workspace is kept out of search", () => {
  const verify = readFileSync(new URL("../app/verify/[hash]/page.tsx", import.meta.url), "utf8");
  assert.match(verify, /result\.state === "not_found"\) notFound\(\)/);
  const robots = readFileSync(new URL("../app/robots.ts", import.meta.url), "utf8");
  assert.match(robots, /disallow: \["\/dashboard", "\/sign-in", "\/invite"\]/);
});
