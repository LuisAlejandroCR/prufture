// qr.test.ts: unit tests for the vendored QR encoder behind the landing and /verify share codes:
// symbol size, finder patterns, determinism, and the quiet-zone SVG path helper.

import { test } from "node:test";
import assert from "node:assert/strict";
import { QrCode, Ecc, qrPath } from "../lib/qr.js";

test("QrCode: a short alphanumeric string is a version-1 (21x21) symbol", () => {
  const qr = QrCode.encodeText("HELLO WORLD", Ecc.MEDIUM);
  assert.equal(qr.version, 1);
  assert.equal(qr.size, 21);
});

test("QrCode: finder patterns are drawn at all three corners", () => {
  const qr = QrCode.encodeText("https://prufture.example/verify/abc123def456", Ecc.MEDIUM);
  const corners = [
    [0, 0],
    [qr.size - 7, 0],
    [0, qr.size - 7],
  ];
  for (const [ox, oy] of corners) {
    assert.equal(qr.getModule(ox + 0, oy + 0), true, "outer ring dark");
    assert.equal(qr.getModule(ox + 1, oy + 1), false, "inner ring light");
    assert.equal(qr.getModule(ox + 3, oy + 3), true, "3x3 core dark");
    assert.equal(qr.getModule(ox + 6, oy + 6), true, "outer ring dark");
  }
  // Separator between the top-left finder and the data is light.
  assert.equal(qr.getModule(7, 0), false);
  assert.equal(qr.getModule(0, 7), false);
});

test("QrCode: deterministic, and longer input needs a bigger symbol", () => {
  const a = QrCode.encodeText("https://a.example", Ecc.MEDIUM);
  const b = QrCode.encodeText("https://a.example", Ecc.MEDIUM);
  assert.equal(a.size, b.size);
  const long = QrCode.encodeText("https://a.example/" + "x".repeat(300), Ecc.MEDIUM);
  assert.ok(long.size > a.size);
  assert.ok(long.version >= 1 && long.version <= 40);
});

test("qrPath: adds a quiet-zone border and is stable", () => {
  const bare = QrCode.encodeText("https://prufture.example", Ecc.MEDIUM);
  const first = qrPath("https://prufture.example", 4);
  assert.equal(first.size, bare.size + 8);
  assert.ok(first.path.startsWith("M"));
  assert.equal(qrPath("https://prufture.example", 4).path, first.path);
});
