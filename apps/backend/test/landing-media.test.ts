// landing-media.test.ts: static guards for the landing-page scroll-film experience.
// The test keeps every first-party clip paired with a poster and pins the accessibility
// and loading attributes that make the sequence usable on mobile and reduced motion.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";

const COMPONENT = readFileSync(new URL("../app/ScrollFilms.tsx", import.meta.url), "utf8");
const PAGE = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const HERO = readFileSync(new URL("../app/HeroPhone.tsx", import.meta.url), "utf8");
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

test("the hero phone uses the optimized real app journey and approved store icon", () => {
  for (const name of ["app-journey.mp4", "app-journey.webp", "prufture-icon.png"]) {
    const asset = new URL(name, MEDIA);
    assert.ok(existsSync(asset), `missing ${name}`);
  }

  assert.ok(statSync(new URL("app-journey.mp4", MEDIA)).size < 2_500_000, "hero journey exceeds 2.5 MB");
  assert.match(PAGE, /<HeroPhone \/>/);
  assert.match(HERO, /className="phone-journey"/);
  assert.match(HERO, /autoPlay/);
  assert.match(HERO, /loop/);
  assert.match(HERO, /muted/);
  assert.match(HERO, /playsInline/);
  assert.match(HERO, /poster="\/media\/app-journey\.webp"/);
  assert.match(HERO, /prefers-reduced-motion: reduce/);
  assert.match(HERO, /video\.play\(\)/);
  assert.match(PAGE, /src="\/media\/prufture-icon\.png"/);
  assert.doesNotMatch(PAGE, /journey-0[1-6]/, "App Store screenshots must not be used as loose landing images");
});
