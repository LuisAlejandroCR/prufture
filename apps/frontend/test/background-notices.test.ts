// background-notices.test.ts: the local notices also run while the app is closed, when iOS or Android
// wakes it (expo-background-task). Same checks as after a sync, nothing new leaves the phone, and a
// locked phone whose settings cannot be read does nothing rather than repeat a notice.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BACKGROUND_INTERVAL_MIN,
  BACKGROUND_NOTICES_TASK,
  registerBackgroundNotices,
  runBackgroundNotices,
} from "../src/background-notices.js";
import { __setNoticeStore, runReportNotices, setNoticePref } from "../src/local-notices.js";

function memStore() {
  const m = new Map<string, string>();
  return {
    m,
    async getItemAsync(k: string) {
      return m.get(k) ?? null;
    },
    async setItemAsync(k: string, v: string) {
      m.set(k, v);
    },
    async deleteItemAsync(k: string) {
      m.delete(k);
    },
  };
}

beforeEach(() => __setNoticeStore(memStore()));
afterEach(() => __setNoticeStore(null));

test("a background run reads this phone's proofs and runs the same notices", async () => {
  const seen: unknown[] = [];
  const result = await runBackgroundNotices({
    listProofs: async () => [{ proofHash: "a".repeat(64) }] as never,
    notices: async (_api, rows) => void seen.push(rows),
  });
  assert.equal(result, "success");
  assert.equal(seen.length, 1);
});

test("a failing run reports failed and never throws", async () => {
  const result = await runBackgroundNotices({
    listProofs: async () => {
      throw new Error("db locked");
    },
    notices: async () => undefined,
  });
  assert.equal(result, "failed");
});

test("locked phone: unreadable settings mean no notice at all, never a repeat", async () => {
  __setNoticeStore({
    async getItemAsync() {
      throw new Error("keychain locked");
    },
    async setItemAsync() {},
    async deleteItemAsync() {},
  });
  const shown: string[] = [];
  await runReportNotices("https://api.example.test", [], {
    show: async (t) => void shown.push(t),
    pendingRequests: async () => ["a".repeat(64)],
    fetchImpl: (async () => new Response("{}")) as unknown as typeof fetch,
    identityStep: false,
  });
  assert.deepEqual(shown, []);
});

function fakeTasks(status: 1 | 2 = 2) {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      status: async () => status,
      register: async (name: string, opts: { minimumInterval: number }) => void calls.push(`register:${name}:${opts.minimumInterval}`),
      unregister: async (name: string) => void calls.push(`unregister:${name}`),
      isRegistered: async () => calls.some((c) => c.startsWith("register")),
    },
  };
}

test("registers the task when a background notice is on and the system allows it", async () => {
  const t = fakeTasks();
  await registerBackgroundNotices(t.deps);
  assert.deepEqual(t.calls, [`register:${BACKGROUND_NOTICES_TASK}:${BACKGROUND_INTERVAL_MIN}`]);
});

test("unregisters when both background notices are off, and does nothing when restricted", async () => {
  await setNoticePref("confirmations", false);
  await setNoticePref("photoRequests", false);
  const off = fakeTasks();
  await registerBackgroundNotices({ ...off.deps, isRegistered: async () => true });
  assert.deepEqual(off.calls, [`unregister:${BACKGROUND_NOTICES_TASK}`]);
  const restricted = fakeTasks(1);
  await setNoticePref("confirmations", true);
  await registerBackgroundNotices(restricted.deps);
  assert.deepEqual(restricted.calls, []);
});

test("wiring: the task is defined at load, registered on launch and after a switch, and the plugin is listed", () => {
  const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  const define = read("src/background-task-define.ts");
  assert.match(define, /TaskManager\.defineTask\(BACKGROUND_NOTICES_TASK/);
  const layout = read("app/_layout.tsx");
  assert.match(layout, /import "\.\.\/src\/background-task-define";/);
  assert.match(layout, /registerBackgroundNotices\(\)/);
  assert.match(read("app/notifications.tsx"), /registerBackgroundNotices\(\)/);
  const plugins = JSON.parse(read("app.json")).expo.plugins.map((p: unknown) => (Array.isArray(p) ? p[0] : p));
  assert.ok(plugins.includes("expo-background-task"));
});
