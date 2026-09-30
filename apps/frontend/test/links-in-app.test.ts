// links-in-app.test.ts: every web link in the app opens in the in-app browser. Only WhatsApp and
// email (their own apps) and the in-app browser's own fallbacks may hand a URL to the system; the
// support contact links are exact.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { SUPPORT_EMAIL, SUPPORT_WHATSAPP, mailtoUrl, whatsappUrl } from "../src/support-contact.js";

const root = fileURLToPath(new URL("..", import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

// Files allowed to call Linking.openURL, and why.
const ALLOWED = new Map([
  ["support.tsx", "WhatsApp and mail compose open in their own apps"],
  ["coordinator.tsx", "the emailed summary opens the phone's own mail app"],
  ["links.ts", "fallback when the in-app browser is unavailable"],
  ["purchases.ts", "fallback when the native manage-subscription sheet is unavailable"],
]);

test("no screen hands a web link to the system browser", () => {
  const offenders = [...sources(join(root, "app")), ...sources(join(root, "src"))]
    .filter((f) => /Linking\.openURL\(/.test(readFileSync(f, "utf8")))
    .map((f) => basename(f))
    .filter((name) => !ALLOWED.has(name));
  assert.deepEqual(offenders, [], "use openInApp() for web pages");
});

test("the support contact links are exact", () => {
  assert.equal(SUPPORT_WHATSAPP, "+573013935156");
  assert.equal(SUPPORT_EMAIL, "luisalejandrocardenasr@gmail.com");
  assert.equal(whatsappUrl(), "https://wa.me/573013935156");
  assert.equal(whatsappUrl("+57 301 393 5156", "Hi"), "https://wa.me/573013935156?text=Hi");
  assert.equal(mailtoUrl(), "mailto:luisalejandrocardenasr@gmail.com?subject=Prufture%20support");
});

test("Help and Support both lead to a real contact", () => {
  const help = readFileSync(join(root, "app", "help.tsx"), "utf8");
  const support = readFileSync(join(root, "app", "support.tsx"), "utf8");
  assert.match(help, /router\.push\("\/support"\)/);
  assert.match(support, /whatsappUrl\(\)/);
  assert.match(support, /mailtoUrl\(\)/);
  assert.match(support, /openInApp\(siteUrl\("support"\)\)/);
});
