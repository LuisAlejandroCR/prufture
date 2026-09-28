// landing-media.test.ts: static guards for the landing-page scroll-film experience.
// The test keeps every first-party clip paired with a poster and pins the accessibility
// and loading attributes that make the sequence usable on mobile and reduced motion.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";

const COMPONENT = readFileSync(new URL("../app/ScrollFilms.tsx", import.meta.url), "utf8");
const MEDIA = new URL("../public/media/", import.meta.url);
const SLUGS = [
  "offline-capture",
  "saved-safely",
  "signal-returns",
  "community-review",
] as const;

test("each landing film ships with a local clip and poster", () => {
  for (const slug of SLUGS) {
    assert.match(COMPONENT, new RegExp(`slug: [\"']${slug}[\"']`));

    for (const extension of ["mp4", "webp"]) {
      const asset = new URL(`${slug}.${extension}`, MEDIA);
      assert.ok(existsSync(asset), `missing ${slug}.${extension}`);
    }

    const clip = new URL(`${slug}.mp4`, MEDIA);
    assert.ok(statSync(clip).size < 2_500_000, `${slug}.mp4 exceeds the 2.5 MB budget`);
  }
});

test("scroll films preserve mobile, loading, and motion safeguards", () => {
  assert.match(COMPONENT, /muted/);
  assert.match(COMPONENT, /playsInline/);
  assert.match(COMPONENT, /preload="metadata"/);
  assert.match(COMPONENT, /prefers-reduced-motion: reduce/);
  assert.match(COMPONENT, /poster=\{`\/media\/\$\{film\.slug\}\.webp`\}/);
});
