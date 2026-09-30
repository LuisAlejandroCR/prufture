<!-- README.md: public Shipaton overview for Prufture.
     Presents the shipped product, RevenueCat integration, privacy boundary, and reproducible setup.
     Contains no credentials, private endpoints, internal instructions, or unverified guarantees.
     Distinct from packages/zk-prover/NOTICE.md, which only lists third-party artifact licenses. -->

# Prufture

**Offline field reporting that protects the people doing the work.**

Prufture helps a community reporter document a completed activity even when there is no signal. The
app captures evidence, signs it on the phone, saves it locally, and syncs when connectivity returns.
Programme teams get a verifiable public record without publishing the reporter's identity, exact
location, or original photo.

[Explore the live product site](https://prufture.voltarut.com/) ·
[Open the programme dashboard (staff sign-in)](https://prufture.voltarut.com/dashboard) ·
[Inspect a real attestation](https://base-sepolia.easscan.org/attestation/view/0x4798879a555b6442a876a9b9a9dacfd7c3a73c3bd7fb3978f492b0fd72522905)

> Built for the RevenueCat Shipaton 2026. Primary category: **RevenueCat Peace Prize**. Secondary
> category: **RevenueCat Design Award**.

## The problem

Field programmes often receive evidence as a photo in a chat. In low-connectivity areas that report
may arrive late, lose its context, be duplicated, or expose the sender. Teams then choose between
trusting weak evidence and collecting more personal data.

Prufture removes that trade-off:

- reporting works offline and needs no wallet;
- the phone signs the evidence before it enters a queue;
- the public record contains only `proofHash`, `taskId`, coarse `geohash`, and `capturedAt`;
- nearby reports from enrolled members, each with a verified programme pass, become community
  confirmations;
- programme staff can review activity without making the reporter public.

The first use case is community reporting inspired by UNICEF U-Report. The same workflow can support
infrastructure checks, humanitarian distributions, environmental monitoring, and grant milestones.
Prufture is an independent project and does not claim deployment by or endorsement from UNICEF.

## A report's journey

1. **Choose a mission.** The app shows nearby work using approximate areas rather than exact pins.
2. **Capture offline.** A reporter takes a photo, answers short questions, and confirms location.
3. **Protect on device.** Prufture hashes the evidence, signs the proof with an ed25519 key stored in
   the OS secure store, and saves it to SQLite as pending sync.
4. **Sync automatically.** When a connection returns, the API verifies the signature and sends an
   attest-only transaction to EAS on Base Sepolia. The relayer cannot move user funds.
5. **Verify together.** Anyone can open a public record without an account. Another report of the
   same task within 5 km counts as a community confirmation only when it carries a verified
   programme pass, so within a programme epoch each confirmation comes from a different enrolled
   member.

External services degrade without breaking capture or the local queue. Calls use explicit timeouts,
typed results, retries with backoff, and idempotency by `proofHash`.

## RevenueCat: reporting stays free, coordination scales

Prufture uses the RevenueCat React Native SDK for a coordinator subscription. Community reporting,
offline saving, syncing, and public verification remain free. The entitlement unlocks programme-team
tools:

- a cross-report coordinator inbox;
- accept or reject review decisions;
- a safe activity summary that can be emailed from the phone;
- iOS offer-code redemption from the paywall.

Entitlements are also checked server-side before coordinator data is returned. The integration fails
closed for staff-only routes and never blocks a reporter's core flow. RevenueCat Test Store support
is included for review builds.

**For reviewers:** in the app open *Me* → *Coordinator review* → *See plans*. On iOS, tap *Redeem
offer code*, enter the code supplied with the submission, then tap *Restore purchases*.

## Designed for social good

Prufture is designed for the conditions in which field evidence is hardest to collect:

- airplane-mode capture and a visible pending queue;
- large touch targets, VoiceOver labels, Larger Text support, and calm haptics;
- plain-language states such as *Ready to send*, *Sent*, *Recorded publicly*, and *Confirmed*
  (only once the community count is met);
- no crypto vocabulary in the reporter journey;
- approximate-area maps without exact-looking centre pins;
- native support and privacy explanations inside the app.

## Privacy boundary

The public and on-chain payload is deliberately small:

```text
proofHash · taskId · geohash (maximum 5 characters) · capturedAt
```

Names, phone numbers, faces, device identifiers, exact coordinates, signatures, public keys, and
original media are not public fields. The precise point is sealed on the phone for a programme team
audit. A report photo leaves the device only after explicit opt-in, is encrypted for the programme,
never appears on the public verifier or chain, and is configured for deletion after 90 days.

An optional face-liveness check stores only a pass/fail result. An optional programme pass proves
group membership without revealing which member reported. Neither feature blocks capture, saving,
or syncing.

Prufture does **not** claim GDPR compliance, hardware attestation, TEE signing, deepfake detection,
or anonymity guarantees. Those require separate technical and legal work.

## What is verified

- Offline capture, on-device SHA-256 + ed25519 signing, SQLite queue, and reconnect sync are
  implemented with automated coverage.
- The API rejects tampered proofs and over-precise geohashes before persistence or attestation.
- A real EAS attestation exists on Base Sepolia under schema `#2438`: transaction
  `0xee879341dbb965363bf37e1c3c8b56af8fdc732902ff3f736e6389d6b0994a9b`, UID
  `0x4798879a555b6442a876a9b9a9dacfd7c3a73c3bd7fb3978f492b0fd72522905`.
- Public verification, programme dashboard, community confirmations, sealed evidence, coordinator
  review, and the RevenueCat entitlement boundary are implemented.
- iOS production builds exist. Version 1.1 is under App Review; this README will not call the app
  publicly available until its App Store listing is reachable.

## Architecture

```text
Expo reporter app
  capture → local signing → SQLite queue → sync
                                          │
                                          ▼
Node API / relayer → EAS on Base Sepolia → public verifier
        │                                      │
        ├─ RevenueCat entitlement              └─ programme dashboard
        ├─ optional liveness adapter
        └─ optional delivery and sealed-evidence adapters
```

| Layer | Implementation |
|---|---|
| Mobile | Expo SDK 57, React Native, Expo Router, TypeScript |
| Local proof | SHA-256, ed25519, Expo SecureStore, SQLite |
| Membership pass | Semaphore v4 with native iOS and Android prover modules |
| API | Hono on Node.js, signature validation, durable store, attest-only relayer |
| Chain | EAS on Base Sepolia through a configurable RPC boundary |
| Web | Next.js public verifier, dashboard, privacy, support, and product site |
| Monetization | RevenueCat React Native SDK and server-side entitlement check |

## Run locally

Requirements: Node.js 20+, npm, and an iOS or Android development environment for native flows.

```bash
git clone https://github.com/LuisAlejandroCR/prufture.git
cd prufture
npm install
cp apps/api/.env.example apps/api/.env.local
cp apps/frontend/.env.example apps/frontend/.env.local
cp apps/backend/.env.example apps/backend/.env.local
npm run typecheck
npm test
```

Start each surface in a separate terminal:

```bash
npm run api
npm run back
npm run front
```

The sample environment files document optional providers. Never place server secrets in
`EXPO_PUBLIC_*` variables. Capture and local queueing work without external provider credentials;
chain submission, RevenueCat entitlements, delivery channels, and optional checks degrade honestly
when unconfigured.

## Repository map

```text
apps/frontend       Expo reporter and coordinator app
apps/api            verification API, relayer, entitlements, and provider ports
apps/backend        public verifier, programme dashboard, and product site
packages/core       canonical payload, signing, hashing, and shared contracts
packages/zk-prover   native programme-pass prover
infra               optional infrastructure templates
```

## Honest release status

The source and live web surfaces are public. The iOS app is in App Review, so the published-store
requirement for the standard Shipaton track remains pending until Apple exposes the listing. Android
store publication is not claimed. Hardware-backed signing and institutional U-Report/RapidPro
integration are future work.

## License and notices

Prufture is released under the [MIT License](LICENSE). Third-party notices required by the native programme-pass prover are preserved in
[`packages/zk-prover/NOTICE.md`](packages/zk-prover/NOTICE.md).
