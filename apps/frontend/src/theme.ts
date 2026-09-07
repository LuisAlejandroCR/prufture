// theme.ts: single source of design tokens for the Expo app.
// Color, type scale, spacing, radius and motion derived once here; screens never
// hardcode raw hex or px. Distinct from src/capture.ts and src/queue.ts (logic, not style).

export const color = {
  bg: "#ffffff",
  surface: "#f6f7f9",
  border: "#e6e8ec",
  text: "#0f1720",
  textMuted: "#5b6672",
  textFaint: "#8a94a0",
  brand: "#1560d4",
  brandText: "#ffffff",
  pendingBg: "#fff4d6",
  pendingText: "#7a5b00",
  syncedBg: "#e2ecff",
  syncedText: "#1a3f8f",
  attestedBg: "#dff3e4",
  attestedText: "#136c39",
  danger: "#b00020",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 40 } as const;

export const radius = { sm: 8, md: 12, pill: 999 } as const;

export const type = {
  display: { fontSize: 24, fontWeight: "700" as const, letterSpacing: -0.3 },
  title: { fontSize: 17, fontWeight: "600" as const },
  body: { fontSize: 15, fontWeight: "400" as const },
  meta: { fontSize: 12, fontWeight: "400" as const },
  action: { fontSize: 16, fontWeight: "700" as const },
} as const;

// MOTION_INTENSITY 2: state transitions only, honoured by callers via LayoutAnimation.
export const motion = { fast: 160, base: 220 } as const;

export const target = { min: 44, primary: 56 } as const;
