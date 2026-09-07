<!-- README.md: public overview of the Prufture project for FIRSTBLOCK-ATHON.
     Explains the problem, proposal, demo flow, and local run path.
     It contains no private agent instructions or credentials: those stay out of the public repo. -->

# Prufture — UNICEF FIRSTBLOCK-ATHON

Prufture (formerly called Proof-at-Capture) is a mobile app for field volunteers who need to capture
verifiable evidence without stable connectivity. A photo, approximate location, and timestamp become a
signed proof on the device, are stored in a local queue, and sync automatically when the network
returns. "Proof-at-capture" is kept as the name of the underlying pattern.

The goal is to help initiatives like U-Report receive evidence from community tasks without exposing
personal data from volunteers and without requiring connectivity at the moment of capture.

## Problem

In many communities, connectivity is intermittent and field-work verification depends on photos,
messages, or reports that can lose context, arrive late, or be duplicated. At the same time, publishing
volunteer personal information into permanent systems or onto a blockchain would be the wrong privacy
tradeoff.

## Proposal

The app produces a minimal proof:

- `proofHash`: hash of the captured evidence.
- `taskId`: task identifier.
- `geohash`: approximate location, not precise public coordinates.
- `capturedAt`: capture timestamp.
- `signature`: local signature over the proof.

The original photo or video is not published by default. The hash supports integrity verification; the
full evidence blob is only uploaded with explicit consent.

## Demo Flow

1. The volunteer opens the app while the phone is in airplane mode.
2. They capture evidence for a field task.
3. The app calculates the hash, signs the proof, and stores it as pending sync.
4. When the network returns, the queue syncs through a relayer.
5. The relayer validates the signature and records an EAS attestation on Base Sepolia.
6. A public `/verify/<hash>` page shows the proof status without requiring login.
7. A second person can attest the same hash to demonstrate community verification.

## Privacy

This project does not put volunteer PII on-chain. The public payload should be limited to:

```text
proofHash, taskId, geohash, capturedAt
```

The project does not claim ZK proofs, TEE signing, or hardware attestation as already implemented. The
initial route stores the local key in the operating system secure store; stronger hardware guarantees
are declared as next steps.

## Planned Stack

- Expo SDK 54, Expo Router, and TypeScript for the mobile app.
- `expo-camera`, `expo-location`, `expo-secure-store`, and `expo-sqlite`.
- `@noble/curves` for ed25519 signatures in JavaScript.
- Base Sepolia, Dwellir RPC, `viem`, and Ethereum Attestation Service.
- Backend relayer to pay gas without requiring the volunteer to use a wallet.
- Next.js for the public verification page.
- Neuro Agent API for a verified attribute without PII, with explicit degradation if the sandbox fails.

## Status

Hackathon build in progress. An npm-workspaces monorepo is scaffolded: `packages/core` (shared
ed25519 sign/verify and sha256 hash), `apps/frontend` (Expo mobile app), `apps/api` (relayer), and
`apps/backend` (Next.js verification page). Early work on offline capture and the relayer exists on
feature branches; the on-chain attestation has not yet been run against a live network.

Acceptance criteria for the demo:

- Capture, sign, and enqueue without internet.
- Sync automatically when connectivity returns.
- Record a real attestation on Base Sepolia.
- Show the hash on a public verification page.
- Allow a second attestation over the same hash.
- Keep PII out of the chain, public hash, and external payloads.

## Local Development

```bash
npm install
npm run typecheck
npm run test
```

The mobile demo uses Expo Go during iteration and an internal EAS build for presentation.
