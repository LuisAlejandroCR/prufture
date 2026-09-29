<!-- README.md: public overview of the Prufture project for FIRSTBLOCK-ATHON.
     Leads with the impact case for community-reporting programmes generally — U-Report is the
     worked example, not the only fit — then the minimum requirements to run it.
     It contains no private agent instructions or credentials: those stay out of the public repo. -->

# Prufture

Prufture (formerly Proof-at-Capture) lets a community volunteer photograph a completed field
activity — a solar panel installed, a water pump repaired — and turn it into an independent,
privacy-preserving record: signed on the phone, queued offline, and anchored on a public chain as
nothing but a hash and three non-identifying fields. Anyone can verify the activity happened, when,
and roughly where. No one learns who reported it. The volunteer needs no wallet, no account, and no
signal at the moment of capture.

---

## Why this matters

Any programme that depends on people reporting from places with intermittent or no coverage has the
same problem. Today the proof of their work is a photo in a chat app. That photo is only as
trustable as the sender, it carries the sender's identity, and it can lose context, arrive late, or
be sent twice. So the programme either takes the report on faith or asks the reporter for
identifying data that puts them at risk. Prufture removes that trade-off, and with it a set of
recurring costs.

U-Report is the worked example throughout this README, because the project was built in response to
a UNICEF hackathon challenge and that is the channel the first pilot targets. Nothing in the design
is specific to it: the same engine fits any field-verification workload where evidence is captured
away from connectivity and the reporter's identity is a liability rather than an asset — community
health reporting, humanitarian cash and in-kind distribution, infrastructure and repair
verification, environmental monitoring, grant and subsidy milestone checks. Read "programme" below
as whichever of those you are.

### Manual verification work removed

- A programme officer no longer has to judge a loose chat photo on trust, chase the sender for
  context, or dispatch a second person to re-check routine confirmations. The signed record already
  states *what* activity, *when*, and *which ~2.4 km cell* — verifiable by anyone, with no login.
- Field-audit and re-visit trips for routine "did this happen" checks become the exception, not the
  default. Travel and staff time for those trips is the main cost Prufture is designed to avoid.

### Re-collection and duplicate handling avoided

- The offline queue means a report is never lost to a dead zone, so volunteers are not sent back to
  re-capture work that was already done.
- Each activity is anchored once. Re-sends of the same evidence collapse to the same `proofHash`, and
  a second confirmation from another volunteer is deduplicated by attester — so staff no longer spend
  time reconciling late, duplicated, or conflicting reports of the same activity.

### Reprocessing and data-protection overhead avoided

- The public record is fixed at four non-identifying fields (`proofHash`, `taskId`, coarse `geohash`,
  `capturedAt`). There is no volunteer name, phone number, face, exact location, or device id in it.
- That means no per-report redaction, no safeguarding review of volunteer identity, and no "we
  published PII and cannot take it back" incident to clean up. The precise GPS point is captured but
  sealed on-device to a key only the programme team holds; it is never published or put on-chain.

### Lower cost to onboard and run

- No wallet, no account, no ID document for the volunteer in the first pilot — nothing for a support
  desk to reset or verify.
- One capture-sign-queue-anchor engine serves any field-proof use case. U-Report is the first
  channel and UNICEF RapidPro the institutional path for the pilot, but neither is wired into the
  engine: a different programme changes the task list and the delivery channel, not the core.

### On the numbers

Prufture is built to remove the manual verification, re-collection, and PII-handling work described
above. Putting a currency figure on that saving needs a programme baseline — reports per month, share
that currently trigger a re-visit, staff cost per verification trip — which is a programme data
input, not something this repository can assert. The pilot's first job is to measure it.

---

## How it works

1. The volunteer opens the app offline and captures evidence for a task, answering a few fixed questions.
2. The app hashes the photo, signs the proof with an ed25519 key held in the OS secure store, and
   stores it as `pending sync` in a local SQLite queue.
3. When the network returns, the queue syncs itself to the backend relayer, which verifies the
   signature and records a real EAS attestation on Base Sepolia over the configured RPC endpoint
   (it pays the gas).
