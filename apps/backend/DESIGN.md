<!-- apps/backend/DESIGN.md: design tokens and rules for the Prufture public site.
     Covers the landing, /verify/[hash], and the /dashboard operational routes.
     Distinct from apps/frontend/DESIGN.md, which governs the reporter Expo app. -->

# Design - Prufture web

Two audiences on one codebase: the public trust surface (landing, /verify) and the stakeholder
dashboard. Both keep a calm infrastructure identity, not a pitch. The reporter app carries the
warm scratch palette; the web keeps the neutral blue token set already documented here.

## Dials

- DESIGN_VARIANCE 5: one asymmetric moment on the landing (1.5fr copy vs 1fr "what a report
  carries" card). Every public page is otherwise a single calm column.
- MOTION_INTENSITY 2: one 0.22s fade-in per view, gated behind `prefers-reduced-motion`.
- VISUAL_DENSITY 3 on landing and /verify, 7 on the dashboard (sidebar, metric grid, filter row,
  dense operational table).

## Tokens

All tokens live in `app/globals.css` as CSS custom properties. Components use the classes
(`.card`, `.pill`, `.btn`, `.field`, `.fields`, `.data`, `.filters`, `.steps`, `.timeline`,
`.tech`, `.dash*`, `.metric`, `.attn-item`) and never inline raw hex or px.

- Colour: one brand blue, a neutral surface ramp, four status tints (ok / wait / attn / info).
  Full light and dark palettes; dark via `prefers-color-scheme`.
- Type: fluid `h1` via `clamp()`, fixed `h2`/`h3`, 16px body. Monospace only for the coarse
  region and the public reference.
- Spacing: 4 / 8 / 12 / 16 / 24 / 40 / 64. Radius: 8 / 12 / 20 / pill.

## Language

The public journey speaks plainly. `/verify` lifecycle: Report received / Waiting for more
confirmation / Report confirmed, plus honest "Report not found" and "Verification temporarily
unavailable". The dashboard uses: Ready to review / Needs another report / Confirmed / Needs
attention. The full public reference and any external-record link live only inside a collapsed
`<details class="tech">` section.

## Dashboard shell

`app/dashboard/layout.tsx` + `Sidebar.tsx`: persistent left sidebar (Overview, Reports,
Programmes, Communities, Alerts, Exports, Settings) with `aria-current` on the active section,
and a full-width `.dash-main`. Designed for 1280-1920 px. Below 960 px the sidebar becomes a
horizontal scroller and a "built for desktop" note shows; the report table always scrolls inside
`.table-scroll`, never the page. All aggregation is pure (`lib/dashboard.ts`) over the coarse
`/proofs` list; no new API endpoint, no invented approve/reject action (review actions are shown
disabled and labelled).

## Rules

- Em-dash is banned in UI copy.
- `overflow-x: hidden` on html/body; wide tables scroll inside `.table-scroll`.
- Touch targets at least 44px (`.btn`, `.field`).
- Focus-visible outlines kept on every interactive element.
- Only coarse regions render: no full geohash, no lat/lng, no reporter identity, ever, including
  in serialized props and hidden attributes. Verified by a view-source scan.
- `/verify/[hash]` requires no login and never will.
- Degraded API renders an honest banner and a high-priority alert, never a fake empty state.
