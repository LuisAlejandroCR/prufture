// report-draft.test.ts: the local-only reportId that groups a report's per-photo
// proofs, the capture-proof injection seam, and that saveDraft() never rejects even
// when the photo bytes cannot be read (the offline dynamic-import failure mode).

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  __setCaptureProofForTest,
  addPhoto,
  clearDraft,
  getDraft,
  newReportId,
  restoreDraft,
  resumeTarget,
  saveDraft,
  setArea,
  startDraft,
} from "../src/report-draft.js";
import {
  __setDraftStoreBackend,
  persistDraft,
  type DraftStoreBackend,
} from "../src/draft-store.js";
import { getTask } from "../src/tasks.js";

function memBackend() {
  const files = new Map<string, string>();
  const bytes = new Map<string, Uint8Array>();
  const backend: DraftStoreBackend = {
    async ensureDir() {},
    async readDraft() {
      return files.get("draft") ?? null;
    },
    async writeDraft(t) {
      files.set("draft", t);
    },
    async removeDir() {
      files.clear();
      bytes.clear();
    },
    async copyIn(src, name) {
      const dest = `mem://draft/${name}`;
      bytes.set(dest, bytes.get(src) ?? new Uint8Array([1, 2, 3]));
      return dest;
    },
    async readBytes(uri) {
      const b = bytes.get(uri);
      if (!b) throw new Error("no such file");
      return b;
    },
  };
  return { files, bytes, backend };
}

beforeEach(() => {
  __setCaptureProofForTest(null);
  __setDraftStoreBackend(memBackend().backend);
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

test("saveDraft: never rejects when a photo has no bytes and the store read throws (offline chunk-fetch failure mode)", async () => {
  __setCaptureProofForTest((async () => ({ proofHash: "h" })) as never);
  // Backend whose readBytes always throws, mimicking a rejected `import()` / unreachable file.
  __setDraftStoreBackend({
    async ensureDir() {},
    async readDraft() {
      return null;
    },
    async writeDraft() {},
    async removeDir() {},
    async copyIn(src) {
      return src;
    },
    async readBytes() {
      throw new Error("LoadBundleFromServerRequest: bundle segment unreachable");
    },
  });

  startDraft("solar-panel-install");
  addPhoto({ uri: "file:///withbytes.jpg", bytes: new Uint8Array([7]), stepIndex: 0 });
  addPhoto({ uri: "file:///nobytes.jpg", stepIndex: 1 }); // resume-style photo, bytes must be re-read

  const result = await saveDraft(); // must resolve, not reject
  assert.equal(result.saved, 1); // the one with in-memory bytes still produced a proof
  assert.equal(result.failed, 1); // the unreadable one degraded to a failure, no throw
});

test("saveDraft: returns all-failed (no throw) when no capture impl is wired", async () => {
  startDraft("solar-panel-install");
  addPhoto({ uri: "file:///a.jpg", bytes: new Uint8Array([1]), stepIndex: 0 });
  const result = await saveDraft(); // must resolve, not reject
  assert.equal(result.saved, 0);
  assert.equal(result.failed, 1);
});

test("saveDraft: still emits one proof per photo after a restore from the store", async () => {
  const mem = memBackend();
  __setDraftStoreBackend(mem.backend);
  mem.bytes.set("file:///cam0.jpg", new Uint8Array([4, 4]));
  mem.bytes.set("file:///cam1.jpg", new Uint8Array([5, 5]));

  startDraft("solar-panel-install");
  setArea("abcde", "Kalama District");
  addPhoto({ uri: "file:///cam0.jpg", bytes: new Uint8Array([4, 4]), stepIndex: 0 });
  addPhoto({ uri: "file:///cam1.jpg", bytes: new Uint8Array([5, 5]), stepIndex: 1 });
  await persistDraft(getDraft()!); // deterministic write-through

  const restored = await restoreDraft(); // overwrites `current` with the byte-less persisted copy
  assert.ok(restored);
  assert.equal(restored.photos.length, 2);
  assert.equal(restored.photos[0]!.bytes, undefined);

  let n = 0;
  __setCaptureProofForTest((async () => {
    n += 1;
    return { proofHash: `p-${n}` };
  }) as never);
  const result = await saveDraft();
  assert.equal(result.saved, 2);
  assert.equal(result.failed, 0);
});

test("resumeTarget: routes to the first incomplete step, review when complete", () => {
  const task = getTask("solar-panel-install"); // 3 photos, 2 required questions
  const base = {
    taskId: task.id,
    reportId: "r",
    photos: [] as { uri: string; stepIndex: number }[],
    answers: {} as Record<string, string>,
    geohash: "",
    areaLabel: "",
    preciseLocationCipher: "",
    livenessChecked: false,
    livenessVerified: false,
    startedAt: Date.now(),
  };
  assert.equal(resumeTarget(base, task).pathname, "/report/capture");
  assert.equal(resumeTarget(base, task).params.step, "0");

  const withPhotos = {
    ...base,
    photos: [0, 1, 2].map((i) => ({ uri: `f${i}`, stepIndex: i })),
  };
  assert.equal(resumeTarget(withPhotos, task).pathname, "/report/questions");

  const answered = { ...withPhotos, answers: { "all-panels": "Yes", "lights-work": "Yes" } };
  assert.equal(resumeTarget(answered, task).pathname, "/report/location");

  const located = { ...answered, geohash: "abcde" };
  assert.equal(resumeTarget(located, task).pathname, "/report/review");
});
