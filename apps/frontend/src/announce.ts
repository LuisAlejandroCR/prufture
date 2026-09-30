// announce.ts: what VoiceOver says when something changes but the screen does not (photo taken,
// selfie prompts, errors, going offline, sync results), plus the spoken form of a timeline stage.
// iOS ignores accessibilityLiveRegion (Android only), so announcements go through
// announceForAccessibilityWithOptions. Message builders are pure; announce() never throws.

export interface Announcement {
  text: string;
  /** high interrupts and cannot be cut off; default interrupts; low never interrupts (iOS). */
  priority: "low" | "default" | "high";
  /** Wait behind current speech instead of cutting it off (iOS). */
  queue: boolean;
}

const say = (text: string, priority: Announcement["priority"] = "default", queue = true): Announcement => ({
  text,
  priority,
  queue,
});

export function photoTaken(stepIndex: number, total: number): Announcement {
  return say(`Photo ${stepIndex + 1} of ${total} taken. Use photo, or take again.`);
}

export function gesturePrompt(index: number, total: number, label: string): Announcement {
  return say(`Movement ${index + 1} of ${total}. ${label}.`);
}

/** A state change on the same screen (e.g. the selfie check result), queued behind current speech. */
export function note(text: string): Announcement {
  return say(text);
}

/** Something the reporter tried did not work: interrupt so it is heard now. */
export function failure(text: string): Announcement {
  return say(text, "high", false);
}

/** Spoken only on a real change; the first reading after launch stays silent. */
export function connectivityChange(prev: boolean | null, next: boolean): Announcement | null {
  if (prev === null || prev === next) return null;
  return next
    ? say("Back online. Saved reports will send now.", "low")
    : say("Offline. Reports are saved on this phone and sync when online.", "low");
}

interface SyncCounts {
  attempted: number;
  synced: number;
  attested: number;
  failed: number;
}

/**
 * A background run speaks only good news, quietly. A check the reporter asked for (pull to
 * refresh, "Check for updates") always gets an answer, and an unreachable programme interrupts.
 * `synced` counts photos, not reports, so sends are never given a number.
 */
export function syncResult(s: SyncCounts, requested: boolean): Announcement | null {
  if (requested && s.failed > 0 && s.synced === 0 && s.attested === 0) {
    return failure("Could not reach the programme. Your reports are safe on this phone. Try again later.");
  }
  const parts: string[] = [];
  if (s.synced > 0) parts.push("Your saved reports were sent.");
  if (s.attested === 1) parts.push("A report was recorded publicly.");
  else if (s.attested > 1) parts.push(`${s.attested} reports were recorded publicly.`);
  if (parts.length === 0) return requested ? say("Checked. No new updates.") : null;
  return say(parts.join(" "), requested ? "default" : "low");
}

/** A status timeline stage as one sentence, stating what the dot's colour shows. */
export function stageSpoken(stage: { label: string; detail: string; done: boolean; current: boolean }): string {
  const state = stage.done ? "Done" : stage.current ? "Current step" : "Not yet";
  return `${stage.label}. ${state}. ${stage.detail}`;
}

type Announcer = {
  announceForAccessibility?: (text: string) => void;
  announceForAccessibilityWithOptions?: (text: string, options: { queue?: boolean; priority?: string }) => void;
};

let announcerOverride: Announcer | null = null;

async function loadAnnouncer(): Promise<Announcer | null> {
  if (announcerOverride) return announcerOverride;
  try {
    // Submodule path, not the "react-native" barrel (see src/feedback.ts): keeps Expo Go safe and
    // this file loadable under Node for tests.
    const mod = (await import(
      "react-native/Libraries/Components/AccessibilityInfo/AccessibilityInfo"
    )) as unknown as { AccessibilityInfo?: Announcer; default?: Announcer } & Announcer;
    return mod.AccessibilityInfo ?? mod.default ?? mod;
  } catch {
    return null;
  }
}

/** Speak `a` with VoiceOver / TalkBack. A no-op when no screen reader is running or a is null. */
export async function announce(a: Announcement | null): Promise<void> {
  if (!a) return;
  try {
    const ai = await loadAnnouncer();
    if (ai?.announceForAccessibilityWithOptions) {
      ai.announceForAccessibilityWithOptions(a.text, { queue: a.queue, priority: a.priority });
    } else {
      ai?.announceForAccessibility?.(a.text);
    }
  } catch {
    // Never break the flow over speech.
  }
}

/** Test seam only: inject a fake AccessibilityInfo. Pass null to clear. */
export function __setAnnouncerForTest(a: Announcer | null): void {
  announcerOverride = a;
}
