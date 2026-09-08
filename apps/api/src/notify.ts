// notify.ts: best-effort "a report arrived" ping to the PROGRAMME team (never the reporter).
// On /sync (and optionally /attest) send ONLY the public verifyUrl to fixed, env-configured
// recipients. One message per report (dedup by reportId, else proofHash). A down channel never
// fails the sync — the proof is already stored; the notification is best-effort and never throws.

import { env, notifyOnTrigger } from "./env.js";
import { sendVerifyUrl, type Channel } from "./channels.js";
import { markNotified, reportKeyFor, wasNotified, type Entry } from "./store.js";

const VERIFY_BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";

export interface NotifyOutcome {
  /** dedup key that was (or would be) marked notified — a reportId or a proofHash, never PII */
  reportKey: string;
  skipped: "disabled" | "trigger" | "deduped" | "no-recipient" | null;
  whatsapp: boolean;
  email: boolean;
}

/**
 * Fire the programme notification for `entry` if enabled for `trigger` and not already sent.
 * Awaitable, but its result never changes the caller's response and it can never throw.
 */
export async function maybeNotify(entry: Entry, trigger: "sync" | "attest"): Promise<NotifyOutcome> {
  const reportKey = reportKeyFor(entry);
  const outcome: NotifyOutcome = { reportKey, skipped: null, whatsapp: false, email: false };

  try {
    if (!env.notifyEnabled) return log({ ...outcome, skipped: "disabled" });
    if (!notifyOnTrigger(trigger)) return log({ ...outcome, skipped: "trigger" });
    if (wasNotified(reportKey)) return log({ ...outcome, skipped: "deduped" });

    const recipients: { channel: Channel; to: string }[] = [];
    if (env.programmeWhatsapp) recipients.push({ channel: "whatsapp", to: env.programmeWhatsapp });
    if (env.programmeEmail) recipients.push({ channel: "email", to: env.programmeEmail });
    if (recipients.length === 0) return log({ ...outcome, skipped: "no-recipient" });

    // Representative proof of the report: the entry that first synced (this one).
    const url = `${VERIFY_BASE}/verify/${entry.payload.proofHash}`;

    for (const { channel, to } of recipients) {
      const res = await sendVerifyUrl(channel, to, url); // guarded: never throws
      if (channel === "whatsapp") outcome.whatsapp = res.available;
      if (channel === "email") outcome.email = res.available;
    }

    // Only lock the dedup key once at least one channel actually delivered, so an all-degraded
    // attempt retries on the next sync/attest for the same report.
    if (outcome.whatsapp || outcome.email) markNotified(reportKey);
  } catch {
    // Best-effort by contract: swallow everything.
  }
  return log(outcome);
}

// Log shape carries NO recipient value, NO url, NO PII — just the dedup key and per-channel bools.
function log(o: NotifyOutcome): NotifyOutcome {
  console.log(
    `notify ${JSON.stringify({ reportKey: o.reportKey, whatsapp: o.whatsapp, email: o.email, skipped: o.skipped })}`,
  );
  return o;
}
