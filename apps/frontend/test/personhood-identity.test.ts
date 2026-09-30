// personhood-identity.test.ts: the programme-pass identity is created once, sealed at rest (key and
// ciphertext stored apart, plaintext never stored), and round-trips through the seal to the same
// commitment. Storage is an in-memory stand-in for expo-secure-store + expo-sqlite.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Identity } from "@semaphore-protocol/identity";
import {
  createPersonhoodIdentity,
  openIdentitySecret,
  sealIdentitySecret,
  type IdentityStorage,
} from "../src/personhood-identity";

function memoryStorage(): IdentityStorage & { key: string | null; cipher: string | null; writes: number } {
  const s = {
    key: null as string | null,
    cipher: null as string | null,
    writes: 0,
    getKey: async () => s.key,
    setKey: async (k: string) => {
      s.writes += 1;
      s.key = k;
    },
    getCipher: async () => s.cipher,
    setCipher: async (c: string) => {
      s.writes += 1;
      s.cipher = c;
    },
  };
  return s;
}

test("seal round-trip; fresh nonce each time; wrong key or tampering fails", () => {
  const key = "11".repeat(32);
  const a = sealIdentitySecret(key, "secret");
  const b = sealIdentitySecret(key, "secret");
  assert.notEqual(a, b);
  assert.equal(openIdentitySecret(key, a), "secret");
  assert.throws(() => openIdentitySecret("22".repeat(32), a));
  const flipped = a.slice(0, -2) + (a.endsWith("00") ? "01" : "00");
  assert.throws(() => openIdentitySecret(key, flipped));
});

test("identity round-trips through the seal: same commitment from a fresh instance", async () => {
  const storage = memoryStorage();
  const first = await createPersonhoodIdentity(storage).getCommitment();
  assert.match(first, /^\d+$/);
  assert.equal(storage.writes, 2);

  // A new instance (app restart) reads the sealed copy back instead of creating a new identity.
  const again = createPersonhoodIdentity(storage);
  assert.equal(await again.getCommitment(), first);
  const secret = await again.getIdentity();
  assert.equal(secret.commitment.toString(), first);
  assert.equal(storage.writes, 2);

  // What is stored is ciphertext: opening it with the stored key gives an importable private key.
  const exported = openIdentitySecret(storage.key!, storage.cipher!);
  assert.equal(Identity.import(exported).commitment.toString(), first);
  assert.ok(!storage.cipher!.includes(Buffer.from(exported).toString("hex")));
  assert.ok(!storage.cipher!.includes(secret.secretScalar.toString(16)));
});

test("concurrent first use creates exactly one identity", async () => {
  const storage = memoryStorage();
  const id = createPersonhoodIdentity(storage);
  const [a, b] = await Promise.all([id.getCommitment(), id.getCommitment()]);
  assert.equal(a, b);
  assert.equal(storage.writes, 2);
});

test("a lost key (keychain gone) yields a new identity, never a crash", async () => {
  const storage = memoryStorage();
  const first = await createPersonhoodIdentity(storage).getCommitment();
  storage.key = "33".repeat(32);
  const second = await createPersonhoodIdentity(storage).getCommitment();
  assert.notEqual(second, first);
});

test("a storage failure is not cached: the next call retries", async () => {
  const storage = memoryStorage();
  let fail = true;
  const flaky: IdentityStorage = {
    ...storage,
    getKey: async () => {
      if (fail) throw new Error("keychain locked");
      return storage.key;
    },
  };
  const id = createPersonhoodIdentity(flaky);
  await assert.rejects(id.getCommitment());
  fail = false;
  assert.match(await id.getCommitment(), /^\d+$/);
});
