// support.test.ts: the /support WhatsApp link keeps only the digits wa.me accepts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { whatsappLink } from "../lib/support.js";

test("whatsappLink strips the plus, spaces and dashes", () => {
  assert.equal(whatsappLink("+57 301 393-5156"), "https://wa.me/573013935156");
  assert.equal(whatsappLink("+573013935156"), "https://wa.me/573013935156");
});

test("whatsappLink is empty when no number is configured", () => {
  assert.equal(whatsappLink(""), "");
  assert.equal(whatsappLink("  "), "");
});
