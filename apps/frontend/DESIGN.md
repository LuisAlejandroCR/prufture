<!-- apps/frontend/DESIGN.md: design tokens and rules for the Prufture reporter app.
     Covers the guided report flow and the five bottom-nav screens.
     Distinct from apps/backend/DESIGN.md, which governs the public web verifier and dashboard. -->

# Design - Prufture mobile

Humanitarian field tool, not a startup splash. Calm, guided, one task per screen. The reporter
never needs to know anything about wallets, keys, hashes, or chains.

## Dials

- DESIGN_VARIANCE 5: mostly conventional vertical layout; asymmetry only where it aids focus
  (the raised Report control in the tab bar, the recommended-task card on Home).
- MOTION_INTENSITY 2: state transitions only (queue row ease-in, help row expand, stack slide).
  Respects reduce-motion via `AccessibilityInfo.isReduceMotionEnabled`.
- VISUAL_DENSITY 3: large targets, generous spacing, one primary action visible at a time.

## Tokens

All tokens live in `src/theme.ts`. Screens import `color`, `space`, `radius`, `shadow`, `type`,
`target`, `motion`, `statusStyle`, `friendlyStatus` and never inline raw hex or px.

- Colour: warm ivory ground `#FBF6EF`, white surface, terracotta primary `#C8533A`, muted brown
  text. Four status tints: sage (confirmed), amber (waiting), pink (attention), blue (sending).
  Contrast checked against background and surface for WCAG AA.
- Type scale: display / title / subtitle / body / meta / action. No other sizes.
- Spacing: 4 / 8 / 12 / 16 / 24 / 40. Radius: 10 / 14 / 20 / pill.
- Targets: 44px minimum, 56px for the primary and capture buttons.

## Product language

The reporter journey uses friendly words only. `friendlyStatus()` maps the stored queue status
to: Ready to send / Sending / Sent / Waiting for another report / Confirmed / Needs your attention.
The words blockchain, wallet, gas, relayer, hash, signature, attestation, transaction, and
zero-knowledge do not appear in any screen. `status/[id].tsx` keeps a collapsed "Technical
details" section for demo or expert users; it still shows no PII and no exact location.

## Icons

`src/components/icons/Icon.tsx` is the single SVG set (`react-native-svg`). Unselected nav icons
are outlined, selected are filled and sit on a `primarySoft` pill. Every icon-only control carries
an `accessibilityLabel`. No emoji as interface icons.

## Navigation

`app/(tabs)/_layout.tsx` renders a custom bottom bar: Home, Tasks, [Report], Updates, Me. Report
is a raised terracotta control that opens `/report/intro` for the recommended task. The guided
report flow (`app/report/*`) and the detail screens (`app/task/[id]`, `app/status/[id]`,
`app/help`) are plain stack screens with in-screen back controls.

## Report flow

`src/report-draft.ts` holds the in-memory draft (photos, answers, coarse area) for the report
being built now. On "Finish report" it calls the existing `src/capture.ts` path once per photo:
`captureProof` -> `enqueueProof`, status `pending_sync`. No new protocol, no new proof fields, no
endpoint or sync-retry change. The auto-sync loop drains the queue exactly as before.

## Theme

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
