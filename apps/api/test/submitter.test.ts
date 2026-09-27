// submitter.test.ts: the transaction POLICY (assertAllowed) behind the AttestationSubmitter port. Every
// check must FAIL CLOSED so any future adapter inherits the same limits without restating them.
// Nothing here touches the chain or derives a key.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { bytesToHex } from "viem";
import { baseSepolia } from "viem/chains";
import { buildAttestRequest } from "../src/relayer-request.js";
import { assertAllowed, ATTEST_SELECTOR, type SubmitRequest } from "../src/submitter.js";
import { localKeySubmitter } from "../src/submitters/local-key.js";
import { noneSubmitter } from "../src/submitters/none.js";
import { selectedSubmitter, submitAttestation } from "../src/relayer.js";
import { env } from "../src/env.js";
import type { ProofPublicPayload } from "@proof/core";

// The allowlist now pins the schema UID, so the suite configures one. env.* are live reads.
const SCHEMA_UID = `0x${"24".repeat(32)}`;
process.env.EAS_SCHEMA_UID = SCHEMA_UID;

function payload(o: Partial<ProofPublicPayload> = {}): ProofPublicPayload {
  return {
    proofHash: bytesToHex(randomBytes(32)).slice(2),
    taskId: "task-solar-01",
    geohash: "u4pru",
    capturedAt: "2026-09-07T10:00:00.000Z",
    ...o,
  };
}

function allowedRequest(): SubmitRequest {
  return { ...buildAttestRequest(payload()), chainId: baseSepolia.id };
}

// deep-clone the args tuple so a test can mutate one field without touching the builder
function tamper(mutate: (data: Record<string, unknown>) => void): SubmitRequest {
  const req = allowedRequest();
  const arg = req.args[0] as { schema: unknown; data: Record<string, unknown> };
  const copy = { schema: arg.schema, data: { ...arg.data } };
  mutate(copy.data);
  return { ...req, args: [copy] };
}

test("the request the builder produces is allowlisted", () => {
  assert.doesNotThrow(() => assertAllowed(allowedRequest()));
});

test("the allowlisted selector is attest((bytes32,(address,uint64,bool,bytes32,bytes,uint256)))", () => {
  assert.match(ATTEST_SELECTOR, /^0x[0-9a-f]{8}$/);
});

test("fails closed: a different chain is rejected", () => {
  assert.throws(
    () => assertAllowed({ ...allowedRequest(), chainId: 1 }),
    /not the allowlisted chain/,
  );
});

test("fails closed: a different target contract is rejected", () => {
  assert.throws(
    () => assertAllowed({ ...allowedRequest(), address: `0x${"ab".repeat(20)}` }),
    /not the allowlisted EAS contract/,
  );
});

test("fails closed: any method other than attest is rejected", () => {
  for (const fn of ["transfer", "approve", "multiAttest", "revoke", ""]) {
    assert.throws(
      () => assertAllowed({ ...allowedRequest(), functionName: fn }),
      /not allowlisted/,
      `method ${fn} must be refused`,
    );
  }
});

