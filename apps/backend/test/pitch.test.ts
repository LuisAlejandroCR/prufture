// pitch.test.ts: unit + invariant tests for the /pitch deck paging helpers and the
// vendored QR encoder. Proves: wrapIndex always lands in-range; pageFromKey maps only
// the intended keys; the QR encoder produces well-formed symbols with finder patterns
// and a quiet-zone border, and is deterministic.

import { test } from "node:test";
import assert from "node:assert/strict";
import { pageFromKey, wrapIndex } from "../app/pitch/nav.js";
import { QrCode, Ecc, qrPath } from "../app/pitch/qr.js";

test("wrapIndex: unit vectors over a 6-slide deck", () => {
  assert.equal(wrapIndex(0, 6), 0);
  assert.equal(wrapIndex(5, 6), 5);
  assert.equal(wrapIndex(6, 6), 0);
  assert.equal(wrapIndex(-1, 6), 5);
  assert.equal(wrapIndex(-6, 6), 0);
  assert.equal(wrapIndex(20, 6), 2);
});

test("wrapIndex: empty deck never divides by zero", () => {
  assert.equal(wrapIndex(3, 0), 0);
  assert.equal(wrapIndex(-3, 0), 0);
});

test("invariant (fuzz): wrapIndex output is always a valid index", () => {
  for (let i = 0; i < 5000; i++) {
    const len = 1 + Math.floor(Math.random() * 12);
    const n = Math.floor((Math.random() - 0.5) * 200);
    const r = wrapIndex(n, len);
    assert.ok(Number.isInteger(r));
    assert.ok(r >= 0 && r < len);
    assert.equal(r, ((n % len) + len) % len);
  }
});

test("pageFromKey: recognised keys map, others are null", () => {
  assert.equal(pageFromKey("ArrowRight"), "next");
  assert.equal(pageFromKey("ArrowDown"), "next");
  assert.equal(pageFromKey(" "), "next");
  assert.equal(pageFromKey("ArrowLeft"), "prev");
  assert.equal(pageFromKey("ArrowUp"), "prev");
  assert.equal(pageFromKey("Home"), "first");
  assert.equal(pageFromKey("End"), "last");
  assert.equal(pageFromKey("a"), null);
  assert.equal(pageFromKey("Enter"), null);
  assert.equal(pageFromKey("Escape"), null);
});

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
