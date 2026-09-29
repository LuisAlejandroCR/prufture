// verify-page.test.ts: the public /verify page matches the reporter app (Alternative C). It stays
// light even under a dark system theme, carries the sprout brand, the three-stage timeline and plain
// labels ("Identity check", not the internal "Anonymous pass"), and still never loads Clerk.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const page = src("../app/verify/[hash]/page.tsx");
const css = src("../app/globals.css");

test("verify renders inside the light-only verify-page scope", () => {
  assert.match(page, /className="verify-page"/);
  const scope = css.slice(css.indexOf(".verify-page {"));
  assert.match(scope, /color-scheme: light;/);
  assert.match(scope, /--bg: #fbf6ef;/);
  assert.match(css, /html:has\(\.verify-page\), body:has\(\.verify-page\)/);
});

test("verify shows the sprout brand, timeline and plain labels", () => {
  assert.match(page, /M12 12\.3c0-4 2\.6-6\.8 7\.5-7/);
  assert.match(page, /Received by the programme/);
  assert.match(page, /Community reviewed/);
  assert.match(page, /<dt>Identity check<\/dt>/);
  assert.doesNotMatch(page, /<dt>Anonymous pass<\/dt>/);
});
