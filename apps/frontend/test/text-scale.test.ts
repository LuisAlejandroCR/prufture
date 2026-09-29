// text-scale.test.ts: iOS Larger Text (Dynamic Type) can grow text about 3x. Body copy must keep
// scaling; only text locked inside a fixed-size shape is capped, the way iOS itself caps tab bar
// labels. Source assertions, because these screens cannot render under Node.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { maxTextScale } from "../src/theme.js";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

test("caps stay modest: text still grows, but never past its fixed shape", () => {
  for (const v of Object.values(maxTextScale)) {
    assert.ok(v >= 1 && v <= 1.5, `cap ${v} out of range`);
  }
});

test("tab bar labels are capped and the plus glyph never scales out of its circle", () => {
  const src = read("../app/(tabs)/_layout.tsx");
  const labels = src.match(/<Text style=\{\[?styles\.label[^>]*>/g) ?? [];
  assert.equal(labels.length, 2, "expected the tab label and the Report label");
  for (const l of labels) assert.match(l, /maxFontSizeMultiplier=\{maxTextScale\.tabLabel\}/);
  assert.match(src, /<Text style=\{styles\.plus\} allowFontScaling=\{false\}/);
});

test("the photo-slot step number is capped inside its 26px circle", () => {
  const src = read("../src/components/ui.tsx");
  assert.match(src, /<Text style=\{s\.slotNumText\} maxFontSizeMultiplier=\{maxTextScale\.badge\}>/);
});

test("no Text anywhere turns scaling off except the decorative plus glyph", () => {
  const files = ["../app/(tabs)/_layout.tsx", "../src/components/ui.tsx", "../app/report/review.tsx"];
  const hits = files.flatMap((f) => read(f).match(/allowFontScaling=\{false\}/g) ?? []);
  assert.equal(hits.length, 1);
});
