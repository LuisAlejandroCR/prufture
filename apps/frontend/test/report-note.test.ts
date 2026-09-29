// report-note.test.ts: the optional private note — sanitised and capped at 280 characters, a visible
// counter only near the limit, persisted with the open draft, kept on this phone after saving, and
// never passed to captureProof (so it can never reach the signed payload or the chain).

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  NOTE_MAX,
  __setNotesBackend,
  getLocalNote,
  noteCounter,
  sanitizeNote,
  saveLocalNote,
  type NotesBackend,
} from "../src/report-note.js";
import {
  __setCaptureProofForTest,
  addPhoto,
  clearDraft,
  getDraft,
  saveDraft,
  setNote,
  startDraft,
} from "../src/report-draft.js";
import { __setDraftStoreBackend, loadPersistedDraft, type DraftStoreBackend } from "../src/draft-store.js";

function memNotes() {
  let text: string | null = null;
  const backend: NotesBackend = {
    async read() {
      return text;
    },
    async write(t) {
      text = t;
    },
  };
  return backend;
}

function memDraftStore(): DraftStoreBackend {
  const files = new Map<string, string>();
  return {
    async ensureDir() {},
    async readDraft() {
      return files.get("draft") ?? null;
    },
    async writeDraft(t) {
      files.set("draft", t);
    },
    async removeDir() {
      files.clear();
    },
    async copyIn(src) {
      return src;
    },
    async readBytes() {
      return new Uint8Array([1]);
    },
  };
}

beforeEach(() => {
  __setNotesBackend(memNotes());
  __setDraftStoreBackend(memDraftStore());
  __setCaptureProofForTest(null);
  clearDraft();
});

test("sanitizeNote trims, drops control characters and caps at 280", () => {
  assert.equal(sanitizeNote("  pump handle is loose  "), "pump handle is loose");
  assert.equal(sanitizeNote("a\u0000b\u0007c"), "abc");
  assert.equal(sanitizeNote("line one\nline two"), "line one\nline two");
  assert.equal(sanitizeNote("x".repeat(400)).length, NOTE_MAX);
  assert.equal(sanitizeNote(""), "");
});

test("the counter appears only from 200 characters", () => {
  assert.equal(noteCounter("x".repeat(199)), null);
  assert.equal(noteCounter("x".repeat(200)), "80 characters left");
  assert.equal(noteCounter("x".repeat(279)), "1 character left");
  assert.equal(noteCounter("x".repeat(280)), "0 characters left");
});

test("setNote is stored sanitised on the draft and survives an app kill", async () => {
  startDraft("water-pump-repair");
  setNote("  handle loose  ");
  assert.equal(getDraft()?.note, "handle loose");
  await new Promise((r) => setTimeout(r, 0));
  const loaded = await loadPersistedDraft();
  assert.equal(loaded?.note, "handle loose");
});

test("saving keeps the note on this phone and never hands it to captureProof", async () => {
  const inputs: Record<string, unknown>[] = [];
  __setCaptureProofForTest((async (input: Record<string, unknown>) => {
    inputs.push(input);
    return { proofHash: `h${inputs.length}` };
  }) as never);

  const d = startDraft("water-pump-repair");
  addPhoto({ uri: "file:///a.jpg", bytes: new Uint8Array([1]), stepIndex: 0 });
  setNote("Handle is loose, water still flows");
  const result = await saveDraft();

  assert.equal(result.saved, 1);
  assert.equal(inputs.length, 1);
  for (const input of inputs) {
    assert.equal("note" in input, false);
    assert.equal(JSON.stringify(input).includes("Handle is loose"), false);
  }
  assert.equal(await getLocalNote(d.reportId), "Handle is loose, water still flows");
});

test("an empty note is not stored", async () => {
  __setCaptureProofForTest((async () => ({ proofHash: "h" })) as never);
  const d = startDraft("water-pump-repair");
  addPhoto({ uri: "file:///a.jpg", bytes: new Uint8Array([1]), stepIndex: 0 });
  setNote("   ");
  await saveDraft();
  assert.equal(await getLocalNote(d.reportId), null);
});

test("the notes store never throws, even when its backend does", async () => {
  __setNotesBackend({
    async read() {
      throw new Error("fs down");
    },
    async write() {
      throw new Error("fs down");
    },
  });
  await saveLocalNote("r1", "text");
  assert.equal(await getLocalNote("r1"), null);
});

test("the notes store keeps at most 200 reports, dropping the oldest", async () => {
  for (let i = 0; i < 205; i += 1) await saveLocalNote(`r${i}`, `note ${i}`);
  assert.equal(await getLocalNote("r0"), null);
  assert.equal(await getLocalNote("r4"), null);
  assert.equal(await getLocalNote("r5"), "note 5");
  assert.equal(await getLocalNote("r204"), "note 204");
});
