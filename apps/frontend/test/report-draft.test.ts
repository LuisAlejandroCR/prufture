// report-draft.test.ts: the local-only reportId that groups a report's per-photo
// proofs, the capture-proof injection seam that replaced the crash-prone dynamic
// import(), and that saveDraft() never rejects even when a photo's bytes are missing
// (the offline LoadBundleFromServerRequest failure mode).

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  __setCaptureProofForTest,
  addPhoto,
  clearDraft,
  getDraft,
  newReportId,
  saveDraft,
  startDraft,
} from "../src/report-draft.js";

beforeEach(() => {
  __setCaptureProofForTest(null);
  clearDraft();
});

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
});

test("startDraft: two drafts get different reportIds", () => {
  const a = startDraft("task-a").reportId;
  const b = startDraft("task-b").reportId;
  assert.notEqual(a, b);
});

test("saveDraft: one proof per photo via the injected captureProof", async () => {
  let n = 0;
  __setCaptureProofForTest((async (input: { mediaBytes: Uint8Array }) => {
    n += 1;
    return { proofHash: `hash-${n}`, mediaBytes: input.mediaBytes };
  }) as never);

  startDraft("solar-panel-install");
  addPhoto({ uri: "file:///a.jpg", bytes: new Uint8Array([1]), stepIndex: 0 });
  addPhoto({ uri: "file:///b.jpg", bytes: new Uint8Array([2]), stepIndex: 1 });

  const result = await saveDraft();
  assert.equal(result.saved, 2);
  assert.equal(result.failed, 0);
  assert.equal(result.firstProofHash, "hash-1");
});

test("saveDraft: never rejects when the capture path throws LoadBundleFromServerRequest", async () => {
  __setCaptureProofForTest((async () => {
    throw new Error("LoadBundleFromServerRequest: bundle segment unreachable (id: 0)");
  }) as never);

  startDraft("solar-panel-install");
  addPhoto({ uri: "file:///a.jpg", bytes: new Uint8Array([1]), stepIndex: 0 });

  const result = await saveDraft(); // must resolve, not reject
  assert.equal(result.saved, 0);
  assert.equal(result.failed, 1);
});

test("saveDraft: returns all-failed (no throw) when no capture impl is wired", async () => {
  startDraft("solar-panel-install");
  addPhoto({ uri: "file:///a.jpg", bytes: new Uint8Array([1]), stepIndex: 0 });
  const result = await saveDraft(); // must resolve, not reject
  assert.equal(result.saved, 0);
  assert.equal(result.failed, 1);
});
