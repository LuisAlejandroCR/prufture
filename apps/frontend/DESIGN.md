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
- Larger Text (iOS Dynamic Type) is honoured: body copy scales without a cap. Only text locked in
  a fixed-size shape is capped through `maxTextScale` in `src/theme.ts`: tab bar labels 1.2x (iOS
  barely grows its own tab labels) and the photo-slot step number 1.3x inside its 26px circle. The
  Report "+" is a glyph, not copy, so it does not scale. Never set `allowFontScaling={false}` on copy.
  Because tab labels are capped, each tab item (and Report) sets `accessibilityShowsLargeContentViewer`
  with its label as `accessibilityLargeContentTitle`: at accessibility text sizes a long press shows
  the iOS Large Content Viewer, as the system tab bar does.
- Targets: 44px minimum, 56px for the primary and capture buttons.

## Product language

The reporter journey uses friendly words only. `friendlyStatus()` maps the stored queue status
to: Ready to send / Sending / Sent / Being recorded / Recorded publicly / Needs your attention.
"Recorded publicly" is the on-chain record, never a community confirmation: "Confirmed" is used
only once an assignment's community count is met (`src/progress.ts`).
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
(`/report/pick`), never a default task. The bar emits React Navigation's `tabPress` event (`src/tab-press.ts`):
tapping another tab navigates; tapping the tab you are on scrolls that page back to the top, the
iOS convention, via `useScrollToTop` in `Screen` and on the My reports list. The guided report flow (`app/report/*`) and the detail
screens (`app/task/[id]`, `app/status/[id]`, `app/help`) are plain stack screens with in-screen
back controls.

## Missions home

`app/(tabs)/index.tsx` merges the old Home and Tasks tabs (Alternative C, screen 1). Top to
bottom: `BrandMark` + `OfflinePill` (only without signal), time-of-day greeting, a private
contribution strip counting **recorded reports** (never "helped", see `src/home.ts`), resume and
saved-on-this-phone notices, then "Missions near you · Approximate areas only" with a List / Map
toggle. A mission is reportable only within 25 km of the reporter's cell (`REPORTABLE_KM`,
checked on the phone); the rest are listed view-only under "Missions around the world", and the
map still shows every mission. Self-started reports work anywhere. List shows a short map preview; Map shows a tall one. Both draw 5-char cells as shaded
rectangles with no centre pin (`CellMap`). Mission rows use `CategoryBadge` (soft category tint +
category icon), the first closed question, and "Nearby area" or a rounded distance. A final row
opens the full catalog.

## Polish (Alternative C)

- Every icon container is round: `Row`, Help, Intro facts and the Accessibility toggles match
  `CategoryBadge`.
- My reports rows lead with the task's `CategoryBadge`, like Missions.
- Missions remembers List or Map across launches (`src/view-pref.ts`, secure store, default List).
- While `EXAMPLE_ASSIGNMENTS` is true, Missions shows "Example missions for this pilot", so demo
  data is never presented as live programme work.
- `Appear` fades list rows up with a 40 ms stagger (audit motion table), capped at 8 steps, and
  renders in place under reduce motion or with celebrations off.

