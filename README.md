<!-- README.md: public overview of the Prufture project for FIRSTBLOCK-ATHON.
     Leads with the UNICEF / U-Report impact case, then the minimum requirements to run it.
     It contains no private agent instructions or credentials: those stay out of the public repo. -->

# Prufture

Prufture (formerly Proof-at-Capture) lets a U-Report volunteer photograph a completed field
activity — a solar panel installed, a water pump repaired — and turn it into an independent,
privacy-preserving record: signed on the phone, queued offline, and anchored on a public chain as
nothing but a hash and three non-identifying fields. Anyone can verify the activity happened, when,
and roughly where. No one learns who reported it. The volunteer needs no wallet, no account, and no
signal at the moment of capture.

---

## Why this matters to UNICEF

U-Report runs on community members reporting from places with intermittent or no coverage. Today the
proof of their work is a photo in a chat app. That photo is only as trustable as the sender, it
carries the sender's identity, and it can lose context, arrive late, or be sent twice. So the
programme either takes the report on faith or asks the volunteer for identifying data that puts them
at risk. Prufture removes that trade-off, and with it a set of recurring costs.

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
- One capture-sign-queue-anchor engine serves any NGO field-proof use case, with U-Report as the
  first channel and UNICEF RapidPro as the institutional path — it is not a single-programme build.

### On the numbers

Prufture is built to remove the manual verification, re-collection, and PII-handling work described
above. Putting a currency figure on that saving needs a programme baseline — reports per month, share
that currently trigger a re-visit, staff cost per verification trip — which is a UNICEF data input,
not something this repository can assert. The pilot's first job is to measure it.

---

## How it works

1. The volunteer opens the app offline and captures evidence for a task, answering a few fixed questions.
2. The app hashes the photo, signs the proof with an ed25519 key held in the OS secure store, and
   stores it as `pending sync` in a local SQLite queue.
3. When the network returns, the queue syncs itself to the backend relayer, which verifies the
   signature and records a real EAS attestation on Base Sepolia via Dwellir RPC (it pays the gas).
4. A public `/verify/<hash>` page shows the status with no login; a `/dashboard` shows the programme
   view by coarse region. A second person can attest the same hash for community verification.
5. The verification link is delivered to the programme team by WhatsApp, with email as a fallback.

Every external call (relayer, Dwellir, Neuro, WhatsApp, email) returns a typed result and never
breaks the offline capture flow.

## Privacy posture

Designed for data minimization. Exactly four non-identifying fields leave the device toward the
chain, and the on-chain decode of the live attestation confirms it carries nothing else. This is
**not** claimed as GDPR-compliant, anonymous, ZK, TEE-backed, hardware-attested, or
"deepfake-proof". The selfie liveness check keeps a server-side boolean only — nothing about the
person is signed or put on-chain. Pilot legal pre-conditions (named controller, lawful basis,
biometric consent, retention policy) are a UNICEF/legal workstream.

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
- Automated tests: `packages/core` 8 · `apps/api` 92 · `apps/backend` 29 · `apps/frontend` 135
  (264 total).

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

### Phase 3 — split Neuro into two ports

Create separate `LivenessPort` and `AttributePort` interfaces with `none` and current-Neuro adapters.
Keep both defaulted off until the pilot defines why assurance is needed. Only then evaluate concrete
adapters: liveness products must be assessed for Expo/native SDK fit, informed consent, accessibility,
biometric transit and retention, regional processing, false accept/reject behavior, and an alternate
path; attribute providers must support a minimal boolean or verifiable presentation without sending
identity data into the proof pipeline. A liveness vendor is not an attribute issuer, and one must not
be selected as a substitute for the other.

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

Useful primary references: [Base Sepolia RPC example](https://docs.base.org/cookbook/use-case-guides/finance/access-real-time-asset-data-pyth-price-feeds/),
[CDP Node](https://docs.cdp.coinbase.com/data/node/overview),
[OpenZeppelin Relayer](https://docs.openzeppelin.com/relayer/quickstart), and
[AWS Face Liveness flow and limitations](https://docs.aws.amazon.com/rekognition/latest/dg/face-liveness.html).

---

## Minimum requirements to run

- **Node.js 20 or newer** and npm (this is an npm-workspaces monorepo).
- A POSIX-ish shell. No database, no Docker, no chain access needed for the default run — every
  external call degrades to a typed "unavailable" result.
- To run the mobile app on a phone: the **Expo Go** app, or an internal EAS build (needs an Expo
  account).
- Optional, only for the real on-chain path: a Base Sepolia RPC URL (Dwellir) and a funded
  gas-only key.

```bash
npm install
npm run typecheck
npm run test
```

Run the three services, each in its own terminal:

```bash
npm run api     # relayer on http://localhost:8787 (degrades safely with no .env)
npm run back    # web (/, /verify, /dashboard, /pitch) on http://localhost:3000
npm run front   # mobile via Expo Go
```

With no `.env`, `/sync` returns `synced` instead of `attested` and channels report unavailable. For
the real on-chain path, copy `.env.example` to `apps/api/.env` and set `DWELLIR_RPC_URL`,
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
