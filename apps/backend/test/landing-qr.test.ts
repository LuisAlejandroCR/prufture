// landing-qr.test.ts: static guards for the Android and iOS install cards on the landing page.
// Pins the current Android build URL, the iOS TestFlight link, and the full-screen
// QR view judges use to scan from a shared screen or across a desk.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PAGE = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const CARD = readFileSync(new URL("../app/QrCard.tsx", import.meta.url), "utf8");

test("landing points at the current Android preview build", () => {
  assert.match(
    PAGE,
    /"https:\/\/expo\.dev\/accounts\/alejoooo-team\/projects\/prufture\/builds\/18755ce0-982f-4505-87ed-97f62fa9a1c5"/,
  );
  assert.doesNotMatch(PAGE, /4bb39156-6542-44af-b2f8-1976cc90e47d/);
  assert.match(PAGE, /<QrCard href=\{ANDROID_BUILD_URL\}/);
});

test("landing offers the public TestFlight link for iOS", () => {
  assert.match(PAGE, /"https:\/\/testflight\.apple\.com\/join\/rBhq72De"/);
  assert.match(PAGE, /<QrCard href=\{IOS_TESTFLIGHT_URL\}/);
});

test("the QR opens full screen in a native dialog and can be closed", () => {
  assert.match(CARD, /^"use client";$/m);
  assert.match(CARD, /<dialog/);
  assert.match(CARD, /showModal\(\)/);
  assert.match(CARD, /aria-label="Show the QR code full screen"/);
  assert.match(CARD, /\.close\(\)/);
});