## Flow integrity

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
- My reports: All / In progress / Recorded chips with counts (`src/report-groups.ts`; "In
  progress" = ready or waiting; counts always add up to All), with a calm empty line per filter.
- Missions: pull to refresh re-runs the waiting-report sync; `Screen` takes optional
  `onRefresh` / `refreshing`.

## Me

`app/(tabs)/me.tsx` is short rows only; each opens its own screen. Top to bottom: a one-line
contribution summary; **Your checks** (Face check, Programme pass; shown only when their flags
are on); **Settings** (Data and privacy, Offline storage, Accessibility); **For coordinators**
(Coordinator review); **Support** (Help, Contact support, Privacy policy, About Prufture). The
programme pass code and its enrolment copy live on `app/programme-pass.tsx`, the Haptics and
motion switches on `app/accessibility.tsx`. There is no Language row (English only) and no second
"waiting to send" banner: the Offline storage row already says it.

## Coordinator review

`app/coordinator.tsx` is the paid screen. It opens with a summary card (To review / Accepted /
Rejected and the most reported activities), then **Email summary** (the phone's own mail app,
no recipient, counts only), then the Accept / Reject list. The full list and the CSV export stay
on the web dashboard. The api decides what the list holds: the programme's staff get its real
reports; any other subscriber gets a sample inbox (`x-prufture-sample: 1`). A sample inbox
opens with an info notice ("Sample reports. Your programme's reports appear here once the
programme team adds your account…") and hides Email summary, so sample rows are never mistaken
for, or sent as, a programme's work.

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
within about 1 degree of the nearest one. The city centre (`cityCentreForCell`, geocoded) only
helps frame that view. No map draws a pin or dot, not even for the reporter's own area: a point at
a cell centre implies a precision the data does not have (`test/cell-map-privacy.test.ts`). Cells
stay tappable polygons.

`Data and privacy` (from Me) is the one place that lists what a report keeps and shares, including
the precise point sealed on-device to the programme key when one is configured
(`src/location-seal.ts`); Help links there instead of repeating it. `About` shows the app version only.

## Report flow

`src/report-draft.ts` holds the in-memory draft (photos, answers, coarse area) for the report
being built now. On "Finish report" it calls the existing `src/capture.ts` path once per photo:
`captureProof` -> `enqueueProof`, status `pending_sync`. No new protocol, no new proof fields, no
endpoint or sync-retry change. The auto-sync loop drains the queue exactly as before.

The flow is presented as four steps via `ReportProgress` ("Step X of 4 · label"): 1 Instructions
(`report/intro`), 2 Capture (`report/capture`), 3 Questions (`report/questions`), 4 Review
(`report/location` area confirm, then `report/review`). Questions are large Yes / No / "I could
not confirm" controls, one at a time, no free text, no PII.

Each question is its own stack screen (`report/questions?q=N`, `src/question-flow.ts`), so the iOS
edge swipe, Android back and the in-screen Back all return to the previous question instead of
leaving the step. Resuming a draft opens the first unanswered required question. Edits from Review
never stack a second Review: "Change" opens that exact question with `from=review` and its Next
pops back, a retaken photo pops back too, and Review re-reads the draft when it regains focus.

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
My reports opens with a **private contribution card** (growth scene, "N reports recorded", "No
ranking. Every useful report counts."), and Me repeats the summary. N counts reports, not photos,
and only once every photo of a report is recorded publicly (`recordedReportCount`). Visible only
to the reporter and never linked to a public report. The report screen (`status/[id]`) shows a
compact horizontal stepper, Saved / Sent / Recorded, plus Confirmed for assignments that ask for
community confirmations, with one line for the current step. Confirmed is done only when the live
count of pass-confirmed nearby reports is met. The screen has one action (See public record) and
pull to refresh.

## Feedback and celebration

`src/feedback.ts` is the only module that touches `expo-haptics`. It exposes `tap` / `bump` /
`thud` (impact), `success` / `warn` (notification) and `select` (the iOS selection tick); every call checks the persisted
`hapticsEnabled` flag and swallows any throw so a device with no haptic engine never breaks the
flow. Micro-haptics are one call per action, never in a loop: photo accepted (`tap`), Finish
report (`bump`), a failed save on Review (`warn`). `select` follows the iOS rule of ticking only
when a choice changes: a different answer in Questions, another bottom tab, the List / Map toggle
and a category tile in the item picker. Re-tapping the current choice stays silent.

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

The "Celebrations and motion" and "Haptics" toggles live on their own Accessibility screen
(`app/accessibility.tsx`), reached from Me.

The live camera (`report/capture`) and the optional selfie check (`report/identity`) are the only
dark screens. The selfie check's large gesture glyph is decorative: it does not scale with Larger
Text and is hidden from VoiceOver, because the instruction below it says the same thing. Each
draws its own chrome, so it sets `<StatusBar style="light" />` while mounted (the root dark style
returns when it unmounts), pads its top bar and bottom controls with the real safe-area insets (`src/camera-frame.ts`, clearing the notch /
Dynamic Island and the home indicator), and takes every colour from `cameraColor` in
`src/theme.ts`, every text colour at least 4.5:1 on its ground (`track` is decorative only). `BackLink tone="onDark"` replaces `muted`, which
is only 3.9:1 there.

Reporters capture outdoors in daylight; the app commits to a single high-contrast light theme.
`app.json` sets `userInterfaceStyle: "light"`, `_layout.tsx` sets `<StatusBar style="dark" />`,
and `src/theme.ts` carries one light-only token set. Dark mode is a post-hackathon item.

## VoiceOver

Every screen works with VoiceOver, and `test/a11y-audit.test.ts` enforces it by parsing each screen
and shared component with the TypeScript compiler:

- Every `Pressable` has a role; one without visible text has a label. Every `TextInput` has a label.
  Every `Image` has a label or is explicitly decorative. Every route screen has a heading, so the
  rotor's Headings list works (the camera's instruction is the heading on the camera screens).
- Compound items read as one element (`accessible` + one label): photo slots, the contribution
  card, and each status stepper stage. A stage says in words what its dot shows in colour
  ("Done", "Current step", "Not yet", `stageSpoken` in `src/announce.ts`).
- Photos set `accessibilityIgnoresInvertColors`, so iOS Smart Invert never shows them as negatives.

iOS ignores `accessibilityLiveRegion` (Android only), so changes that do not change the screen are
spoken through `src/announce.ts` (`announceForAccessibilityWithOptions`): photo taken, each selfie
movement prompt and the result, save and camera failures, going offline / back online, and sync
results. Failures interrupt (high priority); progress queues behind current speech; background
news (a report sent or confirmed by the auto-sync) is low priority and never interrupts. A
background sync never speaks an error; a check the reporter asked for (pull to refresh, "Check for
updates") always gets an answer. Sends are never counted aloud, because the queue counts photos,
not reports. Nothing is spoken when no screen reader is running.

## Keyboard

`Screen` (`src/components/ui.tsx`) is keyboard aware through `src/keyboard.ts`. On iOS the keyboard
is drawn over the window, so the frame is a `KeyboardAvoidingView` with `padding` (the footer action
rises above the keyboard), the scroll view keeps the focused field in view
(`automaticallyAdjustKeyboardInsets`) and a downward drag dismisses the keyboard. Android resizes the
window itself, so it gets no extra padding and dismisses on drag. The Review note is multiline, so
its return key is "Done" and blurs the field instead of inserting a new line.

## Rules

- Em-dash is banned in UI copy.
- One primary action per screen.
- Offline-saved uses success styling, never error styling.
- Original media is described as private; nothing uploads without the existing consent path.
- Empty, loading, offline, sending, success, partial-success, and error states are designed.
- Status is readable without colour: a dot plus the word, never colour alone.