4. A public `/verify/<hash>` page shows the status with no login; a `/dashboard` shows the programme
   view by coarse region. A second person can attest the same hash for community verification.
5. The verification link is delivered to the programme team by WhatsApp, with email as a fallback.

Every external call (relayer, RPC, WhatsApp, email) returns a typed result and never
breaks the offline capture flow.

## Privacy posture

Designed for data minimization. Exactly four non-identifying fields leave the device toward the
chain, and the on-chain decode of the live attestation confirms it carries nothing else. This is
**not** claimed as GDPR-compliant, anonymous, ZK, TEE-backed, hardware-attested, or
"deepfake-proof". The selfie liveness check keeps a server-side boolean only — nothing about the
person is signed or put on-chain. Pilot legal pre-conditions (named controller, lawful basis,
biometric consent, retention policy) are a programme/legal workstream, not a claim this
repository makes.

Evaluating a replacement provider does not widen this posture: a side-by-side comparison run
accepts only provably synthetic proofs and refuses anything else before a candidate provider is
contacted, so no real report is ever sent to a provider under evaluation.

## What runs today

- Offline capture → sha256 + ed25519 signature (key in the OS secure store) → SQLite queue → auto-sync.
- Backend verifies the signature; a tampered payload is rejected.
- A **real EAS attestation on Base Sepolia** (schema `#2438`), tx
  `0xee879341dbb965363bf37e1c3c8b56af8fdc732902ff3f736e6389d6b0994a9b`, attestation UID
  `0x4798879a555b6442a876a9b9a9dacfd7c3a73c3bd7fb3978f492b0fd72522905`
  ([easscan](https://base-sepolia.easscan.org/attestation/view/0x4798879a555b6442a876a9b9a9dacfd7c3a73c3bd7fb3978f492b0fd72522905)).
  Decoded calldata is exactly `proofHash / taskId / geohash / capturedAt`; the relayer moves no funds.
- A second attestation over the same hash (deduped by attester).
- Public `/verify/[hash]` and `/dashboard`, no login, coarse region only.
- WhatsApp delivery of the verification link through Kapso's v24 Meta endpoint with the approved
  `report_ready` template (`apps/api/src/channels.ts`); the Meta business account is still under
  review. Email degrades cleanly.
- iOS 1.0 built with EAS (`apps/frontend/eas.json`) and submitted to App Store review on
  2026-09-29; not yet approved.
- A group-membership proof generated on the phone: a Semaphore v4 prover (depth 10, Rust +
  `circom-prover`) in `packages/zk-prover`, wrapped for iOS only by
  `apps/frontend/modules/prufture-zk`. Off by default: the reporter journey does not call it. A
  hidden benchmark route, `apps/frontend/app/zk-bench.tsx`, measured about 55 ms per proof on one
  iPhone.
- Server-side verification of those membership proofs in `apps/api/src/personhood.ts`, with
  enrolment and proof routes, off by default (enabled only by `PERSONHOOD_PROVIDER=semaphore`).
- `apps/frontend/modules/prufture-liveness` wraps AWS Face Liveness (official Swift SDK). It is
  dormant, and the server has no liveness adapter for it yet (`apps/api/src/assurance.ts` offers
  only `none`).
- Automated tests: `packages/core` 22 · `apps/api` 292 · `apps/backend` 37 · `apps/frontend` 139
  (490 total).

**Scoped next, not implemented:** hardware attestation / TEE signing; App Store approval and
Play Store publication; turning on the membership proof in the reporter journey; a server adapter
for selfie liveness and verified attributes through a chosen vendor (see *Replacing Dwellir and
Neuro*); binding the sealed precise location and a membership commitment into a schema v2.

---

## Provider portability plan

The current integration boundaries are a good start, but replacing Dwellir, the relayer, and Neuro
is not one migration. They cover five separate responsibilities: RPC transport, transaction signing
and submission, the EAS attestation protocol, liveness, and verified attributes. Prufture will keep
EAS and Base Sepolia stable while making the other four independently replaceable.

### Guardrails that do not change

- Capture, signing, and enqueueing must remain available with no network or provider.
- Every provider call must return the existing typed result and use an explicit timeout; no provider
  exception may cross into the reporter flow.
- The chain payload remains exactly `proofHash`, `taskId`, coarse `geohash`, and `capturedAt`.
- Transaction submission remains allowlisted to EAS `attest()`, with zero value, idempotency by
  `proofHash`, and no ability to move user funds.
- Liveness and attributes remain optional. Public output is a minimal verdict, never raw biometric,
  identity, confidence-score, or vendor response data.

### Phase 1 — make the RPC vendor-neutral

Introduce `RPC_URL` and temporarily accept `DWELLIR_RPC_URL` as a deprecated fallback. The viem
client and Base Sepolia chain configuration remain unchanged, so switching providers becomes a
configuration change. Validate a candidate with `eth_chainId`, one read, one real EAS `attest()`,
receipt confirmation, timeout behavior, and a failover drill. The public Base Sepolia endpoint is a
development fallback; a managed endpoint must be selected from measured latency, limits, support,
data residency, and cost rather than brand alone.

**Exit criterion:** the same integration suite passes against Dwellir and one second RPC endpoint,
and removing either endpoint still leaves offline capture working.

**Implemented:** `RPC_FALLBACK_URLS` adds endpoints that are tried in order when `RPC_URL` is down
or hung. Each endpoint has a 5 s timeout, and the whole list is retried once. The suite runs with
`npm run rpc-check --workspace apps/api -- <endpoint> ...`. It checks the chain id, that the
latest block is fresh, and that the live attestation reads back as exactly four fields. It then
checks that every endpoint reads that record identically, and drills failover past a local hung
endpoint and a refused port. `--attest` adds one real synthetic `attest()` per endpoint. Reports
show an endpoint's host only, never its path, because providers put the API key there.

The suite ran live on 2026-09-27 against `sepolia.base.org` and `base-sepolia-rpc.publicnode.com`,
and both passed. PublicNode prunes old transaction receipts, so the receipt check only warns. The
failover call answered in 5.1 s past the dead endpoints, and a list of only dead endpoints failed
in 10.2 s, within its 22 s budget. Running the suite also exposed a leak, now fixed: `/sync`
returned the RPC error verbatim, including the endpoint URL. Adapter errors are now reduced to
one line with no URL, and the port enforces that for every adapter.

### Phase 2 — separate transaction policy from key custody

Keep the existing pure EAS request builder, then place transaction submission behind an
`AttestationSubmitter` port. Start with the current local-key adapter for compatibility. Evaluate a
managed signer or a self-hosted key-management relayer as a second adapter; require an allowlist for
chain id, EAS contract, `attest()` selector, and zero transaction value. Do not call an ERC-4337
paymaster a drop-in relayer replacement: adopting one would add smart accounts and bundlers and is a
separate architecture decision. The retired OpenZeppelin Defender service is not a candidate;
OpenZeppelin Relayer is the current self-hosted successor.

**Exit criterion:** a provider sandbox submits one real attestation, duplicate submissions converge
on the same proof, a denied method/value test fails closed, and loss of the provider returns a typed
unavailable result without exposing key material.

**Implemented:** the `AttestationSubmitter` port with `local-key` and `none` adapters, the
fail-closed allowlist in `apps/api/src/submitter.ts`, and idempotency by `proofHash` in
`attestOnce()` (`apps/api/src/relayer.ts`). `/sync` and `/attest` check the store *before* the
submitter runs: a proof this relayer already anchored returns its stored record and sends nothing,
and concurrent calls for one proof share a single submission. The RPC transport and every delivery
channel carry an explicit 5 s timeout.

**Implemented (second adapter):** `ATTESTATION_SUBMITTER=openzeppelin-relayer`
(`apps/api/src/submitters/openzeppelin-relayer.ts`) hands the allowlisted `attest()` calldata to
a self-hosted [OpenZeppelin Relayer](https://docs.openzeppelin.com/relayer/quickstart), which
holds the key; `apps/api` then holds no private key at all. Before anything is queued, the
relayer's own record must be an unpaused EVM relayer on `base-sepolia` whose signer is the pinned
`OZ_RELAYER_ADDRESS`, and whose own policy allows sending only to the EAS contract
(`whitelist_receivers`). Our allowlist runs in this process; the relayer's policy is what still
holds if its API key leaks. The queued transaction must come back from that address, to the EAS
contract, with zero value. OZ Relayer confirms asynchronously, so the adapter polls for the hash
within a fixed budget. If the budget runs out, the call returns a typed unavailable and the
adapter remembers the queued transaction, so a retry re-polls it rather than paying for a second
one. That memory lasts only as long as the process.

**Sandbox run (2026-09-28).** `apps/api/sandbox/up.sh` starts an anvil fork of Base Sepolia, which
has the real EAS contract and our registered schema but no real funds. It also starts the official
`openzeppelin/openzeppelin-relayer` image, locked to EAS. `npm run submitter-sandbox --workspace
apps/api -- <adapter>` then checks the exit criterion against it:

- one real attestation, read back from EAS with the pinned attester, the allowlisted schema, and
  exactly the four fields;
- a repeat submission of the same proof leaves the signer's nonce unchanged;
- a relayer reporting a different signer is refused before anything is sent;
- the relayer itself refuses a transaction to any other address, and one that carries value;
- an unreachable relayer returns a typed unavailable with no key and no URL in it.

Both `openzeppelin-relayer` and `local-key` passed. Run on a clean start, the sandbox also caught a
relayer that disabled itself because its RPC was not up yet: the adapter refused it, and
`shadow-compare` held the cut-over.

### Phase 3 — split Neuro into two ports

**Update (2026-09-28): Neuro is removed.** It never went live, and both ports stayed off. The
liveness port keeps only its `none` adapter, so `/verify-identity` still answers, degraded, and
the app's identity step works unchanged. The verified-attribute mode of `/verify-identity` and
the `AttributePort` are gone. That mode's attribute was not bound to the proof's reporter and
could be re-attached, so `/proof` no longer serves `verifiedAttribute`, and a stored value is
dropped on load. The attribute path returns through the `openid4vp` design below. The original
plan is kept for context:

Create separate `LivenessPort` and `AttributePort` interfaces with `none` and current-Neuro adapters.
Keep both defaulted off until the pilot defines why assurance is needed. Only then evaluate concrete
adapters: liveness products must be assessed for Expo/native SDK fit, informed consent, accessibility,
biometric transit and retention, regional processing, false accept/reject behavior, and an alternate
path; attribute providers must support a minimal boolean or verifiable presentation without sending
identity data into the proof pipeline. A liveness vendor is not an attribute issuer, and one must not
be selected as a substitute for the other.

For the institutional attribute path, prefer a standards-based `openid4vp` adapter over a
vendor-specific `mosip` adapter. That adapter can accept a selectively disclosed presentation from
MOSIP's Inji wallet and verifier stack—or another compatible issuer—without requiring Prufture to
deploy a national identity system. Inji Certify and eSignet are relevant when a government or NGO
already operates the issuing and identity infrastructure; they are not prerequisites for reporting.
MOSIP is not the liveness adapter: its platform specifies biometric integration points but relies on
external biometric SDKs for the underlying matching, quality, and liveness capabilities.

The `openid4vp` adapter must validate issuer trust, audience, nonce/state, signature, expiry, and
credential status before reducing a presentation to the allowlisted boolean attribute. It must never
persist the presentation or expose its claims to the proof, public API, logs, or chain. A missing
wallet, credential, issuer, or network maps to `not_enrolled` or typed `unavailable`; it never blocks
offline capture.

**Exit criterion:** contract tests run unchanged for every adapter; unavailable assurance still saves
the report offline; hostile vendor responses cannot escape the minimal verdict; and one consented
end-to-end sandbox check is recorded before an adapter is labelled verified.

### Phase 4 — cut over one boundary at a time

Run old and new adapters only with non-sensitive synthetic proofs, compare typed outcomes and
receipts, then switch one boundary at a time behind server-side configuration. Keep the previous
adapter available for rollback through one observation window. Update tests, deployment examples,
privacy disclosures, threat model, and verification evidence in the same change. Schema v2 and a
different anchoring protocol are deliberately excluded: neither is required to remove these vendor
dependencies.

**Implemented:** `apps/api/src/cutover.ts` enforces the synthetic-only rule in code rather than
leaving it to an operator. A comparison payload must carry the reserved `synthetic-` task prefix
*and* a `proofHash` recomputable from its own public fields, so a real media hash cannot be
smuggled through by renaming the task. `compareSubmitters()` refuses a non-synthetic payload
**before either adapter is called**, which is what stops a real report from reaching a candidate
provider during an evaluation. A comparison row carries only the two adapter names, an outcome
label, and two booleans — never a receipt body, a vendor response, or key material.
`cutoverReady()` holds the switch on any divergence, and on an empty run.

Run an observation window with:

```bash
npm run shadow-compare --workspace apps/api -- <candidate> [count]
```

It exits non-zero while a cutover is held. Keep the previous adapter configured for one full
window after switching, so rollback stays a configuration change.

Useful primary references: [Base Sepolia RPC example](https://docs.base.org/cookbook/use-case-guides/finance/access-real-time-asset-data-pyth-price-feeds/),
[CDP Node](https://docs.cdp.coinbase.com/data/node/overview),
[OpenZeppelin Relayer](https://docs.openzeppelin.com/relayer/quickstart), and
[AWS Face Liveness flow and limitations](https://docs.aws.amazon.com/rekognition/latest/dg/face-liveness.html).
For the credential path, see the
[Inji Verify OpenID4VP integration guide](https://docs.inji.io/inji-verify/technical-overview/integration-guides/openid4vp-vp-verification-integration-guide),
[Inji Certify](https://github.com/inji/inji-certify), [eSignet](https://github.com/mosip/esignet),
and MOSIP's statement that the platform
[relies on external biometric SDKs](https://docs.mosip.io/1.1.5/biometrics/biometric-sdk).

---

## Plan status

As of 2026-09-28. "Done" means the code is merged and covered by tests. An exit criterion that needs
live credentials, a provider sandbox, or a programme decision is listed as open, even when the code
behind it is finished.

### Done

| Area | What is in place |
|---|---|
| Core pipeline | Offline capture → sha256 + ed25519 → SQLite queue → auto-sync; a live EAS attestation on Base Sepolia; public `/verify` and `/dashboard`; WhatsApp delivery (see *What runs today*) |
| Phase 1 — RPC | `RPC_URL`, with `DWELLIR_RPC_URL` kept as a deprecated fallback; switching provider is a configuration change; `RPC_FALLBACK_URLS` failover; the `rpc-check` suite, passed live against two independent public endpoints |
| Phase 2 — submission | `AttestationSubmitter` port with `local-key`, `openzeppelin-relayer` and `none` adapters; fail-closed allowlist (chain, contract, `attest()` selector, schema, zero value); idempotency by `proofHash` checked before any transaction; explicit RPC timeout |
| Phase 3 — assurance | Neuro removed. `LivenessPort` with a `none` adapter only, off; the minimal verdict and a throwing or non-conforming adapter are contract-tested at the port; the re-attachable verified-attribute mode is gone |
| Phase 4 — cutover | Synthetic-only side-by-side comparison enforced in code; `shadow-compare` holds a cutover on any divergence or empty run |
| Hardening | Caps on signed field sizes at `/sync`; CSV formula injection neutralised in both exporters; store extras cannot reach `/proof`; explicit timeouts on every delivery channel; malformed bodies answer 400, never 500; a body-size cap on every route; no adapter error can carry an endpoint URL |
| Public write routes | `/notify` sends only to the fixed programme recipient, with a per-proof cooldown; `/liveness-result` records only a verdict signed by the server at `/verify-identity`, never one claimed by the caller; the liveness verdict and the sealed precise location are write-once |
| CI | Typecheck and tests on Node 20 and 22 for every push and pull request |

### Open

| Item | What it needs |
|---|---|
| Phase 1 exit criterion | Two endpoints and the failover drill pass. Remaining: the managed primary chosen below, and one real `attest()` per endpoint (`rpc-check --attest`, which needs the funded gas key) |
| Phase 2 on the live testnet | The sandbox run passed on a fork. Still needed: a deployed OZ Relayer on Base Sepolia with a funded signer, `whitelist_receivers` set to EAS, and one `submitter-sandbox` run against it |
| Phase 3 `openid4vp` adapter | A two-step session port: a request (nonce, state) and a separate wallet response, so new routes. Shared with any future liveness vendor. Built only once the pilot states why assurance is needed |
| Phase 3 sandbox check | One consented end-to-end check before any adapter is labelled verified |
| Phase 4 observation window | `shadow-compare` of `local-key` against `openzeppelin-relayer` in the sandbox: READY over 5 synthetic proofs. The real window runs once the relayer is deployed; keep `local-key` configured through it |
| CI runners | GitHub Actions jobs on the account stopped starting on 2026-09-26 (billing). Until they run again, `npm run verify` locally is the gate |
| Scoped next | Membership proof on in the reporter journey (the prover exists, off by default), hardware attestation / TEE signing, App Store approval and Play Store publication, schema v2 with the sealed precise location |
| Programme inputs | A baseline for the cost figure (reports per month, re-visit share, cost per trip) and the pilot legal preconditions — programme work, not code |

### Replacing Dwellir and Neuro: vendor findings

Researched on 2026-09-27 from each vendor's own documentation. Nothing below is integrated or
contracted yet. Choosing a vendor, signing up, and giving biometric consent are programme decisions.

**RPC, replacing Dwellir.** This is a configuration change only; the code is ready.

| Candidate | Base Sepolia | Terms (vendor docs) | Role |
|---|---|---|---|
| [CDP Node](https://docs.cdp.coinbase.com/data/node/overview) (Coinbase, the operator of Base) | Yes | 10 M billing units free per month, then $0.50 per million; about 50 requests/s per project; a payment method is required from January 2026 | Recommended `RPC_URL`. The client key sits in the URL path, and the redaction above keeps it out of responses and reports |
| `https://sepolia.base.org` | Yes | Public, no key, no SLA | `RPC_FALLBACK_URLS`, first entry; passed `rpc-check` live |
| `https://base-sepolia-rpc.publicnode.com` | Yes | Public, no key, prunes old receipts | `RPC_FALLBACK_URLS`, second entry; passed `rpc-check` live |

Others on Base's [node provider list](https://docs.base.org/base-chain/tools/node-providers)
(Alchemy, QuickNode, Chainstack, Ankr, dRPC, OnFinality) can take the same slot after they pass
`rpc-check`. Cut-over: set `RPC_URL` to the CDP endpoint and `RPC_FALLBACK_URLS` to the two public
endpoints, run `rpc-check --attest`, then delete `DWELLIR_RPC_URL`.

**Liveness, replacing Neuro's liveness.** Neither vendor fits the current port. `LivenessPort.check(frames)`
sends frames the app captured itself, but both vendors run their own capture on the device.
Both use a server-created session, a native capture step on the phone, and then a server-side
result. That means a two-step port (start a session, then complete it) and an Expo dev build, not
Expo Go.

| Candidate | Client fit | What the backend receives | Notes |
|---|---|---|---|
| [AWS Rekognition Face Liveness](https://docs.aws.amazon.com/rekognition/latest/dg/face-liveness.html) | Amplify `FaceLivenessDetector` for React, iOS and Android; no official React Native SDK, so a native module is needed | A 0–100 confidence score, a reference image, and 0–4 audit images | A session [expires 3 minutes](https://docs.aws.amazon.com/rekognition/latest/APIReference/API_CreateFaceLivenessSession.html) after creation. Set `AuditImagesLimit` to 0 and no S3 output; the adapter reduces the score to `verifiedPerson` and discards the reference image. The client streams video to AWS, so it needs temporary AWS credentials |
| [iProov](https://github.com/iProov/react-native) | Official `@iproov/react-native` SDK | A pass or fail verdict via a server token (REST API v2) | Commercial terms through sales; Liveness Assurance vs Genuine Presence Assurance |
| Azure AI Face liveness | Native iOS and Android only; [Limited Access](https://learn.microsoft.com/en-us/azure/ai-services/face/concept-face-liveness-detection) approval required | — | Not recommended: gated, and no React Native path |

**Verified attributes, replacing Neuro's attribute call.** Use the planned `openid4vp` adapter, built
on [Inji Verify](https://docs.inji.io/inji-verify/technical-overview/integration-guides/openid4vp-vp-verification-integration-guide).
`inji-verify-service` is the OpenID4VP backend, and it supports both a cross-device QR flow and a
same-device flow. Its guide documents `ldp_vc` credentials (Ed25519Signature2020). The relying party
gets a transaction id and a verification status, which the adapter reduces to the allowlisted
boolean. This also needs the two-step port.

**Proposed order:** (1) the RPC cut-over, which needs only a CDP project; (2) a two-step session
port shared by liveness and attributes, with `none` adapters, behind the existing
off-by-default switch; (3) one liveness adapter and the `openid4vp` adapter, each passing a
consented sandbox check before it is labelled verified. Step (4), removing `neuro.ts`, is done.

### Evaluated, not integrated: Cavos

[Cavos](https://cavos.xyz/) provides embedded, self-custodial wallets: keys are held on the device,
there is a paymaster for gas, and there are React and React Native SDKs
([`cavos-labs/kit`](https://github.com/cavos-labs/kit)). We evaluated it on 2026-09-26 from its
public repositories and did not integrate it, because it conflicts with guardrails that do not
change:

- **Chain.** Cavos implements Starknet, Solana and Stellar. Prufture anchors EAS attestations on
  Base Sepolia (EVM), and the plan explicitly excludes switching to a different anchoring protocol.
  Its gas sponsorship is Starknet-only.
- **Identity.** A Cavos wallet is created from a stable `userId`, resolved through Google, Apple, or
  email sign-in, or through a custom auth provider. Prufture's reporter has no wallet, no account and no
  identity by design, and nothing about the reporter is signed. Adding a login to capture would
  undo the privacy posture.
- **Custody model.** Cavos signs on the user's device; the relayer here signs server-side and pays
  gas so the reporter never holds funds. Cavos would not be a drop-in `AttestationSubmitter` adapter.

Revisit Cavos if one of these becomes true:

1. It supports an EVM chain where EAS is deployed.
2. The programme decides to give its *staff* (coordinators, who are already identified) their own
   signing key for a second attestation. That would be a separate, opt-in path that never touches
   the reporter.

In either case, Cavos would enter through the same process as any other adapter: the Phase 4
synthetic-only comparison, and no reporter data sent to it during evaluation.

---

## Minimum requirements to run

- **Node.js 20 or newer** and npm (this is an npm-workspaces monorepo).
- A POSIX-ish shell. No database, no Docker, no chain access needed for the default run — every
  external call degrades to a typed "unavailable" result.
- To run the mobile app on a phone: the **Expo Go** app, or an internal EAS build (needs an Expo
  account).
- Optional, only for the real on-chain path: any Base Sepolia RPC URL and a funded gas-only key.
  The provider is a configuration choice — see the provider portability plan below.

```bash
npm install
npm run verify   # typecheck, every workspace's tests, and the production web build
```

Run the three services, each in its own terminal:

```bash
npm run api     # relayer on http://localhost:8787 (degrades safely with no .env)
npm run back    # web (/, /verify, /dashboard, /pitch) on http://localhost:3000
npm run front   # mobile via Expo Go
```

With no `.env`, `/sync` returns `synced` instead of `attested` and channels report unavailable. For
the real on-chain path, copy `.env.example` to `apps/api/.env` and set `RPC_URL` (any Base
Sepolia JSON-RPC endpoint),
`RELAYER_PRIVATE_KEY` (gas only, never funds), and `EAS_SCHEMA_UID` (from
`npm run register-schema --workspace apps/api`). Seed sample proofs for the dashboard and a
`/verify` page:

```bash
npx tsx apps/api/scripts/seed.ts http://localhost:8787
```

The EAS preview APK for on-device demos:

```bash
cd apps/frontend
npx eas build --profile preview --platform android
```

## Repository note

Only application code and this `README.md` are public. `AGENTS.md`, `CLAUDE.md`, `LEARNINGS.md`, and
`docs/` are gitignored and stay out of the public repository.
