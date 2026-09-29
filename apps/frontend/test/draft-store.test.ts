// draft-store.test.ts: the one-open-draft store round-trips (persist -> load), clears, reports resume
// counts, and never throws when the backend fails. expo-file-system is swapped for an in-memory
// backend, as the suite injects fakes rather than resolving native modules under Node.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  __setDraftStoreBackend,
  clearPersistedDraft,
  hasPersistedDraft,
  loadPersistedDraft,
  persistDraft,
  readPersistedPhotoBytes,
  type DraftStoreBackend,
} from "../src/draft-store.js";
import { isResumable, type ReportDraft } from "../src/report-draft.js";

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
      bytes.set(dest, bytes.get(src) ?? new Uint8Array([9, 9, 9]));
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

function draft(over: Partial<ReportDraft> = {}): ReportDraft {
  return {
    taskId: "solar-panel-install",
    reportId: "reportid-1",
    photos: [{ uri: "file:///cam0.jpg", bytes: new Uint8Array([1, 2]), stepIndex: 0 }],
    answers: { "all-panels": "Yes" },
    note: "Two panels are shaded by a tree",
    geohash: "abcde",
    areaLabel: "Kalama District",
    preciseLocationCipher: "",
    livenessChecked: true,
    livenessVerified: false,
    livenessDegraded: false,
    livenessTicket: "",
    startedAt: 1_700_000_000_000,
    ...over,
  };
}

let mem = memBackend();
beforeEach(() => {
  mem = memBackend();
  __setDraftStoreBackend(mem.backend);
});

test("round-trips a draft: persist -> load -> deep-equal minus hydrated bytes", async () => {
  const d = draft();
  mem.bytes.set("file:///cam0.jpg", new Uint8Array([1, 2]));
  await persistDraft(d);

  const loaded = await loadPersistedDraft();
  assert.ok(loaded);
  assert.equal(loaded.taskId, d.taskId);
  assert.equal(loaded.reportId, d.reportId);
  assert.deepEqual(loaded.answers, d.answers);
  assert.equal(loaded.note, "Two panels are shaded by a tree");
  assert.equal(loaded.geohash, "abcde");
  assert.equal(loaded.areaLabel, "Kalama District");
  assert.equal(loaded.livenessChecked, true);
  assert.equal(loaded.livenessVerified, false);
  assert.equal(loaded.startedAt, d.startedAt);
  assert.equal(loaded.photos.length, 1);
  assert.equal(loaded.photos[0]!.stepIndex, 0);
  assert.equal(loaded.photos[0]!.bytes, undefined);

  // The copied photo file is readable back as bytes.
  const hydrated = await readPersistedPhotoBytes(loaded.photos[0]!.uri);
  assert.deepEqual(hydrated, new Uint8Array([1, 2]));
});

test("clearPersistedDraft wipes the store", async () => {
  await persistDraft(draft());
  assert.ok(await loadPersistedDraft());
  await clearPersistedDraft();
  assert.equal(await loadPersistedDraft(), null);
  assert.equal(await hasPersistedDraft(), null);
});

test("hasPersistedDraft reports task, photo and answer counts", async () => {
  await persistDraft(draft({ answers: { a: "1", b: "2" } }));
  const meta = await hasPersistedDraft();
  assert.deepEqual(meta, {
    taskId: "solar-panel-install",
    startedAt: 1_700_000_000_000,
    photos: 1,
    answers: 2,
  });
});

test("isResumable: stale (>24h) or empty drafts are not offered", () => {
  const now = Date.now();
  assert.equal(isResumable({ startedAt: now, photos: 1, answers: 0 }), true);
  assert.equal(isResumable({ startedAt: now, photos: 0, answers: 1 }), true);
  assert.equal(isResumable({ startedAt: now, photos: 0, answers: 0 }), false);
  assert.equal(isResumable({ startedAt: now - 25 * 3600 * 1000, photos: 3, answers: 3 }), false);
  assert.equal(isResumable(null), false);
});

test("every function is guard-wrapped: a throwing backend never propagates", async () => {
  const throwing: DraftStoreBackend = {
    async ensureDir() {
      throw new Error("fs down");
    },
    async readDraft() {
      throw new Error("fs down");
    },
    async writeDraft() {
      throw new Error("fs down");
    },
    async removeDir() {
      throw new Error("fs down");
    },
    async copyIn() {
      throw new Error("fs down");
    },
    async readBytes() {
      throw new Error("fs down");
    },
  };
  __setDraftStoreBackend(throwing);
  await assert.doesNotReject(persistDraft(draft()));
  assert.equal(await loadPersistedDraft(), null);
  assert.equal(await hasPersistedDraft(), null);
  assert.equal(await readPersistedPhotoBytes("x"), null);
  await assert.doesNotReject(clearPersistedDraft());
});

test("a missing native module (backend() returns null) makes every call a safe no-op", async () => {
  __setDraftStoreBackend(null); // default path: `await import('expo-file-system')` rejects under Node
  await assert.doesNotReject(persistDraft(draft()));
  assert.equal(await loadPersistedDraft(), null);
  assert.equal(await hasPersistedDraft(), null);
  assert.equal(await readPersistedPhotoBytes("x"), null);
});
