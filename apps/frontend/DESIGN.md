<!-- apps/frontend/DESIGN.md: design tokens and rules for the Prufture reporter app.
     Covers the guided report flow and the five bottom-nav screens.
     Distinct from apps/backend/DESIGN.md, which governs the public web verifier and dashboard. -->

# Design - Prufture mobile

Humanitarian field tool, not a startup splash. Calm, guided, one task per screen. The reporter
never needs to know anything about wallets, keys, hashes, or chains.

## Dials

- DESIGN_VARIANCE 4: mostly conventional vertical layout; asymmetry only where it aids focus
  (the raised Report control in the tab bar, the recommended-task card on Home).
- MOTION_INTENSITY 2: state transitions only (queue row ease-in, help row expand, stack slide).
  Respects reduce-motion via `AccessibilityInfo.isReduceMotionEnabled`. No gradients.
- VISUAL_DENSITY 3: large targets, generous spacing, one primary action visible at a time.

## Tokens

All tokens live in `src/theme.ts`. Screens import `color`, `space`, `radius`, `shadow`, `type`,
`target`, `motion`, `statusStyle`, `friendlyStatus` and never inline raw hex or px. This is the
same one warm palette used by `apps/backend/app/globals.css`.

- Colour: ivory ground `#FBF6EF`, white surface, `surfaceSoft #F7F2EA`, `border #EDE5D8`,
  text `#1C1208`, muted `#806F5C`, `disabled #B8A998`. Primary terracotta `#C8533A`
  (`primarySoft #FDF0EC`). Status: sage `#3D9970` = confirmed / privacy-safe, amber `#C88720`
  = waiting / attention, blue `#2982A1` = sending / info, pink `#C04B7A` = **health category
  only**. No gradients.
- WCAG AA (computed 2026-09-07): text on ivory 15.0:1, on white 16.1:1; muted `#806F5C` on
  ivory 4.50:1, on white 4.83:1 (pass, body). `StatusPill` and `Notice` render their label in
  `color.text`; the hue is carried by the dot / icon only, so no soft-tint text pair below
  4.5:1 is ever used. `disabled` is decorative / disabled-state only.
- Type scale: display 28 / title 20 / subtitle 17 / body 15 / meta 13 / label 11 / action 17.
- Spacing: 4 / 8 / 12 / 16 / 24 / 40. Radius: 10 / 14 / 20 / pill.
- Targets: 44px minimum, 56px for the primary and capture buttons.

## Product language

The reporter journey uses friendly words only. `friendlyStatus()` maps the stored queue status
to: Ready to send / Sending / Sent / Waiting for another report / Confirmed / Needs your attention.
The words blockchain, wallet, gas, relayer, hash, signature, attestation, transaction, and
zero-knowledge do not appear in any screen. `status/[id].tsx` keeps a collapsed "Technical
details" section for demo or expert users; it still shows no PII and no exact location.

## Icons

`src/components/icons/Icon.tsx` is the single SVG set (`react-native-svg`), one 24x24 grid, 2px
stroke, rounded caps. Unselected nav icons are outlined + `muted`; selected are filled `primary`
on a `primarySoft` pill. Every icon-only control carries an `accessibilityLabel`. No emoji as
interface icons.

## Navigation

`app/(tabs)/_layout.tsx` renders a custom bottom bar with four equal items: Missions, Report,
My reports, Me. Report is an action, not a tab: a terracotta plus that opens the item picker
(`/report/pick`), never a default task. The guided report flow (`app/report/*`) and the detail
screens (`app/task/[id]`, `app/status/[id]`, `app/help`) are plain stack screens with in-screen
back controls.

## Missions home

