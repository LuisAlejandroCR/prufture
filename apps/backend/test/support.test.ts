// support.test.ts: the /support WhatsApp link, from a WhatsApp username (wa.me/@name) or a number
// (digits only, as wa.me wants).

import { test } from "node:test";
import assert from "node:assert/strict";
import { whatsappLink } from "../lib/support.js";

test("a username opens wa.me/@name, lowercase", () => {
  assert.equal(whatsappLink("@aleo._.o"), "https://wa.me/@aleo._.o");
  assert.equal(whatsappLink(" @AleO._.O "), "https://wa.me/@aleo._.o");
});

test("a number keeps only its digits", () => {
  assert.equal(whatsappLink("+57 300 000-0001"), "https://wa.me/573000000001");
  assert.equal(whatsappLink("+573000000001"), "https://wa.me/573000000001");
});

test("nothing configured, or something that is neither, gives no link", () => {
  assert.equal(whatsappLink(""), "");
  assert.equal(whatsappLink("  "), "");
  assert.equal(whatsappLink("@a"), "", "too short for a username");
  assert.equal(whatsappLink("@bad name!"), "");
});
