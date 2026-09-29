// a11y-audit.test.ts: a VoiceOver lint over every screen and shared component, parsed with the
// TypeScript compiler (regexes break on `({ pressed }) =>`). Rules: every Pressable has a role; a
// Pressable with no visible Text has a label; every TextInput has a label; every Image has a label
// or is hidden; every route screen exposes at least one heading for the VoiceOver rotor.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return tsxFiles(p);
    return p.endsWith(".tsx") ? [p] : [];
  });
}

type El = ts.JsxElement | ts.JsxSelfClosingElement;

function tagName(el: El): string {
  const open = ts.isJsxElement(el) ? el.openingElement : el;
  return open.tagName.getText();
}
function attrs(el: El): Map<string, string> {
  const open = ts.isJsxElement(el) ? el.openingElement : el;
  const m = new Map<string, string>();
  for (const a of open.attributes.properties) {
    if (ts.isJsxAttribute(a)) m.set(a.name.getText(), a.initializer ? a.initializer.getText() : "true");
    else m.set("...spread", a.getText());
  }
  return m;
}
function hasTextChild(el: El): boolean {
  let found = false;
  const visit = (n: ts.Node) => {
    if (found) return;
    if ((ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) && n !== el && /^(Text|ScreenTitle)$/.test(tagName(n))) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(el, visit);
  return found;
}

interface Finding {
  file: string;
  line: number;
  rule: string;
}

function audit(file: string): { findings: Finding[]; headings: number; src: string } {
  const src = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings: Finding[] = [];
  let headings = 0;
  const rel = relative(root, file).split("\\").join("/");
  const at = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
  const visit = (n: ts.Node) => {
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
      const name = tagName(n);
      const a = attrs(n);
      if (a.get("accessibilityRole") === '"header"') headings += 1;
      const hidden = a.has("accessibilityElementsHidden") || a.get("accessible") === "{false}";
      if (name === "Pressable" && !a.has("...spread")) {
        if (!a.has("accessibilityRole")) findings.push({ file: rel, line: at(n), rule: "Pressable without accessibilityRole" });
        if (!a.has("accessibilityLabel") && !hasTextChild(n)) {
          findings.push({ file: rel, line: at(n), rule: "icon-only Pressable without accessibilityLabel" });
        }
      }
      if (name === "TextInput" && !a.has("accessibilityLabel")) {
        findings.push({ file: rel, line: at(n), rule: "TextInput without accessibilityLabel" });
      }
      if (name === "Image" && !a.has("accessibilityLabel") && !hidden) {
        findings.push({ file: rel, line: at(n), rule: "Image without accessibilityLabel (or hidden)" });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { findings, headings, src };
}

const files = [...tsxFiles(join(root, "app")), ...tsxFiles(join(root, "src", "components"))];

test("every interactive element and image is named for VoiceOver", () => {
  const findings = files.flatMap((f) => audit(f).findings);
  assert.deepEqual(
    findings.map((f) => `${f.file}:${f.line} ${f.rule}`),
    [],
  );
});

test("every route screen exposes a heading for the VoiceOver rotor", () => {
  const screens = tsxFiles(join(root, "app")).filter((f) => !/_layout\.tsx$/.test(f));
  const missing = screens.filter((f) => {
    const { headings, src } = audit(f);
    // Shared pieces that render a header role: ScreenTitle, TaskHeader, BrandMark.
    return headings === 0 && !/<(ScreenTitle|TaskHeader|BrandMark)\b/.test(src);
  });
  assert.deepEqual(missing.map((f) => relative(root, f).split("\\").join("/")), []);
});

test("changes that do not leave the screen are spoken (iOS ignores accessibilityLiveRegion)", () => {
  const read = (rel: string) => readFileSync(join(root, rel), "utf8");
  const wiring: [string, RegExp][] = [
    ["app/report/capture.tsx", /announce\(photoTaken\(stepIndex, total\)\)/],
    ["app/report/capture.tsx", /announce\(failure\(/],
    ["app/report/identity.tsx", /announce\(gesturePrompt\(/],
    ["app/report/review.tsx", /announce\(failure\(/],
    ["app/_layout.tsx", /announce\(syncResult\(summary, false\)\)/],
    ["app/_layout.tsx", /announce\(connectivityChange\(/],
    ["app/(tabs)/updates.tsx", /announce\(syncResult\(s, true\)\)/],
    ["app/status/[id].tsx", /announce\(syncResult\(s, true\)\)/],
  ];
  const missing = wiring.filter(([f, re]) => !re.test(read(f))).map(([f, re]) => `${f} ${re}`);
  assert.deepEqual(missing, []);
});

test("compound items read as one element, and state shown by colour is spoken", () => {
  const read = (rel: string) => readFileSync(join(root, rel), "utf8");
  assert.match(read("app/status/[id].tsx"), /accessible\s+accessibilityLabel=\{stageSpoken\(s\)\}/);
  assert.match(read("app/(tabs)/updates.tsx"), /style=\{styles\.contribution\}\s+accessible\s+accessibilityLabel=/);
  assert.match(read("src/components/ui.tsx"), /<View key=\{i\} style=\{s\.step\} accessible accessibilityLabel=\{label\}>/);
  // Photos keep their real colours under iOS Smart Invert.
  for (const f of ["src/components/ui.tsx", "app/report/capture.tsx"]) {
    const images = read(f).match(/<Image\b[^>]*\/>/g) ?? [];
    for (const img of images) assert.match(img, /accessibilityIgnoresInvertColors/, `${f}: ${img}`);
  }
});