`app/(tabs)/index.tsx` merges the old Home and Tasks tabs (Alternative C, screen 1). Top to
bottom: `BrandMark` + `OfflinePill` (only without signal), time-of-day greeting, a private
contribution strip counting **confirmed reports** (never "helped", see `src/home.ts`), resume and
saved-on-this-phone notices, then "Missions near you · Approximate areas only" with a List / Map
toggle. List shows a short map preview; Map shows a tall one. Both draw 5-char cells as shaded
rectangles with no centre pin (`CellMap`). Mission rows use `CategoryBadge` (soft category tint +
category icon), the first closed question, and "Nearby area" or a rounded distance. A final row
opens the full catalog.

## Report flow

`src/report-draft.ts` holds the in-memory draft (photos, answers, coarse area) for the report
being built now. On "Finish report" it calls the existing `src/capture.ts` path once per photo:
`captureProof` -> `enqueueProof`, status `pending_sync`. No new protocol, no new proof fields, no
endpoint or sync-retry change. The auto-sync loop drains the queue exactly as before.

The flow is presented as four steps via `ReportProgress` ("Step X of 4 · label"): 1 Instructions
(`report/intro`), 2 Capture (`report/capture`), 3 Questions (`report/questions`), 4 Review
(`report/location` area confirm, then `report/review`). Questions are large Yes / No / "I could
not confirm" controls, one at a time, no free text, no PII.

Review is the evidence sheet (Alternative C, screen 2): `CategoryBadge` + task title, the
approximate area on a `CellMap` with the chip "Showing an approximate area (not exact location)",
numbered round photo slots (tap one to retake just that photo: `capture?retake=1` returns to
Review), the chosen answers under "Current condition" (tap to change), and **one optional note**.
The note is capped at 280 characters with a counter from 200, sanitised in `src/report-note.ts`,
persisted with the draft, and after saving kept on this phone only (`report-notes/notes.json`,
keyed by the local reportId, shown on `status/[id]` as "Your private note"). It is never passed to
`captureProof`, so it never reaches the signed payload, the api or the chain. The only action is
"Save report".

## Contribution (Pilot 1)

No reward, points, gift, token, cash, or leaderboard wording anywhere (grep-verified: 0 hits).
The Me screen shows a **private contribution summary** ("Your contribution — N reports confirmed
· M programme activities supported"), visible only to the reporter and never linked to a public
report. Full model in `docs/pilot_engagement.md`.

## Feedback and celebration

`src/feedback.ts` is the only module that touches `expo-haptics`. It exposes `tap` / `bump` /
`thud` (impact) and `success` / `warn` (notification); every call checks the persisted
`hapticsEnabled` flag and swallows any throw so a device with no haptic engine never breaks the
flow. Micro-haptics are one call per action, never in a loop: photo accepted (`tap`), Finish
report (`bump`).

Two guided moments, both on mount, both gated by `celebrationsAllowed()` (false when the reporter
turned celebrations off OR the OS reduce-motion setting is on):

- `report/saved` — 2.0s (`MOMENT_SAVED_MS`). `success()` haptic, the card eases up, a small lock
  icon settles over the check, then the actions fade in. Calm, not a party.
- `report/sent` — 2.5s (`MOMENT_SENT_MS`). `success()` then `thud()` at 150ms, a top-center
  confetti burst (`react-native-confetti-cannon`, Animated-based, Expo Go safe), and a
  congratulations block that names what the reporter helped document. When celebrations are not
  allowed: no confetti, no motion, both haptics still fire, static success state.

The "Celebrations and motion" and "Haptics" toggles live on the Me screen under Accessibility.

Reporters capture outdoors in daylight; the app commits to a single high-contrast light theme.
`app.json` sets `userInterfaceStyle: "light"`, `_layout.tsx` sets `<StatusBar style="dark" />`,
and `src/theme.ts` carries one light-only token set. Dark mode is a post-hackathon item.

## Rules

- Em-dash is banned in UI copy.
- One primary action per screen.
- Offline-saved uses success styling, never error styling.
- Original media is described as private; nothing uploads without the existing consent path.
- Empty, loading, offline, sending, success, partial-success, and error states are designed.
- Status is readable without colour: a dot plus the word, never colour alone.
