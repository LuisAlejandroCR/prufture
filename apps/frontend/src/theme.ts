// theme.ts: single source of design tokens for the Prufture reporter app — one warm humanitarian
// palette (ivory ground, terracotta primary, sage / amber / blue / pink status). Screens import these
// tokens and never inline raw hex or px.

// DESIGN_VARIANCE 4 / MOTION_INTENSITY 2 / VISUAL_DENSITY 3 (mobile). Calm and guided:
// one primary action per screen, generous spacing, large targets, no gradients.

// Contrast (WCAG AA, computed 2026-09-07):
//   text #1C1208   on #FBF6EF -> 15.0:1   on #FFFFFF -> 16.1:1  (pass, body)
//   muted #806F5C  on #FBF6EF -> 4.50:1   on #FFFFFF -> 4.83:1  (pass, body >= 4.5)
//   disabled #B8A998 is decorative / disabled-state only, never body text.
//   Status pills and notices render their label in `text`; the hue is carried by the
//   dot / icon only, so no low-contrast soft-on-solid text pair is ever used.

export const color = {
  // Surfaces
  background: "#FBF6EF",
  surface: "#FFFFFF",
  surfaceSoft: "#F7F2EA",
  border: "#EDE5D8",

  // Text
  text: "#1C1208",
  muted: "#806F5C",
  faint: "#806F5C",
  disabled: "#B8A998",
  onPrimary: "#FFFFFF",

  // Primary action (terracotta)
  primary: "#C8533A",
  primaryPressed: "#A8402B",
  primarySoft: "#FDF0EC",

  // Status: sent / confirmed / privacy-safe (sage)
  success: "#3D9970",
  successSoft: "#EBF7F2",
  // Status: waiting / attention (amber)
  warning: "#C88720",
  warningSoft: "#FDF5E6",
  // Status: sending / in progress / information (blue)
  information: "#2982A1",
  informationSoft: "#E7F3F8",
  // Health category ONLY (pink)
  attention: "#C04B7A",
  attentionSoft: "#FBEAF1",

  // Programme category accents (small dots and tint chips only)
  education: "#2982A1",
  water: "#3D9970",
  health: "#C04B7A",
  nutrition: "#C88720",
  training: "#806F5C",
  protection: "#6B5CA5",
  climate: "#4E7D2F",
} as const;

// Soft tint behind each programme category icon (mission rows, catalog tiles).
export const categorySoft = {
  education: color.informationSoft,
  water: color.successSoft,
  health: color.attentionSoft,
  nutrition: color.warningSoft,
  protection: "#F0EDF8",
  climate: "#EEF4E8",
} as const;

// Illustration palette (Illustration.tsx only): warm sun, sage hills, leaf greens, soil.
export const illustration = {
  sun: "#F2C27B",
  sunSoft: "#FBE7C6",
  hillFar: "#CFE0C8",
  hillNear: "#A9C79B",
  leaf: "#5E9C63",
  stem: "#4A7D4F",
  soil: "#E4D3BC",
  soilDark: "#D2BC9E",
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
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 6,
  },
} as const;

// Type scale (humanist sans, phone): page title 28 / section 20 / card 17 / body 15
// / support 13 / label 11. No landing-page-sized type inside the app.
export const type = {
  display: { fontSize: 28, fontWeight: "700" as const, letterSpacing: -0.4, lineHeight: 34 },
  title: { fontSize: 20, fontWeight: "700" as const, letterSpacing: -0.2, lineHeight: 26 },
  subtitle: { fontSize: 17, fontWeight: "600" as const, lineHeight: 23 },
  body: { fontSize: 15, fontWeight: "400" as const, lineHeight: 22 },
  meta: { fontSize: 13, fontWeight: "400" as const, lineHeight: 18 },
  label: { fontSize: 11, fontWeight: "700" as const, letterSpacing: 0.6, lineHeight: 14 },
  action: { fontSize: 17, fontWeight: "700" as const, letterSpacing: 0.1 },
} as const;

// iOS Larger Text (Dynamic Type) scales text up to about 3x. Body copy scales freely; these caps
// apply only to text locked inside a fixed-size shape. iOS itself barely grows tab bar labels.
export const maxTextScale = { tabLabel: 1.2, badge: 1.3 } as const;

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

export const statusStyle: Record<FriendlyStatus, { label: string; tint: string; hue: string }> = {
  ready: { label: "Ready to send", tint: color.warningSoft, hue: color.warning },
  sending: { label: "Sending", tint: color.informationSoft, hue: color.information },
  sent: { label: "Sent", tint: color.informationSoft, hue: color.information },
  waiting: { label: "Waiting for another community report", tint: color.warningSoft, hue: color.warning },
  confirmed: { label: "Confirmed", tint: color.successSoft, hue: color.success },
  attention: { label: "Needs your attention", tint: color.attentionSoft, hue: color.attention },
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
