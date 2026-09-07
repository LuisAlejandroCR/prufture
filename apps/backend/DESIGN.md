<!-- apps/backend/DESIGN.md: design tokens and rules for the Prufture public site.
     Covers the landing, /verify/[hash] and /dashboard routes.
     Distinct from apps/frontend/DESIGN.md, which governs the volunteer Expo app. -->

# Design — Prufture web

The public trust surface. It has to look like infrastructure someone can rely on, not a pitch.

## Dials

- DESIGN_VARIANCE 4: one confident asymmetric moment (the landing hero: 1.55fr copy against a
  1fr "what goes public" card). Every other page is a single calm column.
- MOTION_INTENSITY 2: a single 0.22s fade-in per view, gated behind `prefers-reduced-motion`.
- VISUAL_DENSITY 3 on the landing and verify page, 5 on the dashboard (filter row, summary line,
  compact data table).

## Tokens

All tokens live in `app/globals.css` as CSS custom properties. Components use the classes
(`.card`, `.pill`, `.btn`, `.field`, `.fields`, `.data`, `.filters`, `.lede`, `.muted`, `.faint`)
and never inline raw hex or px.

- Color: one brand blue, a neutral surface ramp, and two status tints (ok green / wait amber).
  Full light and dark palettes; dark switches via `prefers-color-scheme`.
- Type: fluid `h1` via `clamp()`, fixed `h2`, 16px body. Monospace only for hashes and regions.
- Spacing scale: 4 / 8 / 12 / 16 / 24 / 40 / 64.
- Radius: 8 / 12 / 20 / pill.

## Rules

- Em-dash is banned in UI copy.
- No body horizontal scroll: `overflow-x: hidden` on the shell, wide tables scroll inside
  `.table-scroll`.
- Touch targets are at least 44px (`.btn`, `.field`).
- The three verify states (ok / not indexed / unreachable) are all honest and never imply a
  guarantee the code does not provide.
- Only coarse regions render. No full geohash, no lat/lng, no volunteer identity, ever.
- Focus-visible outlines are kept on all interactive elements.
