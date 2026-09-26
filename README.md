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

Every external call (relayer, RPC, Neuro, WhatsApp, email) returns a typed result and never
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
- WhatsApp delivery of the verification link (Kapso); email degrades cleanly.
- Automated tests: `packages/core` 22 · `apps/api` 256 · `apps/backend` 37 · `apps/frontend` 137
  (452 total).

**Scoped next, not implemented:** on-device zero-knowledge proof (a commitment stands in); hardware
attestation / TEE signing; App/Play Store publication (config written, not run); live Neuro
verified-attribute POST (integrated with typed degradation, pending event credentials); binding the
sealed precise location and a personhood commitment into a schema v2.

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
channel carry an explicit 5 s timeout. Still open: a second, managed or self-hosted signer adapter
and its sandbox run.

### Phase 3 — split Neuro into two ports

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

As of 2026-09-26. "Done" means the code is merged and covered by tests. An exit criterion that needs
live credentials, a provider sandbox, or a programme decision is listed as open, even when the code
behind it is finished.

### Done

| Area | What is in place |
|---|---|
| Core pipeline | Offline capture → sha256 + ed25519 → SQLite queue → auto-sync; a live EAS attestation on Base Sepolia; public `/verify` and `/dashboard`; WhatsApp delivery (see *What runs today*) |
| Phase 1 — RPC | `RPC_URL`, with `DWELLIR_RPC_URL` kept as a deprecated fallback; switching provider is a configuration change |
| Phase 2 — submission | `AttestationSubmitter` port with `local-key` and `none` adapters; fail-closed allowlist (chain, contract, `attest()` selector, schema, zero value); idempotency by `proofHash` checked before any transaction; explicit RPC timeout |
| Phase 3 — assurance | Separate `LivenessPort` and `AttributePort`, with `none` and `neuro` adapters, both off by default; the minimal verdict is enforced at the port; a misbehaving adapter degrades instead of throwing |
| Phase 4 — cutover | Synthetic-only side-by-side comparison enforced in code; `shadow-compare` holds a cutover on any divergence or empty run |
| Hardening | Caps on signed field sizes at `/sync`; CSV formula injection neutralised in both exporters; store extras cannot reach `/proof`; explicit timeouts on every delivery channel; malformed bodies answer 400, never 500; a body-size cap on every route |
| Public write routes | `/notify` sends only to the fixed programme recipient, with a per-proof cooldown; `/liveness-result` records only a verdict signed by the server at `/verify-identity`, never one claimed by the caller; the liveness verdict and the sealed precise location are write-once |
| CI | Typecheck and tests on Node 20 and 22 for every push and pull request |

### Open

| Item | What it needs |
|---|---|
| Phase 1 exit criterion | Run the integration suite against a second Base Sepolia RPC endpoint, plus a failover drill. Needs a second endpoint's credentials |
| Phase 2 second adapter | A managed signer or a self-hosted relayer (e.g. OpenZeppelin Relayer) as a second adapter; one real attestation in its sandbox; a denied method/value test |
| Phase 3 `openid4vp` adapter | The current `AttributePort` is a single synchronous pull. A wallet presentation needs a request (nonce, state) and a separate wallet response, so this means new routes — an architecture decision. The plan also keeps assurance off until the pilot states why it is needed |
| Phase 3 sandbox check | One consented end-to-end check before any adapter is labelled verified |
| Phase 4 observation window | Run on a real candidate once one exists |
| `/verify-identity` attribute mode | The attribute is not bound to the proof's reporter and can be re-attached. Off by default; it is superseded by the `openid4vp` design above |
| CI runners | GitHub Actions jobs on the account stopped starting on 2026-09-26 (billing). Until they run again, `npm run verify` locally is the gate |
| Scoped next | On-device ZK proof, hardware attestation / TEE signing, store publication, live Neuro verified-attribute POST, schema v2 with the sealed precise location |
| Programme inputs | A baseline for the cost figure (reports per month, re-visit share, cost per trip) and the pilot legal preconditions — programme work, not code |

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
npm run verify   # typecheck + every workspace's tests — the same gate CI runs
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
