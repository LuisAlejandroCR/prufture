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

## Polish (Alternative C)

- Every icon container is round: `Row`, Help, Intro facts and Me toggles match `CategoryBadge`.
- My reports rows lead with the task's `CategoryBadge`, like Missions.
- Missions remembers List or Map across launches (`src/view-pref.ts`, secure store, default List).
- While `EXAMPLE_ASSIGNMENTS` is true, Missions shows "Example missions for this pilot", so demo
  data is never presented as live programme work.
- `Appear` fades list rows up with a 40 ms stagger (audit motion table), capped at 8 steps, and
  renders in place under reduce motion or with celebrations off.

## Flow integrity

- A saved draft is never lost to a reload. `draft-store.persistDraft` keeps a photo whose URI is
  already its stored copy (copying it onto itself used to delete it, so Save found no bytes), and
  the report screens (permissions, identity, capture, questions, location, review) render through
  `useDraftReady`, which restores this task's persisted draft (`prepareDraft`) instead of starting an
  empty one over it. `saveDraft` returns content-free `reasons`; Review logs them to Metro and, for
  an unreadable photo, tells the reporter to retake it.

- Review enables "Save report" only when nothing is missing (`src/report-check.ts`): every photo
  step, every required answer, the approximate area. Otherwise an amber "N things left before
  saving" card lists each gap, and each row opens its fix.
- Every question shows on Review; "Change" / "Answer" opens that exact question
  (`questions?q=<index>&from=review`, one question, "Done" returns). Retake and Location opened from
  Review go back to the same Review instead of stacking a second one, and Review re-reads the draft
  on focus.
- Questions: choosing gives a light haptic and moves to the next question after 380 ms; the last
  question waits for Continue. Redirects run in an effect, never during render.
- Light haptic on catalog category tiles and on switching List / Map.

## Round 9 details

- Live camera: numbered step circles (sage check done, terracotta current, rails between) above
  the prompt, and a 260 ms white shutter flash over the viewfinder (skipped under reduce motion).
- Status opens with the shared `TaskHeader` (category circle + title).
- My reports: All / In progress / Confirmed chips with counts (`src/report-groups.ts`; "In
  progress" = ready or waiting; counts always add up to All), with a calm empty line per filter.
- Missions: pull to refresh re-runs the waiting-report sync; `Screen` takes optional
  `onRefresh` / `refreshing`.

## Links open in-app

Public pages never send the reporter out of Prufture. `src/links.ts` builds every URL from the one
`EXPO_PUBLIC_VERIFY_URL` base (a report's public record, and the site's about / privacy / support
pages), allows only https (or http on a local dev host), and opens them with `expo-web-browser` as
an in-app sheet (Safari View Controller / Custom Tabs) tinted ivory and terracotta; the system
browser is only a fallback. Status shows "See public record" once a report is sent; Me links About,
Privacy policy and Contact support. Links inside those pages (e.g. the external record) stay in the
same sheet.

## Keyboard and connection notices

Scrolling screens set `automaticallyAdjustKeyboardInsets`, so a focused field (the Review note)
scrolls above the iOS keyboard instead of under it. "Could not reach the server" on Missions
follows `showReachError` (`src/home.ts`): only online, only while reports are waiting, only when
the last pass failed for all of them. Offline is the Offline pill's job, and Missions re-syncs
when signal returns, so the notice never outlives a successful sync.

## Launch

App icon, adaptive icon, favicon, notification icon and native splash are all the sprout mark
(`assets/*.svg` rendered to PNG with `sharp`); the old shield is gone. The native splash shows the home
`BrandMark` sprout on a warm sun disc with "Prufture" below. `app/_layout.tsx` holds it
(`preventAutoHideAsync`) until the root view lays out, then hands off to `LaunchSplash`, which
starts from the same mark: sun disc swells, stem grows, right then left leaf unfold (back-eased),
wordmark and tagline rise in, short hold, then the overlay fades into Missions (about 1.9 s).
With reduce motion or celebrations off it shows the finished mark for 0.7 s and fades.

## Shared report pieces (Alternative C)

Every task and report screen is built from the same `src/components/ui.tsx` pieces, so the flow
reads as one product: `TaskHeader` (category circle, title, purpose), `EvidenceSteps` (numbered
round photo slots: dashed camera when empty, photo + sage check when taken, terracotta ring on the
current step), `AnswerChip` and the toned options in Questions (`src/answer-tone.ts`: sage check =
works, amber warning = missing / partial / broken, neutral info = could not check, so an unsure
answer never shows a success tick), and `InfoCard` (round icon, title, body) for offline,
permission, progress and privacy notes. Completion screens (Saved, Sending, Sent) share the
sun-and-sprout scene and side-by-side View status / Done actions.

## Maps

`src/map-region.ts` decides where a `CellMap` opens: centred on the reporter's approximate cell at
city zoom (`CITY_DELTA` about 20 km), never a world view; without a location it fits only cells
within about 1 degree of the nearest one. The reporter's own area gets one small terracotta dot at
the **centre of their city** (`cityCentreForCell`, geocoded; falls back to the cell centre offline).
Task cells never get a dot (`showCentre={false}`), because a point there implies false precision.

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
My reports opens with a **private contribution card** (growth scene, "N reports confirmed", "No
ranking. Every useful report counts."), and Me repeats the summary. N counts reports, not photos,
and only once every photo of a report is confirmed (`confirmedReportCount`). Visible only to the
reporter and never linked to a public report. The status timeline (`status/[id]`) shows Saved on
this phone / Sent to programme / Community reviewed / Confirmed, each with a one-line
description. Full model in `docs/pilot_engagement.md`.

## Feedback and celebration

`src/feedback.ts` is the only module that touches `expo-haptics`. It exposes `tap` / `bump` /
`thud` (impact) and `success` / `warn` (notification); every call checks the persisted
`hapticsEnabled` flag and swallows any throw so a device with no haptic engine never breaks the
flow. Micro-haptics are one call per action, never in a loop: photo accepted (`tap`), Finish
report (`bump`).

Two guided moments, both on mount, both gated by `celebrationsAllowed()` (false when the reporter
turned celebrations off OR the OS reduce-motion setting is on):

- `report/saved` — 2.0s (`MOMENT_SAVED_MS`). `success()` haptic, "Report saved safely" eases up
  under the sun-and-sprout scene (`Illustration scene="saved"`, inline SVG, no image assets), then
  View status / Done fade in. Assignments also show **Community progress** ("2 of 3
  confirmations", segmented bar) from structured `confirmations` data in `src/tasks.ts`; the
  label is derived (`src/progress.ts`), never hand-written. Calm, not a party.
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
