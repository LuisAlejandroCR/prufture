// keyboard.test.ts: the per-platform keyboard frame. iOS overlays the keyboard on the window, so the
// screen must pad itself and the scroll view must keep the focused field visible; Android resizes
// the window itself, so it must not pad twice.

import { test } from "node:test";
import assert from "node:assert/strict";
import { keyboardFrame } from "../src/keyboard.js";

test("iOS pads the screen above the keyboard and keeps the focused field in view", () => {
  const f = keyboardFrame("ios");
  assert.equal(f.avoidBehavior, "padding");
  assert.equal(f.adjustInsets, true);
  assert.equal(f.dismissMode, "interactive");
});

test("Android leaves resizing to the OS and dismisses on drag", () => {
  const f = keyboardFrame("android");
  assert.equal(f.avoidBehavior, undefined);
  assert.equal(f.adjustInsets, false);
  assert.equal(f.dismissMode, "on-drag");
});

test("any other platform behaves like Android, never padding twice", () => {
  assert.deepEqual(keyboardFrame("web"), keyboardFrame("android"));
});
