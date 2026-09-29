// camera-frame.test.ts: the live camera is the one dark screen. On iOS its status bar must be light,
// its controls must clear the notch / Dynamic Island and the home indicator, and every text colour on
// the dark ground must pass WCAG AA (4.5:1).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cameraFramePadding } from "../src/camera-frame.js";
import { cameraColor, space } from "../src/theme.js";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

test("every camera text colour passes AA on the dark ground", () => {
  for (const key of ["text", "step", "hint", "control"] as const) {
    const ratio = contrast(cameraColor[key], cameraColor.ground);
    assert.ok(ratio >= 4.5, `${key} ${cameraColor[key]} is ${ratio.toFixed(2)}:1`);
  }
});

test("cameraFramePadding clears the Dynamic Island and the home indicator", () => {
  assert.deepEqual(cameraFramePadding({ top: 59, bottom: 34 }), { top: 59 + space.sm, bottom: 34 + space.lg });
  // No inset (older iPhone / Android without edge-to-edge): a small floor, never flush with the edge.
  assert.deepEqual(cameraFramePadding({ top: 0, bottom: 0 }), { top: space.md + space.sm, bottom: space.lg });
});

test("the live camera sets a light status bar, uses the insets and no raw hex", () => {
  const src = read("../app/report/capture.tsx");
  assert.match(src, /<StatusBar style="light" \/>/);
  assert.match(src, /cameraFramePadding\(insets\)/);
  assert.match(src, /<BackLink label="Cancel" tone="onDark"/);
  assert.equal(/#[0-9A-Fa-f]{6}/.test(src), false, "camera colours must come from cameraColor in src/theme.ts");
});
