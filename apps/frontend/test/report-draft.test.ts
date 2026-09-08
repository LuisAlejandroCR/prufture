// report-draft.test.ts: the local-only reportId that groups a report's per-photo
// proofs. One id per draft, a fresh id per draft, and it never reaches the wire.

import { test } from "node:test";
import assert from "node:assert/strict";
import { clearDraft, getDraft, newReportId, startDraft } from "../src/report-draft.js";

test("newReportId: 16 random bytes as 32 lowercase hex chars, unique", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 2000; i += 1) {
    const id = newReportId();
    assert.match(id, /^[0-9a-f]{32}$/);
    assert.equal(seen.has(id), false);
    seen.add(id);
  }
});

test("startDraft: every draft carries one reportId", () => {
  const d = startDraft("solar-panel-install");
  assert.match(d.reportId, /^[0-9a-f]{32}$/);
  assert.equal(getDraft()?.reportId, d.reportId);
  clearDraft();
});

test("startDraft: two drafts get different reportIds", () => {
  const a = startDraft("task-a").reportId;
  const b = startDraft("task-b").reportId;
  assert.notEqual(a, b);
  clearDraft();
});
