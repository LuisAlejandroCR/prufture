// evidence-storage.test.ts: the SigV4 signer matches AWS's published S3 example, the adapter maps
// GET 404 to "absent" and DELETE 404 to success, and the evidence side data round-trips through the
// store file under its reserved "__evidence__" key without changing the frozen hash->Entry shape.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { objectUrl, s3Storage, signV4 } from "../src/evidence-storage.js";
import {
  __flushForTests,
  __setStorePathForTests,
  allProofs,
  getEvidenceRecord,
  getProof,
  putEvidenceRecord,
  upsertProof,
} from "../src/store.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function tempStore(): string {
  const dir = mkdtempSync(join(tmpdir(), "prufture-evidence-store-"));
  dirs.push(dir);
  return join(dir, "store.json");
}

test("signV4 reproduces the AWS S3 'GET Object' example signature", () => {
  // docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html, example "GET Object".
  const auth = signV4({
    method: "GET",
    url: new URL("https://examplebucket.s3.amazonaws.com/test.txt"),
    headers: {
      host: "examplebucket.s3.amazonaws.com",
      range: "bytes=0-9",
      "x-amz-content-sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "x-amz-date": "20130524T000000Z",
    },
    payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    region: "us-east-1",
    service: "s3",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  });
  assert.equal(
    auth,
    "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, " +
      "SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, " +
      "Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
  );
});

const cfg = {
  endpoint: "https://acct.r2.example.test/",
  bucket: "bucket",
  region: "auto",
  accessKeyId: "AKID",
  secretAccessKey: "SECRET",
};

test("objectUrl is path-style and segment-encoded", () => {
  assert.equal(objectUrl(cfg, "evidence/abc").href, "https://acct.r2.example.test/bucket/evidence/abc");
});

test("adapter: GET 404 is ok(null), DELETE 404 is success, other errors are typed unavailable", async () => {
  const status = { value: 404 };
  const fetchStub = (async () => new Response("", { status: status.value })) as unknown as typeof fetch;
  const s = s3Storage(cfg, () => fetchStub, () => new Date("2026-09-29T00:00:00Z"));
  const got = await s.get("evidence/x");
  assert.equal(got.available, true);
  assert.equal(got.data, null);
  assert.equal((await s.delete("evidence/x")).available, true);
  status.value = 403;
  const denied = await s.get("evidence/x");
  assert.equal(denied.available, false);
  assert.ok(!(denied.error ?? "").includes("SECRET"));
  const thrown = await s3Storage(cfg, () => (async () => { throw new Error("offline"); }) as unknown as typeof fetch).put("k", new Uint8Array(3));
  assert.equal(thrown.available, false);
});

test("store: __evidence__ round-trips, is whitelisted on load, and never becomes an Entry", () => {
  const path = tempStore();
  __setStorePathForTests(path);
  const hash = "7".repeat(64);
  upsertProof({ proofHash: hash, taskId: "t", geohash: "u4pru", capturedAt: "2026-01-01T00:00:00Z" });
  putEvidenceRecord(hash, {
    requestedAt: "2026-09-01T00:00:00.000Z",
    storedAt: "2026-09-02T00:00:00.000Z",
    bytes: 1234,
    cipherSha256: "a".repeat(64),
    tokenHash: "b".repeat(64),
  });
  __flushForTests();

  const file = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  assert.deepEqual(Object.keys(file).sort(), [hash, "__evidence__"].sort());
  assert.ok(!("evidence" in (file[hash] as object)), "Entry shape unchanged");

  __setStorePathForTests(path); // reload from disk
  assert.deepEqual(getEvidenceRecord(hash), {
    requestedAt: "2026-09-01T00:00:00.000Z",
    storedAt: "2026-09-02T00:00:00.000Z",
    bytes: 1234,
    cipherSha256: "a".repeat(64),
    tokenHash: "b".repeat(64),
  });
  assert.ok(getProof(hash));
  assert.equal(allProofs().length, 1, "__evidence__ is not loaded as a proof");

  // Hand-edited junk in the side data is dropped field by field.
  const edited = JSON.parse(readFileSync(path, "utf8")) as Record<string, Record<string, Record<string, unknown>>>;
  edited.__evidence__![hash] = {
    storedAt: "2026-09-02T00:00:00.000Z",
    cipherSha256: "not-hex",
    tokenHash: "B".repeat(64),
    plaintextPhoto: "/9j/4AAQSkZJRg",
    bytes: -1,
  };
  writeFileSync(path, JSON.stringify(edited));
  __setStorePathForTests(path);
  assert.deepEqual(getEvidenceRecord(hash), { storedAt: "2026-09-02T00:00:00.000Z" });
});
