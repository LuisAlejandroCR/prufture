// channels.ts: post-proof delivery behind one interface — sendVerifyUrl(channel, to, url).
// Every channel sends ONLY the public verifyUrl (never media, payload, identity or exact location)
// and degrades via guard(): a missing key or dead provider is a typed unavailable, never a throw.

import { guard, type ExternalResult } from "@proof/core";

export type Channel = "whatsapp" | "email" | "telegram";

export interface ChannelSendResult {
  channel: Channel;
  /** Provider-side id of the sent message, when the provider returns one. */
  providerId: string;
}

const env = (k: string): string => process.env[k] ?? "";

// Explicit budget per provider call, matching neuro.ts and entitlement.ts. /sync awaits the
// programme notification, so without this a hung provider held the reporter's sync open.
export const CHANNEL_TIMEOUT_MS = 5000;

/** fetch() with an abort after CHANNEL_TIMEOUT_MS, covering both headers and body. */
async function timedFetch<T>(url: string, init: RequestInit, read: (res: Response) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHANNEL_TIMEOUT_MS);
  try {
    return await read(await fetch(url, { ...init, signal: controller.signal }));
  } finally {
    clearTimeout(timer);
  }
}

function unconfigured(channel: Channel, missing: string): ExternalUnavailableLike {
  return {
    available: false,
    source: `channel/${channel}`,
    checkedAt: new Date().toISOString(),
    data: null,
    error: `channel not configured (${missing} missing)`,
  };
}

// Local alias so the helper above type-checks without importing the concrete type name.
type ExternalUnavailableLike = Extract<ExternalResult<ChannelSendResult>, { available: false }>;

/** Only the URL is ever transmitted. No task data, no PII, no media. */
export async function sendVerifyUrl(
  channel: Channel,
  to: string,
  url: string,
): Promise<ExternalResult<ChannelSendResult>> {
  switch (channel) {
    case "whatsapp":
      return sendWhatsApp(to, url);
    case "email":
      return sendEmail(to, url);
    case "telegram":
      return sendTelegram(to, url);
    default:
      return unconfigured(channel, "unknown channel");
  }
}

// Kapso is used as a thin wrapper over the WhatsApp Cloud API. Text message, URL only.
async function sendWhatsApp(to: string, url: string): Promise<ExternalResult<ChannelSendResult>> {
  const key = env("KAPSO_API_KEY");
  const phoneId = env("KAPSO_PHONE_NUMBER_ID");
  if (!key) return unconfigured("whatsapp", "KAPSO_API_KEY");
  if (!phoneId) return unconfigured("whatsapp", "KAPSO_PHONE_NUMBER_ID");
  const base = env("KAPSO_API_BASE") || "https://app.kapso.ai/api/v1";

  return guard("channel/whatsapp", async () => {
    const init = {
      method: "POST",
      headers: { "content-type": "application/json", "X-API-Key": key },
      body: JSON.stringify({ to, type: "text", text: { body: url } }),
    };
    return timedFetch(`${base}/whatsapp/phone_numbers/${phoneId}/messages`, init, async (res) => {
      const body = (await res.json().catch(() => ({}))) as { id?: string; message?: { id?: string }; error?: unknown };
      if (!res.ok) throw new Error(`kapso ${res.status}: ${JSON.stringify(body)}`);
      return { channel: "whatsapp" as const, providerId: body.id ?? body.message?.id ?? "" };
    });
  });
}

// Resend-compatible email API.
async function sendEmail(to: string, url: string): Promise<ExternalResult<ChannelSendResult>> {
  const key = env("EMAIL_API_KEY");
  const from = env("EMAIL_FROM");
  if (!key) return unconfigured("email", "EMAIL_API_KEY");
  if (!from) return unconfigured("email", "EMAIL_FROM");
  const base = env("EMAIL_API_BASE") || "https://api.resend.com";

  return guard("channel/email", async () => {
    const init = {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from,
        to,
        subject: "Prufture proof verification",
        text: `Verify this field proof:\n${url}\n\nNo volunteer identity or media is included.`,
      }),
    };
    return timedFetch(`${base}/emails`, init, async (res) => {
      const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!res.ok) throw new Error(`email ${res.status}: ${JSON.stringify(body)}`);
      return { channel: "email" as const, providerId: body.id ?? "" };
    });
  });
}

async function sendTelegram(to: string, url: string): Promise<ExternalResult<ChannelSendResult>> {
  const token = env("TELEGRAM_BOT_TOKEN");
  if (!token) return unconfigured("telegram", "TELEGRAM_BOT_TOKEN");

  return guard("channel/telegram", async () => {
    const init = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: to, text: url, disable_web_page_preview: false }),
    };
    return timedFetch(`https://api.telegram.org/bot${token}/sendMessage`, init, async (res) => {
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: { message_id?: number }; description?: string };
      if (!res.ok || !body.ok) throw new Error(`telegram ${res.status}: ${body.description ?? "send failed"}`);
      return { channel: "telegram" as const, providerId: String(body.result?.message_id ?? "") };
    });
  });
}
