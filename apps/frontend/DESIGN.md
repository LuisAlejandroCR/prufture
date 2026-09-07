<!-- apps/frontend/DESIGN.md: design tokens and rules for the Prufture Expo app.
     Covers the volunteer-facing capture and queue screens only.
     Distinct from apps/backend/DESIGN.md, which governs the public web verifier. -->

# Design — Prufture mobile

Humanitarian field tool, not a startup splash. Calm, legible, one task per screen.

## Dials

- DESIGN_VARIANCE 4: conventional vertical layout, trust over flair.
- MOTION_INTENSITY 2: state transitions only (a new queue row eases in). Respects reduce-motion.
- VISUAL_DENSITY 3: large targets, generous spacing, one primary action visible at a time.

## Tokens

All tokens live in `src/theme.ts`. Screens import `color`, `space`, `radius`, `type`, `target`,
`motion` and never inline raw hex or px.

- Color: single brand blue `#1560d4`; status is carried by three tinted pills
  (pending / synced / attested), each with an accessible text color.
- Type scale: display / title / body / meta / action. No other sizes.
- Spacing: 4 / 8 / 12 / 16 / 24 / 40.
- Radius: 8 (chips), 12 (cards, buttons), 999 (pills).
- Targets: 44px minimum, 56px for the primary capture and CTA buttons.

## Rules

- Em-dash is banned in UI copy.
- Every screen states what leaves the device (queue screen footer line).
- Busy and error states are always explicit: the capture button shows a spinner plus "Signing…"
  and errors render in a tinted box with a polite live region.
- Status must be readable at a glance: color + word, never color alone.
