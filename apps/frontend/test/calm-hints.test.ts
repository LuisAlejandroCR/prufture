// calm-hints.test.ts: each reassurance appears once, where it matters. "Works offline" is a short fact
// on the mission line, not a card, and is not repeated on the intro; the people-privacy reminder is one
// line on the camera, where the photo is framed, not a coloured box before the report starts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const task = read("../app/task/[id].tsx");
const intro = read("../app/report/intro.tsx");
const capture = read("../app/report/capture.tsx");

test("mission screen: offline is a fact on the meta line, and there are no reassurance cards", () => {
  assert.match(task, /<Text style=\{styles\.metaText\}>Works offline<\/Text>/);
  assert.doesNotMatch(task, /title="Works offline"/);
  assert.doesNotMatch(task, /Protect people's privacy/);
});

test("intro does not repeat that the report works offline", () => {
  assert.doesNotMatch(intro, /without signal/);
});

test("camera: one privacy line, only for activities where people may be in frame", () => {
  assert.match(capture, /task\.peopleRisk \? \(/);
  assert.match(capture, /No faces, names or documents in the photo\./);
});
