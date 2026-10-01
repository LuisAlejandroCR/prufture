// attach-outbox.test.ts: a report saved offline keeps its face-check ticket and sealed precise point
// across an app restart, and the next sync pass delivers them. The list used to live in memory only,
// so closing the app before signal came back lost both for good.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { __setAttachBackend, outboxAdd, outboxItems, outboxRemove, type AttachBackend } from "../src/attach-outbox.js";
import { attachLiveness, flushPendingLiveness } from "../src/liveness.js";
import { attachPreciseLocation, flushPendingPreciseLocation } from "../src/sync.js";

function memoryDisk(initial: string | null = null): AttachBackend & { text: string | null } {
  const disk = {
    text: initial,
    async read() {
      return disk.text;
    },
    async write(t: string) {
      disk.text = t;
    },
  };
  return disk;
}

/** A fetch that answers every POST with `status`, recording the paths. */
function api(status: number, seen: string[] = []) {
  return (async (url: string) => {
    seen.push(new URL(url).pathname);
    return new Response("{}", { status });
  }) as unknown as typeof fetch;
}
const offline = (async () => {
  throw new TypeError("Network request failed");
}) as unknown as typeof fetch;

let disk: ReturnType<typeof memoryDisk>;
beforeEach(() => {
  disk = memoryDisk();
  __setAttachBackend(disk);
});
afterEach(() => __setAttachBackend(null));

test("offline: the ticket and the sealed point survive an app restart and go out on the next sync", async () => {
  await attachLiveness("http://api", "proof-1", "ticket-1", offline);
  await attachPreciseLocation("http://api", "proof-1", "ab".repeat(40), offline);
  assert.ok(disk.text && disk.text.includes("proof-1"), "written to disk, not only kept in memory");

  __setAttachBackend(disk); // the app was closed and opened again: memory is empty, the disk is not
  const seen: string[] = [];
  await flushPendingLiveness("http://api", api(200, seen));
  await flushPendingPreciseLocation("http://api", api(200, seen));
  assert.deepEqual(seen.sort(), ["/liveness-result", "/precise-location"]);
  assert.equal((await outboxItems("liveness")).length, 0);
  assert.equal((await outboxItems("precise")).length, 0);
  assert.equal(JSON.parse(disk.text!).length, 0, "delivered entries are removed from disk too");
});

test("404 (proof not on the api yet) keeps the entry; 403/409 drop it, since a retry never helps", async () => {
  await attachLiveness("http://api", "p404", "t", api(404));
  assert.equal((await outboxItems("liveness")).length, 1);
  await flushPendingLiveness("http://api", api(409));
  assert.equal((await outboxItems("liveness")).length, 0);
});

test("one entry per kind and proof; a corrupt or hand-edited file is ignored, never thrown", async () => {
  await outboxAdd({ kind: "precise", proofHash: "p", value: "c1" });
  await outboxAdd({ kind: "precise", proofHash: "p", value: "c2" });
  await outboxAdd({ kind: "liveness", proofHash: "p", value: "t" });
  assert.deepEqual((await outboxItems("precise")).map((a) => a.value), ["c1"]);
  await outboxRemove("precise", "p");
  assert.equal((await outboxItems("precise")).length, 0);

  __setAttachBackend(memoryDisk("{not json"));
  assert.deepEqual(await outboxItems("liveness"), []);
  __setAttachBackend(memoryDisk(JSON.stringify([{ kind: "evil", proofHash: "x", value: "y" }, { kind: "liveness", proofHash: "ok", value: "t" }])));
  assert.deepEqual((await outboxItems("liveness")).map((a) => a.proofHash), ["ok"]);
});
