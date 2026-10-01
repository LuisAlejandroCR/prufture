// onesignal.ts: programme-wide push notices through OneSignal, which replaced the Expo push tokens
// the api used to collect (and never sent to). Phase 1 is broadcast only: a notice goes to every
// device subscribed in the programme's OneSignal app, carries only its own text, and the api stores
// no push token or subscription. Off unless ONESIGNAL_APP_ID and ONESIGNAL_REST_API_KEY are set;
// a missing key or a refused call degrades typed and never throws.

import { ok, unavailable, type ExternalResult } from "@proof/core";
import { env } from "./env.js";

export const ONESIGNAL_URL = "https://api.onesignal.com/notifications?c=push";
const TIMEOUT_MS = 8_000;
const MAX_TEXT = 200;

export interface ProgrammeNotice {
  heading: string;
  body: string;
}

export function pushNoticesConfigured(): boolean {
  return env.oneSignalAppId !== "" && env.oneSignalRestApiKey !== "";
}

/** Send one notice to the programme's subscribed devices. Never throws. */
export async function sendProgrammeNotice(notice: ProgrammeNotice): Promise<ExternalResult<{ sent: true }>> {
  if (!pushNoticesConfigured()) return unavailable("onesignal", "ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY not set");
  try {
    const res = await fetch(ONESIGNAL_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Key ${env.oneSignalRestApiKey}` },
      body: JSON.stringify({
        app_id: env.oneSignalAppId,
        target_channel: "push",
        included_segments: [env.oneSignalSegment],
        headings: { en: notice.heading.slice(0, MAX_TEXT) },
        contents: { en: notice.body.slice(0, MAX_TEXT) },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return unavailable("onesignal", `onesignal answered ${res.status}`);
    return ok("onesignal", { sent: true });
  } catch {
    return unavailable("onesignal", "onesignal unreachable");
  }
}
