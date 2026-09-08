<!-- README.md: public overview of the Prufture project for FIRSTBLOCK-ATHON.
     Explains the problem, proposal, demo flow, current status, and local run path.
     It contains no private agent instructions or credentials: those stay out of the public repo. -->

# Prufture — UNICEF FIRSTBLOCK-ATHON

Prufture (formerly Proof-at-Capture) is a mobile app for field volunteers who need to capture
verifiable evidence without stable connectivity. A photo, an approximate location, and a timestamp
become a signed proof on the device, are stored in a local queue, and sync automatically when the
network returns. The backend verifies the signature and anchors only a hash on-chain. "Proof at
capture" is kept as the name of the underlying pattern.

The goal is to help initiatives like U-Report receive evidence from community tasks without exposing
personal data from volunteers and without requiring connectivity at the moment of capture.

## Problem

In many communities, connectivity is intermittent and field-work verification depends on photos,
messages, or reports that can lose context, arrive late, or be duplicated. At the same time, publishing
volunteer personal information into permanent systems or onto a blockchain would be the wrong privacy
tradeoff.

## Proposal

The app produces a minimal proof. Only these four fields ever leave the device toward the chain:

```text
proofHash    sha256 of the captured evidence
taskId       task identifier
geohash      coarse ~5-char cell (~2.4 km), never precise public coordinates
capturedAt   capture timestamp
```

The proof is signed on the device with an ed25519 key held in the operating system secure store. The
original photo or video is never published by default; the hash supports integrity verification and
the full blob is only uploaded with explicit consent. GPS is mandatory, but the precise point is
encrypted on-device to a programme-team key and is never published or put on-chain — only the coarse
cell is public.

## Demo Flow

1. The volunteer opens the app while the phone is in airplane mode.
2. They capture evidence for a field task and answer a few fixed questions.
3. The app hashes the photo, signs the proof, and stores it as `pending sync` in a local SQLite queue.
4. When the network returns, the queue syncs itself to the backend relayer.
5. The relayer verifies the signature and records a real EAS attestation on Base Sepolia via Dwellir RPC.
6. A public `/verify/<hash>` page shows the proof status without any login.
7. A second person can attest the same hash to demonstrate community verification.
8. The verification link is delivered to the programme team by WhatsApp (and email as a fallback).

## Privacy

This project does not put volunteer PII on-chain or in the public hash. The public payload is limited
to `proofHash, taskId, geohash, capturedAt`.

The project does not claim ZK proofs, TEE signing, hardware attestation, GDPR compliance, or
"deepfake-proof" liveness as implemented. The current route stores the local key in the OS secure
store (Keychain / Keystore); stronger hardware guarantees are declared as next steps. The selfie
liveness check produces a server-side `verifiedPerson` boolean only — nothing about the person is
signed or put on-chain.

## Stack

- Expo SDK 57, Expo Router, and TypeScript for the mobile app.
- `expo-camera`, `expo-location`, `expo-secure-store`, and `expo-sqlite`.
- `@noble/curves` for ed25519 signatures and `@noble/ciphers` for the sealed precise location — pure JS.
- Base Sepolia, Dwellir RPC, `viem`, and the Ethereum Attestation Service.
- A backend relayer that pays gas so the volunteer never needs a wallet.
- Next.js for the public `/verify` page, the `/dashboard`, and the `/pitch` deck.
- Neuro Agent API for a verified attribute without PII, with explicit degradation if the sandbox fails.

## Status

Hackathon build. An npm-workspaces monorepo:

- `packages/core` — shared ed25519 sign/verify and sha256 hashing.
- `apps/frontend` — the Expo mobile app (capture, sign, offline queue, auto-sync).
- `apps/api` — the relayer: signature verification, EAS attestation, notifications.
- `apps/backend` — Next.js: landing (`/`), public `/verify/[hash]`, `/dashboard`, `/pitch`.

**Runs today**

- Offline capture → sha256 + ed25519 signature (key in the OS secure store) → SQLite queue.
- Automatic sync when connectivity returns; backend verifies the signature.
- A real EAS attestation on Base Sepolia (schema #2438), tx
  `0xee879341dbb965363bf37e1c3c8b56af8fdc732902ff3f736e6389d6b0994a9b`, attestation UID
  `0x4798879a555b6442a876a9b9a9dacfd7c3a73c3bd7fb3978f492b0fd72522905`
  ([easscan](https://base-sepolia.easscan.org/attestation/view/0x4798879a555b6442a876a9b9a9dacfd7c3a73c3bd7fb3978f492b0fd72522905)).
  The on-chain decode is exactly `proofHash / taskId / geohash / capturedAt` — zero PII.
- A second attestation over the same hash (deduped by attester).
- Public `/verify/[hash]` and `/dashboard`, no login, coarse region only.
- WhatsApp delivery of the verification link (Kapso); email degrades cleanly.
- Every external call (relayer, Neuro, channels) returns a typed result and never breaks the flow.
- Automated tests: `packages/core` 2, `apps/api` 58, `apps/backend` 14, `apps/frontend` 83.

**Scoped next — not implemented**

- On-device zero-knowledge proof of an attribute — a commitment stands in; no circuit is built.
- Hardware attestation / TEE signing — the OS secure store is not the same guarantee.
- App Store / Play Store publication — the EAS build and submit config is written, not run.
- Live Neuro verified-attribute and liveness POST — integrated with typed degradation; the real
  sandbox call is pending event credentials.
- Binding the encrypted precise location and a signed personhood commitment into the payload (schema v2).

On-device runs use Expo Go during iteration and an internal EAS build for the demo. The EAS preview
APK (needs an Expo account; `eas login` then `eas init` fills `extra.eas.projectId`):

```bash
cd apps/frontend
npx eas build --profile preview --platform android
```

## Local Development

```bash
npm install
npm run typecheck
npm run test
```

Run the three services (each in its own terminal):

```bash
npm run api                              # relayer on http://localhost:8787 (degrades with no .env)
npm run dev --workspace apps/backend     # web on http://localhost:3000
cd apps/frontend && npx expo start       # mobile via Expo Go
```

With no `.env` present every external call degrades safely: `/sync` returns `synced` instead of
`attested`, and channels report unavailable. To exercise the real on-chain path, copy `.env.example`
to `apps/api/.env` and set `DWELLIR_RPC_URL`, `RELAYER_PRIVATE_KEY` (gas only, never funds), and
`EAS_SCHEMA_UID` (from `npm run register-schema --workspace apps/api`). Seed two sample proofs for the
dashboard and a `/verify` page:

```bash
npx tsx apps/api/scripts/seed.ts http://localhost:8787
```

## Repository note

Only application code and this `README.md` are public. `AGENTS.md`, `CLAUDE.md`, `LEARNINGS.md`, and
`docs/` are gitignored and stay out of the public repository.