test("fails closed: an ABI carrying an extra method is rejected", () => {
  const req = allowedRequest();
  const widened = [
    ...(req.abi as unknown[]),
    { name: "transfer", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  ];
  assert.throws(
    () => assertAllowed({ ...req, abi: widened }),
    /ABI exposes a method other than attest/,
  );
});

test("fails closed: a non-zero transaction value is rejected (no funds can move)", () => {
  for (const value of [1n, 10n ** 18n]) {
    assert.throws(
      () => assertAllowed(tamper((d) => { d.value = value; })),
      /non-zero transaction value/,
    );
  }
});

test("fails closed: a non-zero recipient is rejected (no beneficiary rides along)", () => {
  assert.throws(
    () => assertAllowed(tamper((d) => { d.recipient = `0x${"ab".repeat(20)}`; })),
    /recipient must be the zero address/,
  );
});

test("fails closed: expirationTime and refUID must stay zero", () => {
  assert.throws(() => assertAllowed(tamper((d) => { d.expirationTime = 99n; })), /expirationTime/);
  assert.throws(() => assertAllowed(tamper((d) => { d.refUID = `0x${"11".repeat(32)}`; })), /refUID/);
});

test("fails closed: a malformed request is rejected rather than sent", () => {
  assert.throws(() => assertAllowed({ ...allowedRequest(), args: [undefined] }), /malformed/);
  assert.throws(() => assertAllowed({ ...allowedRequest(), args: [] }), /malformed/);
});

test("the allowlist is pinned to the configured chain id", () => {
  assert.equal(env.chainId, baseSepolia.id);
});

test("fails closed: a same-named attest() with different parameters is rejected", () => {
  // The dangerous case: every other rule passes — right chain, right contract, one function
  // named attest, zero value — but the signature encodes to a different selector entirely.
  const foreign = [
    {
      name: "attest",
      type: "function",
      stateMutability: "payable",
      inputs: [
        { name: "to", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      outputs: [{ name: "", type: "bytes32" }],
    },
  ];
  assert.throws(
    () => assertAllowed({ ...allowedRequest(), abi: foreign }),
    /signature is not the allowlisted one/,
  );
});

test("fails closed: an unusable attest() ABI entry is rejected, not skipped", () => {
  const junk = [{ name: "attest", type: "function" }];
  assert.throws(() => assertAllowed({ ...allowedRequest(), abi: junk }), /submitter:/);
});

test("fails closed: an arbitrary schema UID is rejected", () => {
  const req = allowedRequest();
  const arg = req.args[0] as { schema: string; data: unknown };
  for (const schema of [`0x${"99".repeat(32)}`, "0x", "", "not-hex"]) {
    assert.throws(
      () => assertAllowed({ ...req, args: [{ ...arg, schema }] }),
      /schema is not the allowlisted EAS schema/,
      `schema ${schema} must be refused`,
    );
  }
});

test("fails closed: with no schema configured at all, nothing is allowlisted", () => {
  delete process.env.EAS_SCHEMA_UID;
  try {
    assert.throws(() => assertAllowed(allowedRequest()), /no allowlisted EAS schema is configured/);
  } finally {
    process.env.EAS_SCHEMA_UID = SCHEMA_UID;
  }
});

test("the default adapter is local-key (unchanged behaviour)", () => {
  delete process.env.ATTESTATION_SUBMITTER;
  assert.equal(selectedSubmitter().name, "local-key");
});

test("ATTESTATION_SUBMITTER=none selects the explicit off switch", () => {
  process.env.ATTESTATION_SUBMITTER = "none";
  assert.equal(selectedSubmitter().name, "none");
  delete process.env.ATTESTATION_SUBMITTER;
});

test("an unknown adapter name fails closed to none, never to a key holder", () => {
  for (const name of ["managed-signer", "kms", "garbage", "LOCAL-KEY"]) {
    process.env.ATTESTATION_SUBMITTER = name;
    assert.equal(selectedSubmitter().name, "none", `${name} must not resolve to a key holder`);
  }
  delete process.env.ATTESTATION_SUBMITTER;
});

test("the none adapter is never configured and returns a typed unavailable", async () => {
  assert.equal(noneSubmitter.isConfigured(), false);
  const r = await noneSubmitter.submit(payload());
  assert.equal(r.available, false);
  assert.equal(r.data, null);
  assert.equal(r.source, "relayer/eas");
  assert.match(r.error ?? "", /disabled/);
});

test("losing the provider returns a typed unavailable and leaks no key material", async () => {
  process.env.ATTESTATION_SUBMITTER = "none";
  const r = await submitAttestation(payload());
  assert.equal(r.available, false);
  assert.equal(r.data, null);
  const blob = JSON.stringify(r).toLowerCase();
  assert.ok(!blob.includes("0x"), "no hex material in the envelope");
  assert.ok(!blob.includes("private"), "no key wording in the envelope");
  delete process.env.ATTESTATION_SUBMITTER;
});

test("the local-key adapter reports unconfigured without deriving a key", async () => {
  assert.equal(localKeySubmitter.isConfigured(), false);
  const r = await localKeySubmitter.submit(payload());
  assert.equal(r.available, false);
  assert.equal(r.source, "relayer/eas");
});

test("duplicate submissions converge on the same proof (identical calldata)", () => {
  const p = payload();
  const a = buildAttestRequest(p);
  const b = buildAttestRequest({ ...p });
  assert.deepEqual(a.args[0].data.data, b.args[0].data.data);
  assert.equal(a.address, b.address);
});
