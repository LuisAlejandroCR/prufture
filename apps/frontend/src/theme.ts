// theme.ts: single source of design tokens for the Prufture reporter app.
// Warm ivory ground, white surfaces, terracotta primary, muted brown text, and four
// status tints (sage / amber / pink / blue). Screens import these tokens and never
// inline raw hex or px. Distinct from src/capture.ts and src/queue.ts (logic, not style).

// DESIGN_VARIANCE 5 / MOTION_INTENSITY 2 / VISUAL_DENSITY 3 (mobile). Calm and guided:
// one primary action per screen, generous spacing, large targets.

export const color = {
  // Surfaces
  background: "#FBF6EF",
  surface: "#FFFFFF",
  surfaceSoft: "#F4ECE0",
  border: "#EAE0D1",

  // Text (contrast checked against background and surface for WCAG AA)
  text: "#1C1208",
  muted: "#63513C",
  faint: "#7A6952",
  onPrimary: "#FFFFFF",

  // Primary action
  primary: "#C8533A",
  primaryPressed: "#A8402B",
  primarySoft: "#FDF0EC",

  // Status: sent / confirmed / ok
  success: "#2C7350",
  successSoft: "#E7F3EC",
  // Status: waiting / ready to send
  warning: "#8A5A12",
  warningSoft: "#FAF1DF",
  // Status: needs attention
  attention: "#A2385D",
  attentionSoft: "#FAE8EF",
  // Status: sending / in progress / information
  information: "#1B647C",
  informationSoft: "#E4F0F4",

  // Programme category accents (small dots and tint chips only)
  education: "#1B647C",
  water: "#2C7350",
  health: "#A2385D",
  nutrition: "#8A5A12",
  training: "#63513C",
} as const;

// Selected bottom-navigation background tint.
export const navSelectedTint = color.primarySoft;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 40 } as const;

export const radius = { sm: 10, md: 14, lg: 20, pill: 999 } as const;

export const shadow = {
  card: {
    shadowColor: "#3A2A18",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  raised: {
    shadowColor: "#3A2A18",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
} as const;

export const type = {
  display: { fontSize: 26, fontWeight: "700" as const, letterSpacing: -0.4, lineHeight: 32 },
  title: { fontSize: 19, fontWeight: "700" as const, letterSpacing: -0.2, lineHeight: 25 },
  subtitle: { fontSize: 16, fontWeight: "600" as const, lineHeight: 22 },
  body: { fontSize: 15, fontWeight: "400" as const, lineHeight: 22 },
  meta: { fontSize: 13, fontWeight: "400" as const, lineHeight: 18 },
  action: { fontSize: 17, fontWeight: "700" as const, letterSpacing: 0.1 },
} as const;

// MOTION_INTENSITY 2: state transitions only. Callers gate these behind reduce-motion.
export const motion = { fast: 140, base: 200 } as const;

export const target = { min: 44, primary: 56 } as const;

// Reporter-facing status vocabulary. No sync or crypto words.
export type FriendlyStatus =
  | "ready" // pending_sync
  | "sending" // in-flight
  | "sent" // synced
  | "waiting" // synced, awaiting a second report
  | "confirmed" // attested
  | "attention"; // recoverable error

export const statusStyle: Record<FriendlyStatus, { label: string; bg: string; fg: string }> = {
  ready: { label: "Ready to send", bg: color.warningSoft, fg: color.warning },
  sending: { label: "Sending", bg: color.informationSoft, fg: color.information },
  sent: { label: "Sent", bg: color.informationSoft, fg: color.information },
  waiting: { label: "Waiting for another report", bg: color.warningSoft, fg: color.warning },
  confirmed: { label: "Confirmed", bg: color.successSoft, fg: color.success },
  attention: { label: "Needs your attention", bg: color.attentionSoft, fg: color.attention },
};

/** Map a stored queue status to the reporter-facing status. */
export function friendlyStatus(
  status: "pending_sync" | "synced" | "attested",
  attestationCount = 0,
): FriendlyStatus {
  if (status === "pending_sync") return "ready";
  if (status === "attested") return "confirmed";
  return attestationCount > 0 ? "confirmed" : "waiting";
}
